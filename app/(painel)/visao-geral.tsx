"use client";

import { useMemo, type CSSProperties } from "react";
import {
  agrupar,
  curvaAcumulada,
  estatisticaNota,
  montarRenovacoes,
  montarResumo,
  projetosAte,
} from "@/lib/agregar";
import type { OrcamentoCiclo, ProjetoCiclo, StatusGrupo } from "@/lib/types";
import { alternar, usePainel } from "./contexto";
import {
  COR_STATUS,
  ORDEM_STATUS,
  ROTULO_STATUS,
  fmtInt,
  fmtMoeda,
  fmtMoedaCurta,
  num,
  pct,
  plural,
  rotuloCategoria,
} from "./formato";
import { Barras, Kpi, Secao } from "./ui";

/**
 * Visão Geral — como está o ciclo: KPIs com delta, concentração do pedido,
 * funil, orçamento vs. demanda, ranking de categorias/continentes, renovações,
 * comparador 2026 × 2025 e os maiores pedidos.
 *
 * Tudo reagrega a partir dos projetos já filtrados no contexto; o orçamento vem
 * do servidor (teto), mas solicitado/aprovado são recalculados sob os filtros.
 */

const somar = (ps: ProjetoCiclo[], f: (p: ProjetoCiclo) => number | null) =>
  ps.reduce((s, p) => s + (f(p) ?? 0), 0);

const notasDe = (ps: ProjetoCiclo[]) =>
  ps.map((p) => p.notaMediana).filter((v): v is number => v !== null);

/**
 * Curva de concentração — o pedido acumulado, do maior projeto para o menor.
 *
 * Existe porque nenhum ranking responde a pergunta da reunião: o teto não corta
 * uma fatia de cada projeto, corta uma cauda. Aqui a linha do teto cruza a curva
 * num ponto, e esse ponto é a resposta ("os N maiores pedidos já esgotam o
 * teto"). O ciclo anterior entra tracejado como régua da mudança de forma.
 *
 * SVG na mão em vez de biblioteca de gráfico: são duas polilinhas e duas réguas
 * (ver `docs/plano-dashboard.md` e o princípio 5 do PRODUCT.md). Sem camada de
 * hover de propósito — esta página é lida na TV e sai impressa, e as duas
 * leituras que importam estão rotuladas direto na curva e repetidas em texto no
 * rodapé, que é o que sobrevive aos dois destinos.
 */
function Concentracao({
  atual,
  anterior,
  teto,
  ano,
  anoAnterior,
}: {
  atual: number[];
  anterior: number[];
  teto: number | null;
  ano: number;
  anoAnterior: number | undefined;
}) {
  const L = 62;
  const R = 14;
  const T = 14;
  const B = 30;
  const W = 760;
  const H = 260;

  const total = atual[atual.length - 1] ?? 0;
  const maxX = Math.max(atual.length, anterior.length, 1);
  const maxY = Math.max(total, anterior[anterior.length - 1] ?? 0, teto ?? 0);
  const x = (i: number) => L + (i / maxX) * (W - L - R);
  const y = (v: number) => H - B - (v / (maxY || 1)) * (H - T - B);

  // Começa em (0,0): antes do primeiro projeto, nada foi pedido.
  const caminho = (cum: number[]) =>
    `M${x(0).toFixed(1)} ${y(0).toFixed(1)} ` +
    cum.map((v, i) => `L${x(i + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const metade = projetosAte(atual, total / 2);
  const noTeto = teto === null ? null : projetosAte(atual, teto);
  // Só marca o corte quando ele existe: se o teto cobre a remessa inteira, a
  // curva termina abaixo da régua e não há projeto nenhum a apontar.
  const corte =
    noTeto !== null && teto !== null && total > teto ? noTeto : null;

  const marcas = [
    { n: metade, titulo: "metade do pedido" },
    ...(corte ? [{ n: corte, titulo: "teto" }] : []),
  ]
    .map((m) => ({ ...m, v: atual[m.n - 1] }))
    .filter(
      (m): m is { n: number; titulo: string; v: number } => m.v !== undefined,
    );

  const passo = maxX > 200 ? 50 : maxX > 80 ? 25 : 10;
  const ticksX = Array.from(
    { length: Math.floor(maxX / passo) + 1 },
    (_, i) => i * passo,
  ).filter((n) => n > 0);

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Curva de concentração da Remessa ${ano}: ${plural(metade, "projeto concentra", "projetos concentram")} metade dos ${fmtMoedaCurta.format(total)} pedidos.${corte ? ` Os ${fmtInt.format(corte)} maiores pedidos esgotam o teto.` : ""}`}
      >
        {/* Réguas horizontais em R$ — recessivas, só para ancorar a leitura. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              className="grade-linha"
              x1={L}
              x2={W - R}
              y1={y(maxY * f)}
              y2={y(maxY * f)}
            />
            <text
              className="eixo"
              x={L - 8}
              y={y(maxY * f) + 4}
              textAnchor="end"
            >
              {fmtMoedaCurta.format(maxY * f)}
            </text>
          </g>
        ))}

        {/* Só os números: o que o eixo x significa já está no subtítulo do
            bloco, e a frase repetida aqui colidia com os últimos ticks. */}
        {ticksX.map((n) => (
          <text
            key={n}
            className="eixo"
            x={x(n)}
            y={H - 10}
            textAnchor="middle"
          >
            {n}
          </text>
        ))}

        {anterior.length > 0 && (
          <path className="curva-anterior" d={caminho(anterior)} />
        )}
        <path className="curva-atual" d={caminho(atual)} />

        {teto !== null && teto > 0 && (
          <>
            <line
              className="curva-teto"
              x1={L}
              x2={W - R}
              y1={y(teto)}
              y2={y(teto)}
            />
            <text className="eixo eixo-teto" x={L + 4} y={y(teto) - 6}>
              Teto {fmtMoedaCurta.format(teto)}
            </text>
          </>
        )}

        {/* Leituras direto na curva: ponto + haste até o eixo + número. */}
        {marcas.map((m) => (
          <g key={m.titulo}>
            <line
              className="marca-haste"
              x1={x(m.n)}
              x2={x(m.n)}
              y1={y(m.v)}
              y2={H - B}
            />
            <circle className="marca-ponto" cx={x(m.n)} cy={y(m.v)} r={4.5} />
            <text
              className="marca-rotulo"
              x={x(m.n) + 8}
              y={y(m.v) - 8}
              textAnchor={m.n / maxX > 0.75 ? "end" : "start"}
            >
              {fmtInt.format(m.n)} projetos
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="legenda-grafico">
        <span>
          <svg width="26" height="8" aria-hidden="true">
            <line className="curva-atual" x1="0" x2="26" y1="4" y2="4" />
          </svg>
          Remessa {ano}
        </span>
        {anterior.length > 0 && (
          <span>
            <svg width="26" height="8" aria-hidden="true">
              <line className="curva-anterior" x1="0" x2="26" y1="4" y2="4" />
            </svg>
            Remessa {anoAnterior}
          </span>
        )}
        {teto !== null && teto > 0 && (
          <span>
            <svg width="26" height="8" aria-hidden="true">
              <line className="curva-teto" x1="0" x2="26" y1="4" y2="4" />
            </svg>
            Teto do ciclo
          </span>
        )}
      </figcaption>
    </figure>
  );
}

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

  const curva = useMemo(() => curvaAcumulada(projetos), [projetos]);
  const curvaAntes = useMemo(
    () => curvaAcumulada(projetosAnteriores),
    [projetosAnteriores],
  );
  const totalPedido = curva[curva.length - 1] ?? 0;
  const metadeEm = projetosAte(curva, totalPedido / 2);
  const esgotamTeto =
    teto !== null && totalPedido > teto ? projetosAte(curva, teto) : null;

  const renovacoes = useMemo(() => montarRenovacoes(projetos), [projetos]);

  /**
   * Régua de aprovação para o ranking de categorias: o que ESTE ciclo já
   * aprovou; num ciclo ainda em avaliação (2026 tem zero aprovado), o que o
   * conselho aprovou na mesma categoria no ciclo anterior. Nunca uma projeção —
   * os dois números vêm da origem.
   */
  const cicloJaAprovou = resumo.aprovado > 0;
  const aprovadoAntesPorCategoria = useMemo(
    () =>
      new Map(
        (antes?.porCategoria ?? []).map((c) => [c.categoria, c.aprovado]),
      ),
    [antes],
  );
  const referenciaCategoria = (categoria: string, aprovado: number) =>
    cicloJaAprovou ? aprovado : aprovadoAntesPorCategoria.get(categoria);
  const temReferenciaCategoria = cicloJaAprovou || (antes?.aprovado ?? 0) > 0;

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
          /* O número que a reunião precisa fechar é o vão em reais, não a razão. */
          nota={
            teto === null
              ? "sem teto confiável no ciclo"
              : `${fmtMoedaCurta.format(Math.abs(resumo.solicitado - teto))} ${
                  resumo.solicitado > teto ? "acima" : "abaixo"
                } do teto de ${fmtMoedaCurta.format(teto)}`
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
          titulo="Concentração do pedido"
          sub="Pedido acumulado, do maior projeto para o menor. O teto corta uma cauda, não uma fatia de cada projeto."
          largura="cheia"
        >
          {curva.length < 5 ? (
            <p className="sub">
              Poucos projetos no recorte para uma curva de concentração.
            </p>
          ) : (
            <>
              <Concentracao
                atual={curva}
                anterior={curvaAntes}
                teto={teto}
                ano={ano}
                anoAnterior={anoAnterior}
              />
              <p className="rodape">
                Metade dos {fmtMoeda.format(totalPedido)} pedidos está em{" "}
                <b>{plural(metadeEm, "projeto", "projetos")}</b> (
                {pct(metadeEm / curva.length)} do recorte).{" "}
                {esgotamTeto !== null ? (
                  <>
                    Os <b>{fmtInt.format(esgotamTeto)} maiores pedidos</b> já
                    esgotam o teto de {fmtMoeda.format(teto ?? 0)} — os{" "}
                    {plural(
                      curva.length - esgotamTeto,
                      "projeto restante",
                      "projetos restantes",
                    )}{" "}
                    disputam o que sobrar.
                  </>
                ) : teto === null ? (
                  "Sem teto confiável no ciclo para marcar o corte."
                ) : (
                  "O teto cobre o pedido inteiro do recorte."
                )}
              </p>
            </>
          )}
        </Secao>

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
              ativo: filtros.status.includes(f.grupo),
              aoClicar: () =>
                aplicar({ status: alternar(filtros.status, f.grupo) }),
            }))}
          />
        </Secao>

        {/* A pista clara é o pedido; o trecho sólido é a régua de aprovação —
            deste ciclo se ele já decidiu, senão do ciclo anterior. É o que
            separa "categoria que pede muito" de "categoria que leva muito". */}
        <Secao
          titulo="Categorias"
          sub={
            temReferenciaCategoria
              ? cicloJaAprovou
                ? "Barra clara: pedido. Trecho sólido: aprovado neste ciclo."
                : `Barra clara: pedido de ${ano}. Trecho sólido: o que a mesma categoria levou em ${anoAnterior}.`
              : "Ordenadas por valor solicitado."
          }
          largura="dupla"
        >
          <Barras
            itens={resumo.porCategoria.map((c) => {
              const ref = referenciaCategoria(c.categoria, c.aprovado);
              return {
                chave: c.categoria,
                rotulo: rotuloCategoria(c.categoria),
                valor: c.solicitado,
                referencia: temReferenciaCategoria ? (ref ?? 0) : undefined,
                texto: temReferenciaCategoria
                  ? `${fmtInt.format(c.projetos)} · pede ${fmtMoedaCurta.format(c.solicitado)} · ${
                      cicloJaAprovou ? "aprovado" : `levou em ${anoAnterior}`
                    } ${fmtMoedaCurta.format(ref ?? 0)}`
                  : `${fmtInt.format(c.projetos)} · ${fmtMoedaCurta.format(c.solicitado)}`,
                ativo: filtros.categoria.includes(c.categoria),
                aoClicar: () =>
                  aplicar({
                    categoria: alternar(filtros.categoria, c.categoria),
                  }),
              };
            })}
          />
          {temReferenciaCategoria && !cicloJaAprovou && (
            <p className="rodape">
              O recorte pede {fmtMoeda.format(resumo.solicitado)}; em{" "}
              {anoAnterior} o conselho aprovou{" "}
              {fmtMoeda.format(antes?.aprovado ?? 0)} nas mesmas categorias.
              Régua histórica, não previsão — nenhum dos dois números é
              calculado aqui.
            </p>
          )}
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

        <Secao titulo="Continentes" sub="Clique para recortar o painel.">
          <Barras
            itens={resumo.porContinente.map((c) => ({
              chave: c.continente,
              rotulo: c.continente,
              valor: c.projetos,
              texto: `${fmtInt.format(c.projetos)} · ${fmtMoedaCurta.format(c.solicitado)}`,
              ativo: filtros.continente.includes(c.continente),
              aoClicar: () =>
                aplicar({
                  continente: alternar(filtros.continente, c.continente),
                }),
            }))}
          />
        </Secao>

        {/* Só existe quando a triagem casou projeto a projeto (Fase 5) — em 2025
            não há remessa anterior mapeada, e um cartão vazio não é dado. */}
        {renovacoes.projetos.length > 0 && (
          <Secao
            titulo="Renovações: quanto pedem a mais"
            sub={`Os ${fmtInt.format(renovacoes.projetos.length)} projetos com vínculo e valor na remessa anterior.`}
          >
            <Barras
              itens={renovacoes.faixas
                .filter((f) => f.projetos > 0)
                .map((f) => ({
                  chave: f.rotulo,
                  rotulo: f.rotulo,
                  valor: f.pedido,
                  texto: `${fmtInt.format(f.projetos)} · ${fmtMoedaCurta.format(f.pedido)}`,
                  cor:
                    f.rotulo === "Mais que dobra"
                      ? "var(--laranja)"
                      : f.rotulo === "Pede menos" ||
                          f.rotulo === "Repete o valor"
                        ? "var(--neutro-forte)"
                        : "var(--azul)",
                }))}
            />
            <p className="rodape">
              Juntas pedem {fmtMoeda.format(renovacoes.pedido)} tendo recebido{" "}
              {fmtMoeda.format(renovacoes.recebido)} —{" "}
              <b
                className={
                  (renovacoes.variacao ?? 0) > 0 ? "desceu" : undefined
                }
              >
                {renovacoes.variacao === null
                  ? "—"
                  : `${renovacoes.variacao > 0 ? "+" : ""}${pct(renovacoes.variacao)}`}
              </b>
              .
            </p>
          </Secao>
        )}

        <Secao
          titulo={`Comparador ${ano} × ${anoAnterior ?? "—"}`}
          sub={
            filtroAtivo
              ? "Os dois ciclos usam os mesmos filtros."
              : "Ciclo inteiro, sem filtros."
          }
          largura="cheia"
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
                      style={
                        {
                          "--cor": COR_STATUS[p.statusGrupo],
                        } as CSSProperties
                      }
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
