"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  SEM_RESPONSAVEL,
  avaliavel,
  montarPastas,
  vaiParaPasta,
  alternar,
} from "@/lib/agregar";
import type { Avaliador, ProjetoCiclo } from "@/lib/types";
import { usePainel } from "../contexto";
import {
  fmtInt,
  fmtMoeda,
  fmtMoedaCurta,
  plural,
  rotuloStatus,
  SEM_RESULTADO,
} from "../formato";
import { Kpi, Secao } from "../ui";
import { Analise } from "./analise";
import Exportar from "./exportar";
import IrPara from "./ir-para";
import { ROTULO_TIPO, Tipo } from "./tipo";

/**
 * Projetos & Pastas — a página que organiza a reunião.
 *
 * A regra da reunião: **renovação** só a equipe ASEEC analisa (prestação de
 * contas + valor pedido); **projeto novo** vai para a pasta de um diretor ou
 * conselheiro, que avalia a fundo, apresenta, e aí todos votam. Clicar numa
 * pasta é "abrir a pasta do Fulano": filtra a tabela abaixo para os projetos
 * dele, na ordem em que ele vai apresentar.
 *
 * A triagem sai do Firestore (`triagem`, gerada por `npm run avaliacao:regen`
 * e editada na pasta do projeto) —
 * a origem não liga um projeto de uma remessa ao da anterior.
 */

const colunaOrdem: Record<string, (p: ProjetoCiclo) => number | string> = {
  numero: (p) => p.numero,
  titulo: (p) => p.titulo.toLocaleLowerCase("pt-BR"),
  instituicao: (p) => (p.instituicaoNome ?? "").toLocaleLowerCase("pt-BR"),
  solicitado: (p) => -p.solicitado,
  recebido: (p) => -(p.revisao.recebidoAnterior ?? -1),
  nota: (p) => -(p.notaMediana ?? -1),
  // Não analisados primeiro, e dentro de cada grupo o mexido mais recentemente
  // no topo: é a fila de trabalho da equipe entre uma reunião e outra.
  analise: (p) =>
    (p.analise.analisado ? 1e15 : 0) -
    (p.analise.atualizadoEm ? new Date(p.analise.atualizadoEm).getTime() : 0),
};

/** Cada coluna tem uma ordem só, a útil: nome de A a Z, dinheiro do maior ao
 *  menor. O ▾ diz isso a quem vê; `aria-sort`, a quem ouve. */
const CRESCENTE = new Set(["numero", "titulo", "instituicao"]);

export default function Projetos({
  avaliadores,
}: {
  avaliadores: Avaliador[];
}) {
  const { ano, anoAnterior, projetos, todos, filtros, aplicar } = usePainel();
  const [ordem, setOrdem] = useState<keyof typeof colunaOrdem>("titulo");
  const ordenacao = (chave: string) =>
    ordem !== chave
      ? undefined
      : CRESCENTE.has(chave)
        ? ("ascending" as const)
        : ("descending" as const);

  const ativos = useMemo(
    () => avaliadores.filter((a) => a.ativo).map((a) => a.nome),
    [avaliadores],
  );

  // As pastas saem do ciclo INTEIRO: se saíssem do recorte, filtrar por uma
  // pasta zeraria as outras e o painel perderia a visão da divisão do trabalho.
  const pastas = useMemo(() => montarPastas(todos, ativos), [todos, ativos]);

  const novos = projetos.filter(vaiParaPasta);
  const renovacoes = projetos.filter((p) => p.revisao.tipo === "renovacao");
  // Rejeitado não vai a pasta nenhuma — nem quando o vínculo está por decidir.
  const aRevisar = projetos.filter(
    (p) => p.revisao.tipo === "revisar" && avaliavel(p.status),
  );
  // Rejeitado, rascunho (nunca submetido) e cancelado: fora da avaliação.
  const foraDaAvaliacao = projetos.filter(
    (p) => p.revisao.tipo !== "renovacao" && !avaliavel(p.status),
  );
  const foraDaTriagem = todos.filter((p) => !p.revisao.naTriagem);

  // Análise prévia: quanto do recorte a equipe ASEEC já olhou. Só entram os
  // projetos que ainda podem ir à mesa — cobrar análise de rejeitado/rascunho
  // faria a fila parecer maior do que é.
  const naFila = projetos.filter((p) => avaliavel(p.status));
  const analisados = naFila.filter((p) => p.analise.analisado);

  const recebidoTotal = renovacoes.reduce(
    (s, p) => s + (p.revisao.recebidoAnterior ?? 0),
    0,
  );

  const lista = useMemo(
    () =>
      [...projetos].sort((a, b) => {
        const f = colunaOrdem[ordem]!;
        const [x, y] = [f(a), f(b)];
        return typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "pt-BR");
      }),
    [projetos, ordem],
  );

  return (
    <>
      {foraDaTriagem.length > 0 && (
        <div className="alerta-caixa cartao">
          <h2 className="titulo">
            {foraDaTriagem.length === todos.length
              ? "A triagem ainda não foi gerada"
              : `${plural(foraDaTriagem.length, "projeto", "projetos")} fora da triagem`}
          </h2>
          <p className="sub">
            {foraDaTriagem.length === todos.length
              ? "Sem ela, todo projeto aparece como novo e sem responsável. "
              : "Chegaram depois da última rodada — aparecem como novos e sem responsável. "}
            Rode <code>npm run avaliacao:regen</code>: as pastas já distribuídas
            não mudam, só os que faltam são atribuídos.
          </p>
        </div>
      )}

      <div className="kpis">
        <Kpi
          rotulo="Projetos no recorte"
          valor={fmtInt.format(projetos.length)}
          nota={`de ${fmtInt.format(todos.length)} na Remessa ${ano}`}
        />
        <Kpi
          rotulo="Novos (vão para as pastas)"
          valor={fmtInt.format(novos.length)}
          nota={
            foraDaAvaliacao.length > 0
              ? `avaliação profunda + voto · ${foraDaAvaliacao.length} fora (rejeitado/rascunho)`
              : "avaliação profunda + voto de todos"
          }
          tom="atencao"
        />
        <Kpi
          rotulo="Renovações"
          valor={fmtInt.format(renovacoes.length)}
          nota="só a equipe ASEEC analisa"
          tom="bom"
        />
        <Kpi
          rotulo={`Recebido em ${anoAnterior ?? "—"}`}
          valor={fmtMoedaCurta.format(recebidoTotal)}
          nota={`${renovacoes.filter((p) => p.revisao.recebidoAnterior).length} renovações com valor casado`}
        />
        <Kpi
          rotulo="Análise prévia da equipe"
          valor={`${fmtInt.format(analisados.length)} de ${fmtInt.format(naFila.length)}`}
          nota={`${fmtInt.format(naFila.length - analisados.length)} sem parecer nem tags`}
          tom={analisados.length === naFila.length ? "bom" : "atencao"}
        />
        <Kpi
          rotulo="Vínculo a decidir"
          valor={fmtInt.format(aRevisar.length)}
          nota="casamento plausível, não conclusivo"
          tom={aRevisar.length > 0 ? "atencao" : "bom"}
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Pastas dos projetos novos"
          sub="Clique numa pasta para abrir só os projetos daquele diretor/conselheiro. Contagens do ciclo inteiro; rejeitado, rascunho e cancelado ficam de fora."
          largura="cheia"
        >
          <div className="pastas">
            {pastas.map((p) => {
              const marcada = filtros.responsavel.includes(p.responsavel);
              return (
                <button
                  key={p.responsavel}
                  className={`pasta${p.atribuida ? "" : " pasta-sem-dono"}`}
                  aria-pressed={marcada}
                  onClick={() =>
                    aplicar({
                      responsavel: alternar(filtros.responsavel, p.responsavel),
                    })
                  }
                >
                  <b>{p.atribuida ? p.responsavel : "Sem responsável"}</b>
                  <span className="pasta-n">
                    {fmtInt.format(p.projetos.length)}
                  </span>
                  <span className="sub">
                    {fmtMoedaCurta.format(p.solicitado)} solicitados
                    {p.aRevisar > 0 && ` · ${p.aRevisar} a revisar`}
                  </span>
                </button>
              );
            })}
          </div>
        </Secao>

        <Secao
          titulo={`${plural(lista.length, "projeto", "projetos")} no recorte`}
          sub="Clique no título para abrir a pasta do projeto — texto, anexos, vídeo, parecer e prestação de contas."
          largura="cheia"
          // A exportação leva a lista JÁ ORDENADA: o diretor recebe o material
          // na mesma ordem em que está vendo na tela.
          acoes={
            <>
              <IrPara />
              <Exportar lista={lista} />
            </>
          }
        >
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  {(
                    [
                      ["numero", "Nº"],
                      ["titulo", "Projeto"],
                      ["instituicao", "Instituição"],
                    ] as const
                  ).map(([chave, rotulo]) => (
                    <th key={chave} aria-sort={ordenacao(chave)}>
                      <button
                        className="ordenar"
                        onClick={() => setOrdem(chave)}
                      >
                        {rotulo}
                        {ordem === chave ? " ▾" : ""}
                      </button>
                    </th>
                  ))}
                  <th aria-sort={ordenacao("analise")}>
                    <button
                      className="ordenar"
                      onClick={() => setOrdem("analise")}
                      title="Ordena pelos não analisados primeiro"
                    >
                      Análise prévia{ordem === "analise" ? " ▾" : ""}
                    </button>
                  </th>
                  <th>Triagem</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th className="n" aria-sort={ordenacao("solicitado")}>
                    <button
                      className="ordenar"
                      onClick={() => setOrdem("solicitado")}
                    >
                      Solicitado{ordem === "solicitado" ? " ▾" : ""}
                    </button>
                  </th>
                  <th className="n" aria-sort={ordenacao("recebido")}>
                    <button
                      className="ordenar"
                      onClick={() => setOrdem("recebido")}
                    >
                      Recebeu {anoAnterior ?? "—"}
                      {ordem === "recebido" ? " ▾" : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="n">{p.numero}</td>
                    <td>
                      <Link className="link-projeto" href={`/projetos/${p.id}`}>
                        {p.titulo}
                      </Link>
                    </td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td>
                      <Analise a={p.analise} data />
                    </td>
                    <td>
                      <Tipo revisao={p.revisao} />
                    </td>
                    <td>{p.revisao.responsavel ?? "—"}</td>
                    <td>{rotuloStatus(p.status)}</td>
                    <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                    <td className="n">
                      {p.revisao.recebidoAnterior === null ? (
                        <span className="sub">—</span>
                      ) : (
                        fmtMoeda.format(p.revisao.recebidoAnterior)
                      )}
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={9} className="sub">
                      {filtros.responsavel.includes(SEM_RESPONSAVEL)
                        ? "Nenhum projeto sem responsável neste recorte."
                        : SEM_RESULTADO}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>

      <p className="rodape">
        A triagem é por projeto — {ROTULO_TIPO.renovacao} quando o painel achou
        o mesmo projeto na remessa anterior, {ROTULO_TIPO.novo} quando não achou
        e &quot;{ROTULO_TIPO.revisar}&quot; quando o casamento é plausível mas
        não conclusivo. O sistema de submissão não liga uma remessa à outra: a
        decisão final é da equipe, em &quot;Editar triagem&quot; na pasta de
        cada projeto, e o painel obedece a ela.
      </p>
    </>
  );
}
