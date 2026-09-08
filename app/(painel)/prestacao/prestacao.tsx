"use client";

import { useMemo } from "react";
import { ehFinanciado, montarCobertura } from "@/lib/agregar";
import type { ProjetoCiclo, RelatorioPrestacao } from "@/lib/types";
import { usePainel } from "../contexto";
import { fmtInt, fmtMoeda, fmtMoedaCurta, pct, plural } from "../formato";
import { Barras, Kpi, Secao } from "../ui";

/**
 * Prestação de contas — cobertura por trimestre, pendências e execução do
 * aprovado (docs/plano-dashboard.md §4, página 06).
 *
 * Atenção ao que o dado é: o relatório tem ano-CALENDÁRIO próprio (`year`,
 * `quarter`) e a remessa dele vem do PROJETO, não do `cycle_id` do relatório
 * (ver `montarCobertura`). Hoje a origem tem 27 relatórios, todos de projetos
 * da Remessa 2025 entregues ao longo de 2026 — a Remessa 2026 aparece vazia
 * porque ainda não tem projeto aprovado. Isso é o dado, não uma falha.
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

export default function Prestacao({
  relatorios,
}: {
  relatorios: RelatorioPrestacao[];
}) {
  const { ano, anoAnterior, projetos, projetosAnteriores, filtroAtivo } =
    usePainel();

  const c = useMemo(
    () => montarCobertura(projetos, relatorios, ano),
    [projetos, relatorios, ano],
  );
  const antes = useMemo(
    () =>
      anoAnterior
        ? montarCobertura(projetosAnteriores, relatorios, anoAnterior)
        : null,
    [projetosAnteriores, relatorios, anoAnterior],
  );

  // Execução: do aprovado ao dinheiro que efetivamente saiu.
  const financiados = useMemo(() => projetos.filter(ehFinanciado), [projetos]);
  const aprovado = somar(financiados, (p) => p.aprovado);
  const alocado = somar(financiados, (p) => p.alocado);
  const reservado = somar(financiados, (p) => p.reservado);
  const liberado = somar(financiados, (p) => p.liberado);

  const execucao =
    financiados.length === 0
      ? []
      : [
          {
            chave: "aprovado",
            rotulo: "Aprovado",
            valor: aprovado,
            texto: fmtMoeda.format(aprovado),
            cor: "var(--verde)",
          },
          {
            chave: "alocado",
            rotulo: "Alocado no orçamento",
            valor: alocado,
            texto: fmtMoeda.format(alocado),
            cor: "var(--azul-claro)",
          },
          {
            chave: "reservado",
            rotulo: "Reservado",
            valor: reservado,
            texto: fmtMoeda.format(reservado),
            cor: "var(--tinta-fraca)",
          },
          {
            chave: "liberado",
            rotulo: "Liberado",
            valor: liberado,
            texto: fmtMoeda.format(liberado),
            cor: "var(--azul)",
          },
        ];

  const comparacao = antes
    ? [
        {
          metrica: "Projetos financiados",
          a: c.financiados,
          b: antes.financiados,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Com prestação entregue",
          a: c.comRelatorio,
          b: antes.comRelatorio,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Cobertura",
          a: c.cobertura * 100,
          b: antes.cobertura * 100,
          fmt: (v: number) =>
            `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
        },
        {
          metrica: "Relatórios",
          a: c.relatorios,
          b: antes.relatorios,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Aprovado sem prestação",
          a: c.aprovadoDescoberto,
          b: antes.aprovadoDescoberto,
          fmt: (v: number) => fmtMoeda.format(v),
        },
      ]
    : [];

  return (
    <>
      {c.financiados === 0 && (
        <div className="alerta-caixa cartao">
          <h2 className="titulo">
            A Remessa {ano} ainda não tem projeto financiado no recorte
          </h2>
          <p className="sub">
            A prestação de contas só passa a existir depois da aprovação. Troque
            para a Remessa {anoAnterior ?? "anterior"} para ver o ciclo que já
            está em execução.
          </p>
        </div>
      )}

      {(c.relatoriosForaDoEsperado > 0 || c.relatoriosDeOutroCiclo > 0) && (
        <div className="alerta-caixa cartao">
          <h2 className="titulo">Ressalvas nos relatórios deste recorte</h2>
          <ul className="alertas">
            {c.relatoriosForaDoEsperado > 0 && (
              <li>
                {plural(c.relatoriosForaDoEsperado, "relatório", "relatórios")}{" "}
                entregues contra projeto fora do grupo aprovado/encerrado —
                contam como relatório, não como cobertura.
              </li>
            )}
            {c.relatoriosDeOutroCiclo > 0 && (
              <li>
                {plural(c.relatoriosDeOutroCiclo, "relatório", "relatórios")}{" "}
                com <code>cycle_id</code> de outra remessa na origem. Contam
                aqui porque a remessa vem do projeto — conferir o carimbo com a
                equipe.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="kpis">
        <Kpi
          rotulo="Devem prestar contas"
          valor={fmtInt.format(c.financiados)}
          atual={c.financiados}
          anterior={antes?.financiados}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Cobertura"
          valor={c.financiados ? pct(c.cobertura) : "—"}
          nota={`${c.comRelatorio} de ${c.financiados} projetos`}
          tom={
            !c.financiados
              ? undefined
              : c.cobertura > 0.8
                ? "bom"
                : c.cobertura > 0.4
                  ? "atencao"
                  : "ruim"
          }
        />
        <Kpi
          rotulo="Relatórios"
          valor={fmtInt.format(c.relatorios)}
          nota={`${c.enviados} enviados · ${c.rascunhos} em rascunho`}
        />
        <Kpi
          rotulo="Instituições que entregaram"
          valor={fmtInt.format(c.instituicoes)}
          nota="ao menos um relatório no ciclo"
        />
        <Kpi
          rotulo="Aprovado sem prestação"
          valor={fmtMoedaCurta.format(c.aprovadoDescoberto)}
          nota={`de ${fmtMoedaCurta.format(c.aprovadoTotal)} aprovados`}
          tom={
            !c.aprovadoTotal
              ? undefined
              : c.aprovadoDescoberto / c.aprovadoTotal > 0.5
                ? "ruim"
                : "atencao"
          }
        />
        <Kpi
          rotulo="Liberado"
          valor={fmtMoedaCurta.format(liberado)}
          nota={
            aprovado
              ? `${pct(liberado / aprovado)} do aprovado`
              : "sem aprovado no recorte"
          }
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Cobertura por trimestre"
          sub="Trimestre-calendário do relatório, não da remessa."
        >
          <Barras
            vazio="Nenhum relatório da remessa no recorte atual."
            itens={c.porTrimestre.map((t) => ({
              chave: t.rotulo,
              rotulo: t.rotulo,
              valor: t.relatorios,
              texto: `${fmtInt.format(t.projetos)} projetos · ${fmtInt.format(t.enviados)} enviados`,
              cor: "var(--azul-claro)",
            }))}
          />
        </Secao>

        <Secao
          titulo="Execução do aprovado"
          sub={
            filtroAtivo
              ? "Só os projetos financiados do recorte."
              : "Todos os projetos financiados do ciclo."
          }
        >
          <Barras
            vazio="Nenhum projeto financiado no recorte atual."
            itens={execucao}
          />
        </Secao>

        <Secao
          titulo={`Comparador ${ano} × ${anoAnterior ?? "—"}`}
          sub={
            filtroAtivo
              ? "Os dois ciclos usam os mesmos filtros."
              : "Ciclo inteiro, sem filtros."
          }
        >
          {comparacao.length === 0 ? (
            <p className="sub">Sem ciclo anterior para comparar.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th className="n">{ano}</th>
                  <th className="n">{anoAnterior}</th>
                  <th className="n">Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((l) => {
                  const d = l.a - l.b;
                  return (
                    <tr key={l.metrica}>
                      <td>{l.metrica}</td>
                      <td className="n">{l.fmt(l.a)}</td>
                      <td className="n">{l.fmt(l.b)}</td>
                      <td
                        className={`n ${d === 0 ? "" : d > 0 ? "subiu" : "desceu"}`}
                      >
                        {d === 0
                          ? "="
                          : `${d > 0 ? "+" : "−"}${l.fmt(Math.abs(d))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao
          titulo="Pendências"
          sub="Projetos financiados sem nenhum relatório, do maior aprovado para o menor."
          largura="cheia"
        >
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>Instituição</th>
                  <th>País</th>
                  <th className="n">Aprovado</th>
                  <th className="n">Liberado</th>
                </tr>
              </thead>
              <tbody>
                {c.pendentes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.titulo}</td>
                    <td>{p.instituicaoNome ?? "—"}</td>
                    <td>{p.local.nomePt}</td>
                    <td className="n">
                      {p.aprovado === null ? "—" : fmtMoeda.format(p.aprovado)}
                    </td>
                    <td className="n">
                      {p.liberado === null ? "—" : fmtMoeda.format(p.liberado)}
                    </td>
                  </tr>
                ))}
                {c.pendentes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="sub">
                      {c.financiados === 0
                        ? "Nenhum projeto financiado no recorte."
                        : "Todos os projetos financiados do recorte entregaram."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>
    </>
  );
}
