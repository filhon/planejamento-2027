"use client";

import Link from "next/link";
import { useMemo } from "react";
import { avaliavel, ehRenovacao } from "@/lib/agregar";
import {
  atribuir,
  ENVELOPE,
  montarCaixaAno,
  receitaDoSistema,
  type Alvos,
  type ChaveEnvelope,
} from "@/lib/envelopes";
import {
  FORA_DA_DIRETRIZ,
  montarDiretriz,
  type LinhaDiretriz,
} from "@/lib/rubricas";
import type { OrcamentoCiclo, ProjetoCiclo } from "@/lib/types";
import { usePainel } from "./contexto";
import {
  deltaPedido,
  fmtInt,
  fmtMoeda,
  num,
  pct,
  plural,
  setaVariacao,
} from "./formato";
import { Regua, Secao } from "./ui";

/**
 * Resumo Executivo: a tela de abertura da reunião (Fase 12).
 *
 * Responde, nesta ordem, as três perguntas da diretriz orçamentária do
 * presidente: **cabe no teto?**, **a divisão por envelope bate?** e **o que é
 * renovação e o que é projeto novo** (com nome, para a mesa poder cobrar).
 *
 * Base: os projetos **avaliáveis da remessa inteira**. Rejeitado, rascunho e
 * cancelado ficam fora porque não disputam o teto (em 2026 são R$ 7 mi que
 * inflavam toda a aderência). Os filtros globais NÃO valem aqui: a frase que
 * abre a reunião é lida em voz alta, e "149 projetos pedem R$ 7,5 mi, abaixo do
 * teto" depois de um atalho para as renovações era falso para a remessa. A lista
 * completa, que aceita recorte, ordenação e exportação, mora em Projetos & Pastas.
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

/** Quantos nomes cada lista curta mostra; o resto está em Projetos & Pastas. */
const LIMITE = 10;

/**
 * "R$ 591.122 acima do seu envelope": a conta que a mesa faria de cabeça.
 * Sem teto confiável não há envelope em reais, e sobra a aderência em
 * percentual, que é o que a diretriz diz de fato. `curto` corta o substantivo
 * na segunda metade da frase, onde ele já foi dito.
 */
function excedente(linha: LinhaDiretriz, curto = false): string {
  if (linha.envelope === null || linha.envelope <= 0 || linha.desvio === null) {
    return `${pct(linha.fracao)} do pedido para uma diretriz de ${pct(linha.alvo)}`;
  }
  const lado = linha.desvio > 0 ? "acima" : "abaixo";
  return `${fmtMoeda.format(Math.abs(linha.desvio))} ${lado}${
    curto ? "" : " do seu envelope"
  }`;
}

export default function Resumo({
  orcamentos,
  envelopes,
  caixas,
}: {
  orcamentos: Record<number, OrcamentoCiclo>;
  /** Envelope escolhido pela mesa, por projeto (Firestore, tela Envelopes). */
  envelopes: Record<string, ChaveEnvelope | null>;
  /** O que a mesa digitou no caixa da tela Envelopes, por ano. */
  caixas: Record<
    number,
    {
      receita: (number | null)[] | null;
      admin: (number | null)[] | null;
      saldoInicial: number | null;
      alvos?: Alvos | null;
    }
  >;
}) {
  const { ano, anoAnterior, ciclos, todos, projetos, filtroAtivo, aplicar } =
    usePainel();

  /**
   * Os atalhos desta página levam o recorte para Projetos & Pastas em vez de
   * recortar a própria tela: filtrar o Resumo por uma rubrica faria a tabela da
   * diretriz mostrar essa rubrica com 100% do pedido, verdade inútil.
   */
  const irPara = (parcial: Parameters<typeof aplicar>[0]) => () =>
    aplicar(parcial);

  const naMesa = useMemo(
    () => todos.filter((p) => avaliavel(p.status)),
    [todos],
  );
  const naMesaAntes = useMemo(
    () =>
      (ciclos.find((c) => c.ano === anoAnterior)?.projetos ?? []).filter((p) =>
        avaliavel(p.status),
      ),
    [ciclos, anoAnterior],
  );

  const orcamento = orcamentos[ano];
  /**
   * A base dos percentuais é a RECEITA (a mesma do caixa da tela Envelopes), não
   * o teto do sistema, que já vem sem o administrativo: com a fatia de 9,4% na
   * diretriz, aplicar sobre o teto descontava o administrativo duas vezes.
   */
  const caixa = useMemo(
    () =>
      montarCaixaAno(
        receitaDoSistema(orcamento),
        caixas[ano] ?? { receita: null, admin: null, saldoInicial: null },
      ),
    [orcamento, caixas, ano],
  );
  const teto = caixa.receita;
  /** O mesmo envelope da tela Envelopes: mesa › avaliação › categoria. */
  const chaveDe = useMemo(
    () => (p: ProjetoCiclo) => atribuir(p, envelopes[p.id]).chave,
    [envelopes],
  );
  const rotuloEnvelope = (p: ProjetoCiclo) => {
    const c = chaveDe(p);
    return c ? ENVELOPE[c].rotulo : "Sem envelope";
  };
  // Nada digitado = reserva (montarDiretriz marca como "estimado").
  const adminDigitado = caixa.adminDigitado.some(Boolean) ? caixa.admin : null;
  const diretriz = useMemo(
    () => montarDiretriz(naMesa, teto, chaveDe, adminDigitado, caixa.alvos),
    [naMesa, teto, chaveDe, adminDigitado, caixa.alvos],
  );

  /**
   * Régua histórica: quanto o conselho APROVOU em cada rubrica na remessa
   * anterior. Não é previsão: é o que aconteceu, e é o que diz se a diretriz
   * repete a prática ou a corrige. (Em 2026 não há um único aprovado; sem esta
   * coluna a tabela não teria nenhuma referência de realização.)
   */
  const antes = useMemo(
    () => montarDiretriz(naMesaAntes, null, chaveDe),
    [naMesaAntes, chaveDe],
  );
  const aprovadoAntes = useMemo(() => {
    const total = somar(naMesaAntes, (p) => p.aprovado);
    const porChave = new Map(
      antes.linhas.map((l) => [
        l.chave,
        somar(
          naMesaAntes.filter((p) => chaveDe(p) === l.chave),
          (p) => p.aprovado,
        ),
      ]),
    );
    return { total, porChave };
  }, [antes, naMesaAntes, chaveDe]);

  const renovacoes = useMemo(() => naMesa.filter(ehRenovacao), [naMesa]);
  const novos = useMemo(
    () =>
      naMesa
        .filter((p) => !ehRenovacao(p))
        .sort((a, b) => b.solicitado - a.solicitado),
    [naMesa],
  );

  /**
   * Renovação × novo por rubrica. A variação compara só as renovações que têm
   * base (o que recebeu antes): somar o pedido das que não têm faria o salto
   * parecer maior do que é.
   */
  const porRubrica = useMemo(
    () =>
      diretriz.linhas
        .filter((l) => !l.semProjetos)
        .map((l) => {
          const ren = renovacoes.filter((p) => chaveDe(p) === l.chave);
          const comBase = ren.filter(
            (p) => (p.revisao.recebidoAnterior ?? 0) > 0,
          );
          return {
            linha: l,
            recebido: somar(ren, (p) => p.revisao.recebidoAnterior),
            pedidoComBase: somar(comBase, (p) => p.solicitado),
            recebidoComBase: somar(comBase, (p) => p.revisao.recebidoAnterior),
          };
        }),
    [diretriz, renovacoes, chaveDe],
  );
  const totalRen = {
    pedido: somar(renovacoes, (p) => p.solicitado),
    recebido: somar(renovacoes, (p) => p.revisao.recebidoAnterior),
    pedidoComBase: porRubrica.reduce((s, r) => s + r.pedidoComBase, 0),
    recebidoComBase: porRubrica.reduce((s, r) => s + r.recebidoComBase, 0),
  };

  /** As renovações que pedem mais que o dobro do que receberam: o que a mesa cobra. */
  const dobram = useMemo(
    () =>
      renovacoes
        .filter(
          (p) =>
            (deltaPedido(p.solicitado, p.revisao.recebidoAnterior) ?? 0) > 1,
        )
        .sort(
          (a, b) =>
            b.solicitado -
            (b.revisao.recebidoAnterior ?? 0) -
            (a.solicitado - (a.revisao.recebidoAnterior ?? 0)),
        ),
    [renovacoes],
  );
  const aMaisDobram = somar(
    dobram,
    (p) => p.solicitado - (p.revisao.recebidoAnterior ?? 0),
  );
  const maioresNovos = novos.slice(0, LIMITE);

  /** Sem ciclo anterior (ou sem nada aprovado nele) a coluna histórica sai. */
  const temAntes = anoAnterior !== undefined && aprovadoAntes.total > 0;

  // O pedido da diretriz inclui os custos administrativos (digitados ou a
  // reserva); a frase "N projetos pedem" e a variação anual são só dos projetos.
  const pedidoProjetos = somar(naMesa, (p) => p.solicitado);
  const admin = diretriz.linhas.find((l) => l.semProjetos);
  const vao = teto === null ? null : diretriz.pedido - teto;
  const escala = Math.max(
    0.05,
    ...diretriz.linhas.map((l) => Math.abs(l.desvioPp)),
  );
  const pedidoAntes = somar(naMesaAntes, (p) => p.solicitado);
  const variacaoAno = pedidoAntes > 0 ? pedidoProjetos / pedidoAntes - 1 : null;

  if (naMesa.length === 0) {
    return (
      <p className="vazio">
        Nenhum projeto avaliável nesta remessa. Rejeitado, rascunho e cancelado
        ficam fora desta tela porque não disputam o teto.
      </p>
    );
  }

  return (
    <>
      {/* O veredito antes da tabela: é o que alguém lê em voz alta para abrir a
          reunião, e é montado dos mesmos números da tabela abaixo. A primeira
          frase é o título da página; o resto é o detalhe que fecha a conta. */}
      <div className="veredito">
        <h1>
          <b>{plural(diretriz.projetos, "projeto", "projetos")}</b> na mesa
          pedem <b>{fmtMoeda.format(pedidoProjetos)}</b>
          {vao === null ? (
            <> (a remessa não tem receita conhecida para comparar).</>
          ) : (
            <>
              ; com os custos administrativos
              {admin?.estimado ? " (reserva)" : ""}, a conta fica{" "}
              {vao > 0 ? (
                <b>{fmtMoeda.format(vao)} acima</b>
              ) : (
                <>{fmtMoeda.format(-vao)} abaixo</>
              )}{" "}
              da receita de {fmtMoeda.format(teto ?? 0)}.
            </>
          )}
        </h1>
        <p>
          São {plural(renovacoes.length, "renovação", "renovações")} e{" "}
          {plural(novos.length, "projeto novo", "projetos novos")}.{" "}
          {diretriz.acima === null ? (
            <>Na divisão da diretriz, todos os envelopes estão na faixa.</>
          ) : (
            <>
              Na divisão da diretriz, <b>{diretriz.acima.rotulo}</b> pede{" "}
              {excedente(diretriz.acima)}
              {diretriz.abaixo && (
                <>
                  ; <b>{diretriz.abaixo.rotulo}</b>,{" "}
                  {excedente(diretriz.abaixo, true)}
                </>
              )}
              .
            </>
          )}
          {diretriz.cortar !== null &&
            diretriz.remanejar !== null &&
            (diretriz.cortar > 0 || diretriz.remanejar > 0) && (
              <>
                {" "}
                A mesa fecha{" "}
                {diretriz.cortar > 0 && (
                  <>
                    <b>cortar {fmtMoeda.format(diretriz.cortar)}</b>
                  </>
                )}
                {diretriz.cortar > 0 && diretriz.remanejar > 0 && " e "}
                {diretriz.remanejar > 0 && (
                  <>
                    <b>remanejar {fmtMoeda.format(diretriz.remanejar)}</b> entre
                    envelopes
                  </>
                )}
                .
              </>
            )}
        </p>
      </div>

      {filtroAtivo && (
        <p className="marca-alerta aviso-recorte">
          Há recorte ativo ({fmtInt.format(projetos.length)} de{" "}
          {fmtInt.format(todos.length)} projetos), mas esta tela mostra a
          remessa inteira: a divisão da diretriz só faz sentido sobre tudo o que
          disputa o teto. O recorte vale em Projetos &amp; Pastas.
        </p>
      )}

      <div className="grade">
        <Secao
          titulo="Envelopes da diretriz"
          sub="Limite = a diretriz aplicada à receita da remessa (o administrativo é uma das seis fatias). Desvio = pedido menos limite; a régua mostra o mesmo desvio, em pontos da receita: à esquerda abaixo do limite, à direita acima. Caixa mês a mês, envelope por projeto e ajustes ficam na tela Envelopes."
          largura="cheia"
          acoes={
            <Link className="botao-claro" href="/envelopes">
              Abrir Envelopes →
            </Link>
          }
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Envelope</th>
                <th className="n">Projetos</th>
                <th className="n">Pedido</th>
                <th className="n">Diretriz</th>
                <th className="n">Limite</th>
                <th className="n">Desvio</th>
                <th>Abaixo ◂ ▸ Acima</th>
                {temAntes && <th className="n">Aprovado em {anoAnterior}</th>}
              </tr>
            </thead>
            <tbody>
              {diretriz.linhas.map((l) => {
                const aprovado = aprovadoAntes.porChave.get(l.chave) ?? 0;
                return (
                  <tr key={l.chave}>
                    <td>
                      <b>{l.rotulo}</b>
                      <span className="celula-sub">{l.criterio}</span>
                    </td>
                    <td className="n">
                      {l.semProjetos ? (
                        "—"
                      ) : (
                        <>
                          <Link
                            className="link-projeto"
                            href={`/envelopes?envelope=${l.chave === FORA_DA_DIRETRIZ ? "sem" : l.chave}`}
                            title="Abrir estes projetos na tela Envelopes"
                          >
                            {fmtInt.format(l.projetos)}
                          </Link>
                          <span className="celula-sub">
                            {fmtInt.format(l.renovacoes)} renov. ·{" "}
                            {fmtInt.format(l.novos)} novos
                          </span>
                        </>
                      )}
                    </td>
                    <td className="n">
                      {fmtMoeda.format(l.pedido)}
                      <span className="celula-sub">
                        {l.estimado
                          ? "reserva: não preenchido"
                          : `${pct(l.fracao)} do pedido`}
                      </span>
                    </td>
                    <td className="n">{pct(l.alvo)}</td>
                    <td className="n">
                      {l.envelope === null ? "—" : fmtMoeda.format(l.envelope)}
                    </td>
                    <td className="n">
                      {l.desvio === null
                        ? "—"
                        : `${l.desvio > 0 ? "+" : "−"}${fmtMoeda.format(Math.abs(l.desvio))}`}
                      <span className="celula-sub">
                        {Math.abs(l.desvioPp) < 0.001
                          ? "na faixa"
                          : `${num(Math.abs(l.desvioPp) * 100, 1)} p.p. ${l.desvioPp > 0 ? "acima" : "abaixo"}`}
                      </span>
                    </td>
                    <td>
                      <Regua pp={l.desvioPp} escala={escala} />
                    </td>
                    {temAntes && (
                      <td className="n">
                        {pct(aprovado / aprovadoAntes.total)}
                        {aprovado > 0 && (
                          <span className="celula-sub">
                            {fmtMoeda.format(aprovado)}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="n">{fmtInt.format(diretriz.projetos)}</td>
                <td className="n">
                  {fmtMoeda.format(diretriz.pedido)}
                  {variacaoAno !== null && (
                    <span className="celula-sub">
                      {variacaoAno >= 0 ? "▲" : "▼"}{" "}
                      {pct(Math.abs(variacaoAno))} nos projetos sobre{" "}
                      {anoAnterior}
                    </span>
                  )}
                </td>
                <td className="n">100%</td>
                <td className="n">
                  {teto === null ? "—" : fmtMoeda.format(teto)}
                </td>
                <td className="n">
                  {vao === null
                    ? "—"
                    : `${vao > 0 ? "+" : "−"}${fmtMoeda.format(Math.abs(vao))}`}
                </td>
                <td />
                {temAntes && (
                  <td className="n">{fmtMoeda.format(aprovadoAntes.total)}</td>
                )}
              </tr>
            </tfoot>
          </table>

          <p className="rodape">
            Base:{" "}
            {plural(
              diretriz.projetos,
              "projeto avaliável",
              "projetos avaliáveis",
            )}{" "}
            da Remessa {ano}. Rejeitado, rascunho e cancelado ficam fora porque
            não disputam o teto.{" "}
            {teto !== null &&
              `A receita vem da linha de orçamento marcada como "${orcamento?.fonteOrcamento.status ?? "sem status"}" (${orcamento?.fonteOrcamento.criterio}): faturamento × doação × margem, antes do administrativo${caixa.receitaDigitada.some(Boolean) ? ", com os meses digitados na tela Envelopes" : ""}.`}{" "}
            Os percentuais são a diretriz definida na reunião. O envelope de
            cada projeto é o escolhido pela mesa na tela Envelopes; sem escolha,
            a sugestão pelo conteúdo ou pela categoria do sistema de submissão.
            Os custos administrativos, enquanto não digitados, reservam o
            próprio limite.
          </p>

          {(orcamento?.fonteOrcamento.alertas.length ?? 0) > 0 && (
            <ul className="alertas">
              {orcamento?.fonteOrcamento.alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao
          titulo="Renovações e projetos novos, por envelope"
          sub={`As ${plural(renovacoes.length, "renovação", "renovações")} pedem ${fmtMoeda.format(totalRen.pedido)} tendo recebido ${fmtMoeda.format(totalRen.recebido)} na remessa anterior. O vínculo com a remessa anterior é derivado fora do sistema de submissão, que não liga um ciclo ao outro.`}
          largura="cheia"
          acoes={
            <>
              {renovacoes.length > 0 && (
                <Link
                  className="botao-claro"
                  href="/projetos"
                  onClick={irPara({ tipo: ["renovacao"] })}
                >
                  Abrir as renovações →
                </Link>
              )}
              {novos.length > 0 && (
                <Link
                  className="botao-claro"
                  href="/projetos"
                  onClick={irPara({ tipo: ["novo", "revisar"] })}
                >
                  Abrir os novos →
                </Link>
              )}
            </>
          }
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Envelope</th>
                <th className="n">Renovações</th>
                <th className="n">Pedem</th>
                <th className="n">Receberam antes</th>
                <th className="n">Variação</th>
                <th className="n">Novos</th>
                <th className="n">Pedem</th>
              </tr>
            </thead>
            <tbody>
              {porRubrica.map(
                ({ linha: l, recebido, pedidoComBase, recebidoComBase }) => (
                  <tr key={l.chave}>
                    <td>
                      <b>{l.rotulo}</b>
                    </td>
                    <td className="n">{fmtInt.format(l.renovacoes)}</td>
                    <td className="n">{fmtMoeda.format(l.pedidoRenovacoes)}</td>
                    <td className="n">{fmtMoeda.format(recebido)}</td>
                    <td className="n">
                      {setaVariacao(pedidoComBase, recebidoComBase) || "—"}
                    </td>
                    <td className="n">{fmtInt.format(l.novos)}</td>
                    <td className="n">{fmtMoeda.format(l.pedidoNovos)}</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="n">{fmtInt.format(renovacoes.length)}</td>
                <td className="n">{fmtMoeda.format(totalRen.pedido)}</td>
                <td className="n">{fmtMoeda.format(totalRen.recebido)}</td>
                <td className="n">
                  {setaVariacao(
                    totalRen.pedidoComBase,
                    totalRen.recebidoComBase,
                  ) || "—"}
                </td>
                <td className="n">{fmtInt.format(novos.length)}</td>
                <td className="n">
                  {fmtMoeda.format(somar(novos, (p) => p.solicitado))}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="rodape">
            A variação compara só as renovações com valor recebido na remessa
            anterior; as sem base ficam de fora da conta.
          </p>
        </Secao>

        {dobram.length > 0 && (
          <Secao
            titulo="Renovações que pedem mais que o dobro"
            sub={`${plural(dobram.length, "renovação pede", "renovações pedem")} mais que o dobro do que recebeu, ${fmtMoeda.format(aMaisDobram)} a mais no total.`}
            largura="cheia"
          >
            <table className="tabela">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Instituição</th>
                  <th>Envelope</th>
                  <th className="n">Recebeu antes</th>
                  <th className="n">Pede agora</th>
                  <th className="n">Variação</th>
                </tr>
              </thead>
              <tbody>
                {dobram.slice(0, LIMITE).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="link-projeto" href={`/projetos/${p.id}`}>
                        {p.titulo}
                      </Link>
                    </td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td className="rotulo">{rotuloEnvelope(p)}</td>
                    <td className="n">
                      {fmtMoeda.format(p.revisao.recebidoAnterior ?? 0)}
                    </td>
                    <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                    <td className="n">
                      {setaVariacao(p.solicitado, p.revisao.recebidoAnterior)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dobram.length > LIMITE && (
              <p className="rodape">
                Os {LIMITE} de maior diferença em reais; os outros{" "}
                {fmtInt.format(dobram.length - LIMITE)} estão em Projetos &amp;
                Pastas.
              </p>
            )}
          </Secao>
        )}

        {maioresNovos.length > 0 && (
          <Secao
            titulo={`Os ${maioresNovos.length} maiores projetos novos`}
            sub={`Somam ${fmtMoeda.format(somar(maioresNovos, (p) => p.solicitado))}, ${pct(
              somar(maioresNovos, (p) => p.solicitado) /
                Math.max(
                  1,
                  somar(novos, (p) => p.solicitado),
                ),
            )} do que os ${fmtInt.format(novos.length)} novos pedem. Cada um vai para a pasta de um diretor ou conselheiro, que apresenta e submete a voto.`}
            largura="cheia"
          >
            <table className="tabela">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Instituição</th>
                  <th>Envelope</th>
                  <th>País</th>
                  <th>Pasta</th>
                  <th className="n">Pede</th>
                </tr>
              </thead>
              <tbody>
                {maioresNovos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="link-projeto" href={`/projetos/${p.id}`}>
                        {p.titulo}
                      </Link>
                    </td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td className="rotulo">{rotuloEnvelope(p)}</td>
                    <td>{p.local.nomePt}</td>
                    <td>{p.revisao.responsavel ?? "—"}</td>
                    <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>
        )}
      </div>
    </>
  );
}
