"use client";

import { useMemo } from "react";
import { agrupar, estatisticaNota, montarResumo } from "@/lib/agregar";
import type { OrcamentoCiclo, ProjetoCiclo, StatusGrupo } from "@/lib/types";
import { TODOS, usePainel } from "./contexto";
import {
  COR_STATUS,
  ORDEM_STATUS,
  ROTULO_STATUS,
  fmtInt,
  fmtMoeda,
  fmtMoedaCurta,
  num,
  pct,
} from "./formato";
import { Barras, Kpi, Secao } from "./ui";

/**
 * Visão Geral — como está o ciclo: KPIs com delta, funil, orçamento vs. demanda,
 * ranking de categorias/continentes, comparador 2026 × 2025 e os maiores pedidos.
 *
 * Tudo reagrega a partir dos projetos já filtrados no contexto; o orçamento vem
 * do servidor (teto), mas solicitado/aprovado são recalculados sob os filtros.
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

const notasDe = (ps: ProjetoCiclo[]) =>
  ps.map((p) => p.notaMediana).filter((v): v is number => v !== null);

function funil(projetos: ProjetoCiclo[]) {
  const grupos = agrupar(projetos, (p) => p.statusGrupo);
  return ORDEM_STATUS.filter((g) => grupos.has(g)).map((g) => {
    const lista = grupos.get(g) ?? [];
    return {
      grupo: g as StatusGrupo,
      projetos: lista.length,
      solicitado: somar(lista, (p) => p.solicitado),
    };
  });
}

export default function VisaoGeral({
  orcamentos,
}: {
  orcamentos: Record<number, OrcamentoCiclo>;
}) {
  const {
    ano,
    anoAnterior,
    projetos,
    projetosAnteriores,
    filtros,
    filtroAtivo,
    aplicar,
  } = usePainel();

  const resumo = useMemo(() => montarResumo(projetos, ano), [projetos, ano]);
  const antes = useMemo(
    () => (anoAnterior ? montarResumo(projetosAnteriores, anoAnterior) : null),
    [projetosAnteriores, anoAnterior],
  );

  const nota = useMemo(() => estatisticaNota(notasDe(projetos)), [projetos]);
  const notaAntes = useMemo(
    () => estatisticaNota(notasDe(projetosAnteriores)),
    [projetosAnteriores],
  );

  const orcamento = orcamentos[ano];
  const teto = orcamento?.tetoTotal ?? null;
  const pressao = teto ? resumo.solicitado / teto : null;

  const maiores = useMemo(
    () => [...projetos].sort((a, b) => b.solicitado - a.solicitado).slice(0, 8),
    [projetos],
  );

  const comparacao = antes
    ? [
        {
          metrica: "Projetos",
          a: resumo.projetos,
          b: antes.projetos,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Solicitado",
          a: resumo.solicitado,
          b: antes.solicitado,
          fmt: (v: number) => fmtMoeda.format(v),
        },
        {
          metrica: "Aprovado",
          a: resumo.aprovado,
          b: antes.aprovado,
          fmt: (v: number) => fmtMoeda.format(v),
        },
        {
          metrica: "Países alcançados",
          a: resumo.paisesAlcancados,
          b: antes.paisesAlcancados,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Instituições",
          a: resumo.instituicoes,
          b: antes.instituicoes,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Conveniadas",
          a: resumo.instituicoesConveniadas,
          b: antes.instituicoesConveniadas,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Projetos em área sensível",
          a: resumo.projetosSensiveis,
          b: antes.projetosSensiveis,
          fmt: (v: number) => fmtInt.format(v),
        },
        {
          metrica: "Nota mediana (projeto)",
          a: nota.mediana,
          b: notaAntes.mediana,
          fmt: (v: number) => num(v, 2),
        },
      ]
    : [];

  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Projetos"
          valor={fmtInt.format(resumo.projetos)}
          atual={resumo.projetos}
          anterior={antes?.projetos}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Solicitado"
          valor={fmtMoedaCurta.format(resumo.solicitado)}
          atual={resumo.solicitado}
          anterior={antes?.solicitado}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
        />
        <Kpi
          rotulo="Aprovado"
          valor={fmtMoedaCurta.format(resumo.aprovado)}
          atual={resumo.aprovado}
          anterior={antes?.aprovado}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
        />
        <Kpi
          rotulo="Instituições"
          valor={fmtInt.format(resumo.instituicoes)}
          atual={resumo.instituicoes}
          anterior={antes?.instituicoes}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
          nota={`${resumo.instituicoesConveniadas} conveniadas`}
        />
        <Kpi
          rotulo="Países alcançados"
          valor={fmtInt.format(resumo.paisesAlcancados)}
          atual={resumo.paisesAlcancados}
          anterior={antes?.paisesAlcancados}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Pressão da demanda"
          valor={pressao === null ? "—" : pct(pressao)}
          nota={
            teto === null
              ? "sem teto confiável no ciclo"
              : `solicitado ÷ teto de ${fmtMoedaCurta.format(teto)}`
          }
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
      </div>

      <div className="grade">
        <Secao
          titulo="Funil do ciclo"
          sub="Clique para filtrar o painel inteiro por status."
        >
          <Barras
            itens={funil(projetos).map((f) => ({
              chave: f.grupo,
              rotulo: ROTULO_STATUS[f.grupo],
              valor: f.projetos,
              texto: `${fmtInt.format(f.projetos)} · ${fmtMoedaCurta.format(f.solicitado)}`,
              cor: COR_STATUS[f.grupo],
              ativo: filtros.status === f.grupo,
              aoClicar: () =>
                aplicar({
                  status: filtros.status === f.grupo ? TODOS : f.grupo,
                }),
            }))}
          />
        </Secao>

        <Secao
          titulo="Orçamento vs. demanda"
          sub={
            orcamento
              ? `Teto da linha "${orcamento.fonteOrcamento.status ?? "sem status"}" — ${orcamento.fonteOrcamento.criterio}.`
              : "Sem linha de orçamento para o ciclo."
          }
        >
          {orcamento && (
            <>
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
                    valor: resumo.solicitado,
                    texto: fmtMoeda.format(resumo.solicitado),
                    cor: "var(--laranja)",
                  },
                  {
                    chave: "aprovado",
                    rotulo: "Aprovado",
                    valor: resumo.aprovado,
                    texto: fmtMoeda.format(resumo.aprovado),
                    cor: "var(--verde)",
                  },
                  {
                    chave: "reservado",
                    rotulo: "Reservado",
                    valor: somar(projetos, (p) => p.reservado),
                    texto: fmtMoeda.format(somar(projetos, (p) => p.reservado)),
                    cor: "var(--tinta-fraca)",
                  },
                ]}
              />
              {orcamento.fonteOrcamento.alertas.length > 0 && (
                <ul className="alertas">
                  {orcamento.fonteOrcamento.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Secao>

        <Secao titulo="Categorias" sub="Ordenadas por valor solicitado.">
          <Barras
            itens={resumo.porCategoria.map((c) => ({
              chave: c.categoria,
              rotulo: c.categoria,
              valor: c.solicitado,
              texto: `${fmtInt.format(c.projetos)} · ${fmtMoedaCurta.format(c.solicitado)}`,
              ativo: filtros.categoria === c.categoria,
              aoClicar: () =>
                aplicar({
                  categoria:
                    filtros.categoria === c.categoria ? TODOS : c.categoria,
                }),
            }))}
          />
        </Secao>

        <Secao titulo="Continentes" sub="Clique para recortar o painel.">
          <Barras
            itens={resumo.porContinente.map((c) => ({
              chave: c.continente,
              rotulo: c.continente,
              valor: c.projetos,
              texto: `${fmtInt.format(c.projetos)} · ${fmtMoedaCurta.format(c.solicitado)}`,
              ativo: filtros.continente === c.continente,
              aoClicar: () =>
                aplicar({
                  continente:
                    filtros.continente === c.continente ? TODOS : c.continente,
                }),
            }))}
          />
        </Secao>

        <Secao
          titulo={`Comparador ${ano} × ${anoAnterior ?? "—"}`}
          sub={
            filtroAtivo
              ? "Os dois ciclos usam os mesmos filtros."
              : "Ciclo inteiro, sem filtros."
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
                      <td className="n">{l.a === null ? "—" : l.fmt(l.a)}</td>
                      <td className="n">{l.b === null ? "—" : l.fmt(l.b)}</td>
                      <td
                        className={`n ${d === null || d === 0 ? "" : d > 0 ? "subiu" : "desceu"}`}
                      >
                        {d === null
                          ? "—"
                          : d === 0
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
          titulo="Maiores pedidos"
          sub="Os oito maiores valores solicitados no recorte atual."
          largura="cheia"
        >
          <table className="tabela">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Instituição</th>
                <th>País</th>
                <th>Status</th>
                <th className="n">Nota</th>
                <th className="n">Solicitado</th>
                <th className="n">Aprovado</th>
              </tr>
            </thead>
            <tbody>
              {maiores.map((p) => (
                <tr key={p.id}>
                  <td>{p.titulo}</td>
                  <td>{p.instituicaoNome ?? "—"}</td>
                  <td>{p.local.nomePt}</td>
                  <td>
                    <span
                      className="pastilha"
                      style={{ background: COR_STATUS[p.statusGrupo] }}
                    >
                      {ROTULO_STATUS[p.statusGrupo]}
                    </span>
                  </td>
                  <td className="n">{num(p.notaMediana, 1)}</td>
                  <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                  <td className="n">
                    {p.aprovado === null ? "—" : fmtMoeda.format(p.aprovado)}
                  </td>
                </tr>
              ))}
              {maiores.length === 0 && (
                <tr>
                  <td colSpan={7} className="sub">
                    Nenhum projeto com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Secao>
      </div>
    </>
  );
}
