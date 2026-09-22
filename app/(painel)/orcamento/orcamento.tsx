"use client";

import { useMemo } from "react";
import { ehConveniada } from "@/lib/agregar";
import type { OrcamentoCiclo, ProjetoCiclo } from "@/lib/types";
import { usePainel } from "../contexto";
import { fmtInt, fmtMoeda, fmtMoedaCurta, num, pct } from "../formato";
import { Barras, Kpi, Secao } from "../ui";

/**
 * Orçamento — teto (conveniadas / não conveniadas) × solicitado × reservado.
 *
 * O teto vem da linha de `resource_allocations` escolhida pela regra da Fase 1
 * (confirmado E plausível; senão o maior teto plausível + alerta). Os alertas
 * ficam no topo de propósito: em 2025 as linhas "confirmado" são de teste e a
 * real está como "rascunho" — quem decide na reunião precisa ver isso.
 *
 * Solicitado/aprovado são recalculados sob os filtros do painel; o teto, não
 * (ele é do ciclo inteiro).
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

function fatia(projetos: ProjetoCiclo[], conveniada: boolean) {
  const lista = projetos.filter((p) => ehConveniada(p) === conveniada);
  return {
    projetos: lista.length,
    solicitado: somar(lista, (p) => p.solicitado),
    aprovado: somar(lista, (p) => p.aprovado),
    reservado: somar(lista, (p) => p.reservado),
  };
}

export default function Orcamento({
  orcamentos,
}: {
  orcamentos: Record<number, OrcamentoCiclo>;
}) {
  const { ano, anoAnterior, projetos, projetosAnteriores, filtroAtivo } =
    usePainel();

  const o = orcamentos[ano];
  const anterior = anoAnterior ? orcamentos[anoAnterior] : undefined;

  const solicitado = somar(projetos, (p) => p.solicitado);
  const aprovado = somar(projetos, (p) => p.aprovado);
  const reservado = somar(projetos, (p) => p.reservado);
  const liberado = somar(projetos, (p) => p.liberado);

  const teto = o?.tetoTotal ?? null;
  const saldo = teto === null ? null : teto - aprovado;
  const pressao = teto ? solicitado / teto : null;

  const grupos = useMemo(
    () => [
      {
        nome: "Conveniadas",
        teto: o?.tetoConveniadas ?? null,
        ...fatia(projetos, true),
      },
      {
        nome: "Não conveniadas",
        teto: o?.tetoNaoConveniadas ?? null,
        ...fatia(projetos, false),
      },
    ],
    [projetos, o],
  );

  const receita = o
    ? [
        { rotulo: "Faturamento previsto", valor: o.faturamento, moeda: true },
        {
          rotulo: "Porcentagem de doação",
          valor: o.porcentagemDoacao,
          moeda: false,
        },
        {
          rotulo: "Margem de segurança",
          valor: o.margemSeguranca,
          moeda: false,
        },
        {
          rotulo: "Custos administrativos",
          valor: o.custosAdministrativos,
          moeda: true,
        },
        { rotulo: "Ofertas aprovadas", valor: o.ofertasAprovadas, moeda: true },
        {
          rotulo: "Valor Ministério da Saúde",
          valor: o.valorMinisterioSaude,
          moeda: true,
        },
        { rotulo: "Teto conveniadas", valor: o.tetoConveniadas, moeda: true },
        {
          rotulo: "Teto não conveniadas",
          valor: o.tetoNaoConveniadas,
          moeda: true,
        },
      ]
    : [];

  const comparacao = anterior
    ? [
        {
          metrica: "Teto total",
          a: teto,
          b: anterior.tetoTotal,
        },
        {
          metrica: "Solicitado",
          a: solicitado,
          b: somar(projetosAnteriores, (p) => p.solicitado),
        },
        {
          metrica: "Aprovado",
          a: aprovado,
          b: somar(projetosAnteriores, (p) => p.aprovado),
        },
        {
          metrica: "Reservado",
          a: reservado,
          b: somar(projetosAnteriores, (p) => p.reservado),
        },
        {
          metrica: "Saldo (teto − aprovado)",
          a: saldo,
          b:
            anterior.tetoTotal === null
              ? null
              : anterior.tetoTotal -
                somar(projetosAnteriores, (p) => p.aprovado),
        },
      ]
    : [];

  if (!o) {
    return (
      <div className="bloco cartao">
        <h2 className="titulo">Sem orçamento para a Remessa {ano}</h2>
        <p className="sub">
          Nenhuma linha em <code>resource_allocations</code> para o ciclo.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="alerta-caixa cartao">
        <h2 className="titulo">
          Linha usada: <b>{o.fonteOrcamento.status ?? "sem status"}</b> —{" "}
          {o.fonteOrcamento.criterio}
        </h2>
        {o.fonteOrcamento.alertas.length === 0 ? (
          <p className="sub">Sem ressalvas nesta linha de orçamento.</p>
        ) : (
          <ul className="alertas">
            {o.fonteOrcamento.alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="kpis">
        <Kpi
          rotulo="Teto disponível"
          valor={teto === null ? "—" : fmtMoedaCurta.format(teto)}
          atual={teto ?? undefined}
          anterior={anterior?.tetoTotal}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
        />
        <Kpi
          rotulo="Solicitado"
          valor={fmtMoedaCurta.format(solicitado)}
          atual={solicitado}
          anterior={somar(projetosAnteriores, (p) => p.solicitado)}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
          inverso
        />
        <Kpi
          rotulo="Aprovado"
          valor={fmtMoedaCurta.format(aprovado)}
          atual={aprovado}
          anterior={somar(projetosAnteriores, (p) => p.aprovado)}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
        />
        <Kpi
          rotulo="Saldo do teto"
          valor={saldo === null ? "—" : fmtMoedaCurta.format(saldo)}
          nota={saldo === null ? "sem teto confiável" : "teto − aprovado"}
          tom={
            saldo === null || teto === null
              ? undefined
              : saldo < 0
                ? "ruim"
                : saldo < teto * 0.1
                  ? "atencao"
                  : "bom"
          }
        />
        <Kpi
          rotulo="Pressão da demanda"
          valor={pressao === null ? "—" : pct(pressao)}
          nota="solicitado ÷ teto"
          tom={
            pressao === null
              ? undefined
              : pressao > 1.5
                ? "ruim"
                : pressao > 1
                  ? "atencao"
                  : "bom"
          }
        />
        <Kpi
          rotulo="Reservado"
          valor={fmtMoedaCurta.format(reservado)}
          nota={`${fmtMoedaCurta.format(liberado)} já liberado`}
        />
      </div>

      <div className="grade">
        <Secao
          titulo="Teto × demanda"
          sub={
            filtroAtivo
              ? "Teto é do ciclo inteiro; solicitado e aprovado seguem os filtros."
              : "Ciclo inteiro."
          }
        >
          <Barras
            itens={[
              {
                chave: "teto",
                rotulo: "Teto disponível",
                valor: teto ?? 0,
                texto: teto === null ? "—" : fmtMoeda.format(teto),
                cor: "var(--azul-claro)",
              },
              {
                chave: "solicitado",
                rotulo: "Solicitado",
                valor: solicitado,
                texto: fmtMoeda.format(solicitado),
                cor: "var(--laranja)",
              },
              {
                chave: "aprovado",
                rotulo: "Aprovado",
                valor: aprovado,
                texto: fmtMoeda.format(aprovado),
                cor: "var(--verde)",
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
            ]}
          />
        </Secao>

        <Secao
          titulo="Conveniadas × não conveniadas"
          sub="Cada grupo tem teto próprio na linha de orçamento."
          largura="dupla"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Grupo</th>
                <th className="n">Projetos</th>
                <th className="n">Teto</th>
                <th className="n">Solicitado</th>
                <th className="n">Aprovado</th>
                <th className="n">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const saldoG = g.teto === null ? null : g.teto - g.aprovado;
                return (
                  <tr key={g.nome}>
                    <td>{g.nome}</td>
                    <td className="n">{fmtInt.format(g.projetos)}</td>
                    <td className="n">
                      {g.teto === null ? "—" : fmtMoeda.format(g.teto)}
                      {!g.teto && (
                        <span
                          className="marca-alerta"
                          role="img"
                          aria-label="Teto zerado ou vazio na origem"
                          title="Teto zerado ou vazio na origem"
                        >
                          {" "}
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="n">{fmtMoeda.format(g.solicitado)}</td>
                    <td className="n">{fmtMoeda.format(g.aprovado)}</td>
                    <td
                      className={`n ${saldoG !== null && saldoG < 0 ? "desceu" : ""}`}
                    >
                      {saldoG === null ? "—" : fmtMoeda.format(saldoG)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Secao>

        <Secao
          titulo="Composição da linha de orçamento"
          sub="Valores como estão na origem — nada é recalculado aqui."
        >
          <table className="tabela">
            <tbody>
              {receita.map((r) => (
                <tr key={r.rotulo}>
                  <td>{r.rotulo}</td>
                  <td className="n">
                    {r.valor === null
                      ? "—"
                      : r.moeda
                        ? fmtMoeda.format(r.valor)
                        : num(r.valor, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>

        <Secao
          titulo={`Comparador ${ano} × ${anoAnterior ?? "—"}`}
          sub={
            filtroAtivo
              ? "Os dois ciclos usam os mesmos filtros (menos o teto)."
              : "Ciclo inteiro."
          }
          largura="dupla"
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
                  const d = l.a === null || l.b === null ? null : l.a - l.b;
                  return (
                    <tr key={l.metrica}>
                      <td>{l.metrica}</td>
                      <td className="n">
                        {l.a === null ? "—" : fmtMoeda.format(l.a)}
                      </td>
                      <td className="n">
                        {l.b === null ? "—" : fmtMoeda.format(l.b)}
                      </td>
                      <td
                        className={`n ${d === null || d === 0 ? "" : d > 0 ? "subiu" : "desceu"}`}
                      >
                        {d === null
                          ? "—"
                          : d === 0
                            ? "="
                            : `${d > 0 ? "+" : "−"}${fmtMoeda.format(Math.abs(d))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Secao>
      </div>
    </>
  );
}
