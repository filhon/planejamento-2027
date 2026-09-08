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
  ROTULO_STATUS,
} from "../formato";
import { Kpi, Secao } from "../ui";
import Exportar from "./exportar";
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
 * A triagem sai de data/projetos_avaliacao.csv (`npm run avaliacao:regen`) —
 * a origem não liga um projeto de uma remessa ao da anterior.
 */

const colunaOrdem: Record<string, (p: ProjetoCiclo) => number | string> = {
  titulo: (p) => p.titulo.toLocaleLowerCase("pt-BR"),
  instituicao: (p) => (p.instituicaoNome ?? "").toLocaleLowerCase("pt-BR"),
  solicitado: (p) => -p.solicitado,
  recebido: (p) => -(p.revisao.recebidoAnterior ?? -1),
  nota: (p) => -(p.notaMediana ?? -1),
};

export default function Projetos({
  avaliadores,
}: {
  avaliadores: Avaliador[];
}) {
  const { ano, anoAnterior, projetos, todos, filtros, aplicar } = usePainel();
  const [ordem, setOrdem] = useState<keyof typeof colunaOrdem>("titulo");

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
          acoes={<Exportar lista={lista} />}
        >
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  {(
                    [
                      ["titulo", "Projeto"],
                      ["instituicao", "Instituição"],
                    ] as const
                  ).map(([chave, rotulo]) => (
                    <th key={chave}>
                      <button
                        className="ordenar"
                        onClick={() => setOrdem(chave)}
                      >
                        {rotulo}
                        {ordem === chave ? " ▾" : ""}
                      </button>
                    </th>
                  ))}
                  <th>Triagem</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th className="n">
                    <button
                      className="ordenar"
                      onClick={() => setOrdem("solicitado")}
                    >
                      Solicitado{ordem === "solicitado" ? " ▾" : ""}
                    </button>
                  </th>
                  <th className="n">
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
                    <td>
                      <Link className="link-projeto" href={`/projetos/${p.id}`}>
                        {p.titulo}
                      </Link>
                    </td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td>
                      <Tipo revisao={p.revisao} />
                    </td>
                    <td>{p.revisao.responsavel ?? "—"}</td>
                    <td>{ROTULO_STATUS[p.statusGrupo]}</td>
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
                    <td colSpan={7} className="sub">
                      Nenhum projeto com os filtros atuais.
                      {filtros.responsavel.includes(SEM_RESPONSAVEL) &&
                        " Rode a triagem para distribuir as pastas."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>

      <p className="rodape">
        Triagem por projeto: {ROTULO_TIPO.renovacao} · {ROTULO_TIPO.novo} ·{" "}
        {ROTULO_TIPO.revisar}. Vem de <code>data/projetos_avaliacao.csv</code>,
        fora da origem — a equipe confirma na planilha e o painel obedece.
      </p>
    </>
  );
}
