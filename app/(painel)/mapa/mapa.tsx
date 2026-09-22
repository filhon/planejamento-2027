"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { agregarPorPais, montarResumo } from "@/lib/agregar";
import type { PaisGeo } from "@/lib/mapa";
import type { ProjetoLocal } from "@/lib/types";
import { usePainel } from "../contexto";
import {
  fmtInt,
  fmtMoeda,
  fmtMoedaCurta,
  pct,
  plural,
  ROTULO_STATUS,
  rotuloCategoria,
  SEM_RESULTADO,
} from "../formato";
import { Kpi, Secao } from "../ui";

/**
 * Página do Mapa-múndi — o coração do painel (docs/plano-dashboard.md §5).
 *
 * Os projetos já chegam filtrados pelo contexto do layout; mapa, KPIs e ranking
 * reagregam juntos no navegador, com as MESMAS funções de `src/lib/agregar.ts`
 * usadas no servidor — nada de segunda implementação das regras.
 */

export default function Mapa({
  geo,
  viewBox,
}: {
  geo: PaisGeo[];
  viewBox: string;
}) {
  const {
    ano,
    anoAnterior,
    projetos,
    projetosAnteriores,
    filtros,
    alternarPais,
  } = usePainel();

  const [dica, setDica] = useState<{
    x: number;
    y: number;
    local: ProjetoLocal;
  } | null>(null);
  const areaMapa = useRef<HTMLDivElement>(null);
  const cartaoMapa = useRef<HTMLElement>(null);
  const [cheio, setCheio] = useState(false);

  // Tela cheia do mapa é a nativa do navegador no próprio cartão — o estado só
  // acerta o rótulo do botão quando a saída vem do Esc, e não do clique.
  useEffect(() => {
    const aoTrocar = () =>
      setCheio(document.fullscreenElement === cartaoMapa.current);
    document.addEventListener("fullscreenchange", aoTrocar);
    return () => document.removeEventListener("fullscreenchange", aoTrocar);
  }, []);

  const locais = useMemo(() => agregarPorPais(projetos), [projetos]);
  const resumo = useMemo(() => montarResumo(projetos, ano), [projetos, ano]);
  const resumoAnterior = useMemo(
    () => (anoAnterior ? montarResumo(projetosAnteriores, anoAnterior) : null),
    [projetosAnteriores, anoAnterior],
  );

  const porIso = useMemo(
    () =>
      new Map(
        locais.filter((l) => l.iso3).map((l) => [l.iso3 as string, l] as const),
      ),
    [locais],
  );
  const maxProjetos = Math.max(
    1,
    ...[...porIso.values()].map((l) => l.projetos),
  );

  const isoNoMapa = useMemo(
    () => new Set(geo.map((g) => g.iso3).filter(Boolean)),
    [geo],
  );
  // Grupos que os KPIs contam mas o choropleth não pinta — precisam ficar à vista.
  const sensiveis = locais.filter((l) => l.sensivel);
  const naoMapeados = locais.filter((l) => !l.iso3 && !l.sensivel);
  const semGeometria = locais.filter((l) => l.iso3 && !isoNoMapa.has(l.iso3));

  // Maior pedido primeiro: a lista abre pelo que pesa na decisão.
  const lista = useMemo(
    () => [...projetos].sort((a, b) => b.solicitado - a.solicitado),
    [projetos],
  );

  const cor = (n: number) =>
    `color-mix(in srgb, var(--azul) ${Math.round(12 + 88 * Math.sqrt(n / maxProjetos))}%, #e3e9f8)`;

  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Projetos"
          valor={fmtInt.format(resumo.projetos)}
          atual={resumo.projetos}
          anterior={resumoAnterior?.projetos}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="Países alcançados"
          valor={fmtInt.format(resumo.paisesAlcancados)}
          atual={resumo.paisesAlcancados}
          anterior={resumoAnterior?.paisesAlcancados}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtInt.format(v)}
        />
        <Kpi
          rotulo="% Internacionais"
          valor={pct(resumo.fracaoInternacional)}
          atual={resumo.fracaoInternacional * 100}
          anterior={resumoAnterior && resumoAnterior.fracaoInternacional * 100}
          anoAnterior={anoAnterior}
          formatar={(v) =>
            `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
          }
        />
        <Kpi
          rotulo="Solicitado"
          valor={fmtMoedaCurta.format(resumo.solicitado)}
          atual={resumo.solicitado}
          anterior={resumoAnterior?.solicitado}
          anoAnterior={anoAnterior}
          formatar={(v) => fmtMoedaCurta.format(v)}
        />
      </div>

      <div className="fichas fichas-mapa">
        {sensiveis.length > 0 && (
          <span
            className="ficha"
            title="Projetos sem país declarado ou em mais de um país. Contam nos números acima; não pintam o mapa."
          >
            Multi-país / sensível:{" "}
            <b>{sensiveis.reduce((s, l) => s + l.projetos, 0)}</b>
          </span>
        )}
        {naoMapeados.length > 0 && (
          <span
            className="ficha"
            title="Nome de país que o painel ainda não sabe traduzir para o mapa — a equipe completa a lista em data/country_map.csv"
          >
            País não reconhecido:{" "}
            <b>{naoMapeados.map((l) => l.nomePt).join(", ")}</b>
          </span>
        )}
        {semGeometria.length > 0 && (
          <span
            className="ficha"
            title="País pequeno demais para aparecer nesta escala do mapa — os projetos dele estão no ranking ao lado"
          >
            Pequeno demais para o mapa:{" "}
            <b>{semGeometria.map((l) => l.nomePt).join(", ")}</b>
          </span>
        )}
      </div>

      <div className="corpo">
        <section className="painel-mapa cartao" ref={cartaoMapa}>
          <button
            className="expandir"
            title="Mapa em tela cheia (Esc sai)"
            onClick={() =>
              cheio
                ? document.exitFullscreen?.()
                : cartaoMapa.current?.requestFullscreen?.().catch(() => {})
            }
          >
            {cheio ? "⤡ Reduzir" : "⤢ Expandir"}
          </button>

          <div className="mapa" ref={areaMapa}>
            <svg
              viewBox={viewBox}
              role="img"
              aria-label={`Mapa-múndi da Remessa ${ano}: ${resumo.paisesAlcancados} países alcançados.`}
            >
              {geo.map((g, i) => {
                const local = g.iso3 ? porIso.get(g.iso3) : undefined;
                const apagado =
                  filtros.iso3 !== null && filtros.iso3 !== g.iso3;
                return (
                  <path
                    key={g.iso3 ?? `s${i}`}
                    d={g.d}
                    className={[
                      "pais",
                      local ? "pais-com-dados" : "pais-vazio",
                      filtros.iso3 === g.iso3 ? "pais-selecionado" : "",
                      local && apagado ? "pais-apagado" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={local ? { fill: cor(local.projetos) } : undefined}
                    onMouseMove={(e) => {
                      if (!local) return;
                      const r = areaMapa.current?.getBoundingClientRect();
                      if (r)
                        setDica({
                          x: e.clientX - r.left,
                          y: e.clientY - r.top,
                          local,
                        });
                    }}
                    onMouseLeave={() => setDica(null)}
                    onClick={() => local && alternarPais(g.iso3)}
                  >
                    <title>{g.nome}</title>
                  </path>
                );
              })}
            </svg>

            {dica && (
              <div className="dica" style={{ left: dica.x, top: dica.y }}>
                <b>{dica.local.nomePt}</b>
                <div className="dica-linha">
                  <span>Projetos</span>
                  <span>{fmtInt.format(dica.local.projetos)}</span>
                </div>
                <div className="dica-linha">
                  <span>Solicitado</span>
                  <span>{fmtMoeda.format(dica.local.solicitado)}</span>
                </div>
                <div className="dica-linha">
                  <span>Aprovado</span>
                  <span>{fmtMoeda.format(dica.local.aprovado)}</span>
                </div>
                <div className="dica-linha">
                  <span>Instituições</span>
                  <span>{fmtInt.format(dica.local.instituicoes)}</span>
                </div>
                {dica.local.categorias.length > 0 && (
                  <div className="dica-categorias">
                    {dica.local.categorias
                      .slice(0, 3)
                      .map(
                        (c) =>
                          `${rotuloCategoria(c.categoria)} (${c.projetos})`,
                      )
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="legenda">
            <div className="rampa">
              <span>Menos projetos</span>
              {[0.05, 0.25, 0.5, 0.75, 1].map((t) => (
                <i key={t} style={{ background: cor(t * maxProjetos) }} />
              ))}
              <span>{fmtInt.format(maxProjetos)}</span>
            </div>
            <span className="legenda-item">
              <i style={{ background: "var(--neutro)" }} /> Sem projetos
            </span>
            <span className="legenda-item">
              <i
                style={{
                  background:
                    "repeating-linear-gradient(45deg, var(--tinta-fraca) 0 3px, transparent 3px 6px)",
                  border: "1px solid var(--borda)",
                }}
              />
              Multi-país / área sensível (fora do mapa, dentro dos KPIs)
            </span>
          </div>
        </section>

        <section className="ranking cartao">
          <h2 className="titulo">Top países</h2>
          <p className="sub">
            {locais.length === 0
              ? SEM_RESULTADO
              : "Clique para filtrar o painel inteiro."}
          </p>
          {/* A lista é absoluta dentro desta caixa de propósito: assim ela não
              entra na altura intrínseca da grade e quem manda na altura das
              duas colunas é o mapa. Solta, ela esticava a linha inteira e o
              cartão do mapa ganhava um vão branco embaixo — na apresentação,
              com a fonte maior, sempre. */}
          <div className="ranking-lista">
            <ol>
              {locais.map((l) => (
                <li key={l.iso3 ?? l.nomePt}>
                  <button
                    className="linha-pais"
                    aria-pressed={
                      filtros.iso3 !== null && filtros.iso3 === l.iso3
                    }
                    disabled={!l.iso3}
                    onClick={() => alternarPais(l.iso3)}
                  >
                    <span className="linha-topo">
                      <b>{l.nomePt}</b>
                      <span>
                        {fmtInt.format(l.projetos)} ·{" "}
                        {fmtMoedaCurta.format(l.solicitado)}
                      </span>
                    </span>
                    <span
                      className={`barra${l.sensivel || !l.iso3 ? " barra-sensivel" : ""}`}
                    >
                      <i
                        style={{
                          width: `${Math.max(3, (l.projetos / maxProjetos) * 100)}%`,
                        }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      {/* Os projetos do recorte — inclusive o país clicado no mapa, que já vem
          aplicado em `projetos`. Fecha o caminho "vi o país, quero os projetos
          dele" sem sair da página. */}
      <Secao
        titulo={`${plural(lista.length, "projeto", "projetos")} no recorte`}
        sub="Clique no título para abrir a pasta do projeto."
        largura="cheia"
      >
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>País</th>
                <th>Instituição</th>
                <th>Categoria</th>
                <th>Status</th>
                <th className="n">Solicitado</th>
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
                  <td>{p.local.nomePt}</td>
                  <td>{p.instituicaoNome ?? "—"}</td>
                  <td>{rotuloCategoria(p.categoria)}</td>
                  <td>{ROTULO_STATUS[p.statusGrupo]}</td>
                  <td className="n">{fmtMoeda.format(p.solicitado)}</td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6} className="sub">
                    {SEM_RESULTADO}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Secao>
    </>
  );
}
