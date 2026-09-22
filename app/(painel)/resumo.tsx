"use client";

import Link from "next/link";
import { useMemo } from "react";
import { avaliavel, ehRenovacao } from "@/lib/agregar";
import {
  montarDiretriz,
  rotuloRubrica,
  type LinhaDiretriz,
} from "@/lib/rubricas";
import type { OrcamentoCiclo, ProjetoCiclo } from "@/lib/types";
import { usePainel } from "./contexto";
import {
  fmtInt,
  fmtMoeda,
  fmtMoedaCurta,
  num,
  pct,
  plural,
  rotuloCategoria,
  variacaoPedido,
} from "./formato";
import { Kpi, Secao } from "./ui";

/**
 * Resumo Executivo — a tela de abertura da reunião (Fase 12).
 *
 * Responde, nesta ordem, as três perguntas da diretriz orçamentária do
 * presidente: **cabe no teto?**, **a divisão por rúbrica bate?** e **o que é
 * renovação e o que é projeto novo** (com nome, para a mesa poder cobrar).
 *
 * Base: os projetos **avaliáveis** do recorte — rejeitado, rascunho e cancelado
 * ficam fora porque não disputam o teto (em 2026 são R$ 7 mi que inflavam toda
 * a aderência). É a mesma régua que decide quem ocupa pasta de diretor.
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

/**
 * Régua de desvio: barra divergente com o zero no meio — à direita (laranja) a
 * rúbrica pede ACIMA do envelope da diretriz, à esquerda (azul) fica abaixo.
 *
 * O mesmo dado está codificado três vezes — lado, cor e a palavra na célula ao
 * lado — porque esta página sai em fotocópia preto e branco e é lida a três
 * metros na TV. A escala é comum a todas as linhas (o maior desvio ocupa a
 * meia-largura), com piso de 5 p.p. para desvio pequeno não parecer grande.
 */
function Regua({ pp, escala }: { pp: number; escala: number }) {
  const largura = Math.min(50, (Math.abs(pp) / escala) * 50);
  if (largura < 0.5) return <span className="regua" aria-hidden="true" />;
  return (
    <span className="regua" aria-hidden="true">
      <i
        className={pp > 0 ? "acima" : "abaixo"}
        style={{ width: `${largura}%` }}
      />
    </span>
  );
}

/**
 * "R$ 591.122 acima do seu envelope" — a conta que a mesa faria de cabeça.
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
}: {
  orcamentos: Record<number, OrcamentoCiclo>;
}) {
  const {
    ano,
    anoAnterior,
    projetos,
    projetosAnteriores,
    filtroAtivo,
    aplicar,
  } = usePainel();

  /**
   * Os atalhos desta página levam o recorte para Projetos & Pastas em vez de
   * recortar a própria tela: filtrar o Resumo por uma rúbrica faria a tabela da
   * diretriz mostrar essa rúbrica com 100% do pedido — verdade inútil.
   */
  const irPara = (parcial: Parameters<typeof aplicar>[0]) => () =>
    aplicar(parcial);

  const naMesa = useMemo(
    () => projetos.filter((p) => avaliavel(p.status)),
    [projetos],
  );
  const naMesaAntes = useMemo(
    () => projetosAnteriores.filter((p) => avaliavel(p.status)),
    [projetosAnteriores],
  );

  const orcamento = orcamentos[ano];
  const teto = orcamento?.tetoTotal ?? null;
  const diretriz = useMemo(() => montarDiretriz(naMesa, teto), [naMesa, teto]);

  /**
   * Régua histórica: quanto o conselho APROVOU em cada rúbrica na remessa
   * anterior. Não é previsão — é o que aconteceu, e é o que diz se a diretriz
   * repete a prática ou a corrige. (Em 2026 não há um único aprovado; sem esta
   * coluna a tabela não teria nenhuma referência de realização.)
   */
  const antes = useMemo(() => montarDiretriz(naMesaAntes, null), [naMesaAntes]);
  const aprovadoAntes = useMemo(() => {
    const total = somar(naMesaAntes, (p) => p.aprovado);
    const porChave = new Map(
      antes.linhas.map((l) => [
        l.chave,
        somar(
          naMesaAntes.filter((p) => l.categorias.includes(p.categoria)),
          (p) => p.aprovado,
        ),
      ]),
    );
    return { total, porChave };
  }, [antes, naMesaAntes]);

  const renovacoes = useMemo(
    () =>
      naMesa.filter(ehRenovacao).sort((a, b) => b.solicitado - a.solicitado),
    [naMesa],
  );
  const novos = useMemo(
    () =>
      naMesa
        .filter((p) => !ehRenovacao(p))
        .sort((a, b) => b.solicitado - a.solicitado),
    [naMesa],
  );
  const recebidoRenovacoes = somar(
    renovacoes,
    (p) => p.revisao.recebidoAnterior,
  );

  /** Sem ciclo anterior (ou sem nada aprovado nele) a coluna histórica sai. */
  const temAntes = anoAnterior !== undefined && aprovadoAntes.total > 0;

  const vao = teto === null ? null : diretriz.pedido - teto;
  const escala = Math.max(
    0.05,
    ...diretriz.linhas.map((l) => Math.abs(l.desvioPp)),
  );

  if (naMesa.length === 0) {
    return (
      <p className="vazio">
        Nenhum projeto avaliável no recorte atual. Rejeitado, rascunho e
        cancelado ficam fora desta tela — eles não disputam o teto.
      </p>
    );
  }

  return (
    <>
      {/* O veredito antes da tabela: é o que alguém lê em voz alta para abrir a
          reunião, e é montado dos mesmos números da tabela abaixo. */}
      <p className="veredito">
        <b>{plural(diretriz.projetos, "projeto", "projetos")}</b> na mesa pedem{" "}
        <b>{fmtMoeda.format(diretriz.pedido)}</b>
        {vao === null ? (
          <> — a remessa não tem teto confiável para comparar.</>
        ) : vao > 0 ? (
          <>
            {" "}
            — <b>{fmtMoeda.format(vao)} acima</b> do teto de{" "}
            {fmtMoeda.format(teto ?? 0)}.
          </>
        ) : (
          <>
            {" "}
            — {fmtMoeda.format(-vao)} abaixo do teto de{" "}
            {fmtMoeda.format(teto ?? 0)}, que cobre o pedido inteiro.
          </>
        )}{" "}
        {diretriz.acima === null ? (
          <>Na divisão da diretriz, todas as rúbricas estão na faixa.</>
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
      </p>

      <div className="kpis">
        <Kpi
          rotulo="Na mesa"
          valor={fmtInt.format(diretriz.projetos)}
          nota={`${fmtInt.format(renovacoes.length)} renovações · ${fmtInt.format(novos.length)} novos`}
        />
        <Kpi
          rotulo="Pedido total"
          valor={fmtMoedaCurta.format(diretriz.pedido)}
          atual={diretriz.pedido}
          anterior={naMesaAntes.length > 0 ? antes.pedido : undefined}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
          /* Pedir mais que a remessa anterior não é boa notícia numa mesa que
             precisa caber no teto: o delta sobe em laranja, não em verde. */
          inverso
        />
        <Kpi
          rotulo="Teto da remessa"
          valor={teto === null ? "—" : fmtMoedaCurta.format(teto)}
          nota={
            vao === null
              ? "sem linha de orçamento confiável"
              : `${fmtMoedaCurta.format(Math.abs(vao))} ${vao > 0 ? "a cortar do pedido" : "de folga"}`
          }
          tom={vao === null ? undefined : vao > 0 ? "atencao" : "bom"}
        />
        <Kpi
          rotulo="A remanejar pela diretriz"
          valor={
            diretriz.remanejar === null
              ? "—"
              : fmtMoedaCurta.format(diretriz.remanejar)
          }
          nota={
            diretriz.remanejar === null
              ? "depende do teto do ciclo"
              : diretriz.remanejar === 0
                ? "nenhuma rúbrica passou do envelope"
                : `${plural(
                    diretriz.linhas.filter((l) => (l.desvio ?? 0) > 0).length,
                    "rúbrica acima",
                    "rúbricas acima",
                  )} do envelope`
          }
          tom={
            diretriz.remanejar === null
              ? undefined
              : diretriz.remanejar > 0
                ? "atencao"
                : "bom"
          }
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Rúbricas da diretriz"
          sub="Envelope = a diretriz aplicada ao teto da remessa. A régua mostra o desvio: à esquerda abaixo do envelope, à direita acima."
          largura="cheia"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Rúbrica</th>
                <th className="n">Projetos</th>
                <th className="n">Pedido</th>
                <th className="n">Diretriz</th>
                <th className="n">Envelope do teto</th>
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
                      <span className="celula-sub">
                        {l.categorias.map(rotuloCategoria).join(" · ")}
                        {l.nota && ` — ${l.nota}`}
                      </span>
                    </td>
                    <td className="n">
                      <Link
                        className="link-projeto"
                        href="/projetos"
                        onClick={irPara({ categoria: l.categorias })}
                      >
                        {fmtInt.format(l.projetos)}
                      </Link>
                      <span className="celula-sub">
                        {fmtInt.format(l.renovacoes)} renov. ·{" "}
                        {fmtInt.format(l.novos)} novos
                      </span>
                    </td>
                    <td className="n">
                      {fmtMoeda.format(l.pedido)}
                      <span className="celula-sub">
                        {pct(l.fracao)} do pedido
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
                        <span className="celula-sub">
                          {aprovado === 0 ? "" : fmtMoeda.format(aprovado)}
                        </span>
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
                <td className="n">{fmtMoeda.format(diretriz.pedido)}</td>
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
            da Remessa {ano} — rejeitado, rascunho e cancelado ficam fora porque
            não disputam o teto.{" "}
            {teto !== null &&
              `O teto vem da linha de orçamento marcada como "${orcamento?.fonteOrcamento.status ?? "sem status"}" — ${orcamento?.fonteOrcamento.criterio}.`}{" "}
            A divisão por rúbrica é a diretriz; o de-para rúbrica → categoria é
            leitura nossa das categorias da origem, que não tem o conceito de
            rúbrica.
            {filtroAtivo && (
              <span className="marca-alerta">
                {" "}
                Há recorte ativo: a aderência acima é do recorte, não da remessa
                inteira.
              </span>
            )}
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
          titulo={`Renovações — ${plural(renovacoes.length, "projeto", "projetos")}`}
          sub={
            renovacoes.length === 0
              ? "Nenhuma renovação no recorte."
              : `Pedem ${fmtMoeda.format(somar(renovacoes, (p) => p.solicitado))} tendo recebido ${fmtMoeda.format(recebidoRenovacoes)} na remessa anterior. Continuação de projeto que a origem não liga: o vínculo é derivado fora dela.`
          }
          largura="cheia"
          acoes={
            renovacoes.length > 0 && (
              <Link
                className="botao-claro"
                href="/projetos"
                onClick={irPara({ tipo: ["renovacao"] })}
              >
                Abrir as renovações em Projetos &amp; Pastas →
              </Link>
            )
          }
        >
          {renovacoes.length === 0 ? (
            <p className="sub">
              A triagem novo × renovação existe a partir da Remessa 2026 — a
              origem não liga um ciclo ao outro, e o vínculo de 2025 para trás
              não foi derivado.
            </p>
          ) : (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Projeto</th>
                    <th>Instituição</th>
                    <th>Rúbrica</th>
                    <th className="n">Recebeu antes</th>
                    <th className="n">Pede agora</th>
                    <th>Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {renovacoes.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="link-projeto"
                          href={`/projetos/${p.id}`}
                        >
                          {p.titulo}
                        </Link>
                      </td>
                      <td>{p.instituicaoNome ?? "—"}</td>
                      <td className="rotulo">{rotuloRubrica(p.categoria)}</td>
                      <td className="n">
                        {p.revisao.recebidoAnterior === null
                          ? "—"
                          : fmtMoeda.format(p.revisao.recebidoAnterior)}
                      </td>
                      <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                      <td className="rotulo">
                        {variacaoPedido(
                          p.solicitado,
                          p.revisao.recebidoAnterior,
                        ) || "sem base anterior"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td />
                    <td className="n">{fmtMoeda.format(recebidoRenovacoes)}</td>
                    <td className="n">
                      {fmtMoeda.format(somar(renovacoes, (p) => p.solicitado))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Secao>

        <Secao
          titulo={`Projetos novos — ${plural(novos.length, "projeto", "projetos")}`}
          sub={
            novos.length === 0
              ? "Nenhum projeto novo no recorte."
              : `Pedem ${fmtMoeda.format(somar(novos, (p) => p.solicitado))}. Cada um vai para a pasta de um diretor ou conselheiro, que apresenta e submete a voto.`
          }
          largura="cheia"
          acoes={
            novos.length > 0 && (
              <Link
                className="botao-claro"
                href="/projetos"
                onClick={irPara({ tipo: ["novo", "revisar"] })}
              >
                Abrir os novos em Projetos &amp; Pastas →
              </Link>
            )
          }
        >
          {novos.length > 0 && (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Projeto</th>
                    <th>Instituição</th>
                    <th>Rúbrica</th>
                    <th>País</th>
                    <th>Pasta</th>
                    <th className="n">Pede</th>
                  </tr>
                </thead>
                <tbody>
                  {novos.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="link-projeto"
                          href={`/projetos/${p.id}`}
                        >
                          {p.titulo}
                        </Link>
                      </td>
                      <td>{p.instituicaoNome ?? "—"}</td>
                      <td className="rotulo">{rotuloRubrica(p.categoria)}</td>
                      <td>{p.local.nomePt}</td>
                      <td>{p.revisao.responsavel ?? "sem responsável"}</td>
                      <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td className="n">
                      {fmtMoeda.format(somar(novos, (p) => p.solicitado))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Secao>
      </div>
    </>
  );
}
