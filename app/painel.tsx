"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { agregarPorPais, montarResumo } from "@/lib/agregar";
import type { PaisGeo } from "@/lib/mapa";
import type { ProjetoCiclo, ProjetoLocal, StatusGrupo } from "@/lib/types";
import { atualizarDados } from "./actions";

/**
 * Página do Mapa-múndi — o coração do painel (docs/plano-dashboard.md §5).
 *
 * Recebe os projetos de todos os ciclos já normalizados pelo servidor e faz os
 * filtros cruzados no navegador: mapa, KPIs e ranking reagregam juntos, sem ida
 * ao banco. As agregações são as MESMAS de `src/lib/agregar.ts` usadas no
 * servidor — nada de segunda implementação das regras.
 */

export interface CicloCarregado {
  ano: number;
  projetos: ProjetoCiclo[];
}

const TODOS = "__todos";

const ROTULO_STATUS: Record<StatusGrupo, string> = {
  aprovado: "Aprovado",
  "em-avaliacao": "Em avaliação",
  classificado: "Classificado",
  rejeitado: "Rejeitado",
  encerrado: "Encerrado",
  neutro: "Rascunho / outros",
};

const fmtInt = new Intl.NumberFormat("pt-BR");
const fmtMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const fmtMoedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

interface Filtros {
  continente: string;
  status: string;
  categoria: string;
  iso3: string | null;
}

const SEM_FILTRO: Filtros = {
  continente: TODOS,
  status: TODOS,
  categoria: TODOS,
  iso3: null,
};

function filtrar(projetos: ProjetoCiclo[], f: Filtros): ProjetoCiclo[] {
  return projetos.filter(
    (p) =>
      (f.continente === TODOS || p.local.continente === f.continente) &&
      (f.status === TODOS || p.statusGrupo === f.status) &&
      (f.categoria === TODOS || p.categoria === f.categoria) &&
      (f.iso3 === null || p.local.iso3 === f.iso3),
  );
}

function ordenados(valores: Iterable<string>): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export default function Painel({
  ciclos,
  geo,
  viewBox,
}: {
  ciclos: CicloCarregado[];
  geo: PaisGeo[];
  viewBox: string;
}) {
  const [ano, setAno] = useState(ciclos[0]?.ano ?? 0);
  const [f, setF] = useState<Filtros>(SEM_FILTRO);
  const [dica, setDica] = useState<{
    x: number;
    y: number;
    local: ProjetoLocal;
  } | null>(null);
  const [atualizando, iniciarAtualizacao] = useTransition();
  const areaMapa = useRef<HTMLDivElement>(null);

  const posicao = ciclos.findIndex((c) => c.ano === ano);
  const atual = ciclos[posicao];
  const anterior = ciclos[posicao + 1]; // ciclos vêm do mais recente ao mais antigo

  const projetos = useMemo(() => filtrar(atual?.projetos ?? [], f), [atual, f]);
  const locais = useMemo(() => agregarPorPais(projetos), [projetos]);
  const resumo = useMemo(() => montarResumo(projetos, ano), [projetos, ano]);
  const resumoAnterior = useMemo(
    () =>
      anterior
        ? montarResumo(filtrar(anterior.projetos, f), anterior.ano)
        : null,
    [anterior, f],
  );

  // Opções dos filtros saem do ciclo inteiro (não do resultado filtrado), senão
  // o próprio filtro some da lista depois de aplicado.
  const opcoes = useMemo(() => {
    const todos = atual?.projetos ?? [];
    return {
      continentes: ordenados(todos.map((p) => p.local.continente)),
      status: ordenados(todos.map((p) => p.statusGrupo)) as StatusGrupo[],
      categorias: ordenados(todos.map((p) => p.categoria)),
    };
  }, [atual]);

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

  const paisSelecionado = f.iso3 ? porIso.get(f.iso3) : undefined;
  const filtroAtivo =
    f.continente !== TODOS ||
    f.status !== TODOS ||
    f.categoria !== TODOS ||
    f.iso3 !== null;

  const cor = (n: number) =>
    `color-mix(in srgb, var(--azul) ${Math.round(12 + 88 * Math.sqrt(n / maxProjetos))}%, #e3e9f8)`;

  const alternarPais = (iso3: string | null) =>
    setF((atualF) => ({ ...atualF, iso3: atualF.iso3 === iso3 ? null : iso3 }));

  return (
    <>
      <header className="cabecalho">
        <div className="marca">
          <span className="marca-circulos" aria-hidden>
            <span style={{ background: "var(--azul-claro)" }} />
            <span style={{ background: "var(--verde)" }} />
            <span style={{ background: "var(--laranja)" }} />
          </span>
          <div>
            <h1>Painel Consultivo · Hebron ASEEC</h1>
            <p>Instrumentos de Deus na transformação de vidas.</p>
          </div>
        </div>

        <div className="cabecalho-acoes">
          <div className="anos" role="group" aria-label="Remessa">
            {ciclos.map((c) => (
              <button
                key={c.ano}
                aria-pressed={c.ano === ano}
                onClick={() => setAno(c.ano)}
              >
                Remessa {c.ano}
              </button>
            ))}
          </div>
          <button
            className="botao-atualizar"
            disabled={atualizando}
            onClick={() => iniciarAtualizacao(() => atualizarDados())}
          >
            {atualizando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      <main>
        <div className="filtros cartao">
          <div className="campo">
            <label htmlFor="fc">Continente</label>
            <select
              id="fc"
              value={f.continente}
              onChange={(e) => setF({ ...f, continente: e.target.value })}
            >
              <option value={TODOS}>Todos</option>
              {opcoes.continentes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="fs">Status</label>
            <select
              id="fs"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value={TODOS}>Todos</option>
              {opcoes.status.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="fk">Categoria</label>
            <select
              id="fk"
              value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value })}
            >
              <option value={TODOS}>Todas</option>
              {opcoes.categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          {filtroAtivo && (
            <button className="limpar" onClick={() => setF(SEM_FILTRO)}>
              Limpar filtros
            </button>
          )}

          <div className="fichas">
            {paisSelecionado && (
              <button className="ficha" onClick={() => alternarPais(null)}>
                <b>{paisSelecionado.nomePt}</b> ✕
              </button>
            )}
            {sensiveis.length > 0 && (
              <span
                className="ficha"
                title="Contam nos KPIs; não pintam o mapa"
              >
                Multi-país / sensível:{" "}
                <b>{sensiveis.reduce((s, l) => s + l.projetos, 0)}</b>
              </span>
            )}
            {naoMapeados.length > 0 && (
              <span
                className="ficha"
                title="País fora de data/country_map.csv — completar o de-para"
              >
                Sem de-para:{" "}
                <b>{naoMapeados.map((l) => l.nomePt).join(", ")}</b>
              </span>
            )}
            {semGeometria.length > 0 && (
              <span
                className="ficha"
                title="País pequeno demais para a geometria 110m — ver o ranking ao lado"
              >
                Fora do mapa:{" "}
                <b>{semGeometria.map((l) => l.nomePt).join(", ")}</b>
              </span>
            )}
          </div>
        </div>

        <div className="kpis">
          <Kpi
            rotulo="Projetos"
            valor={fmtInt.format(resumo.projetos)}
            atual={resumo.projetos}
            anterior={resumoAnterior?.projetos}
            anoAnterior={anterior?.ano}
            formatar={(v) => fmtInt.format(v)}
          />
          <Kpi
            rotulo="Países alcançados"
            valor={fmtInt.format(resumo.paisesAlcancados)}
            atual={resumo.paisesAlcancados}
            anterior={resumoAnterior?.paisesAlcancados}
            anoAnterior={anterior?.ano}
            formatar={(v) => fmtInt.format(v)}
          />
          <Kpi
            rotulo="% Internacionais"
            valor={pct(resumo.fracaoInternacional)}
            atual={resumo.fracaoInternacional * 100}
            anterior={
              resumoAnterior && resumoAnterior.fracaoInternacional * 100
            }
            anoAnterior={anterior?.ano}
            formatar={(v) =>
              `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
            }
          />
          <Kpi
            rotulo="Solicitado"
            valor={fmtMoedaCurta.format(resumo.solicitado)}
            atual={resumo.solicitado}
            anterior={resumoAnterior?.solicitado}
            anoAnterior={anterior?.ano}
            formatar={(v) => fmtMoedaCurta.format(v)}
          />
        </div>

        <div className="corpo">
          <section className="painel-mapa cartao">
            <div className="mapa" ref={areaMapa}>
              <svg
                viewBox={viewBox}
                role="img"
                aria-label={`Mapa-múndi da Remessa ${ano}: ${resumo.paisesAlcancados} países alcançados.`}
              >
                {geo.map((g, i) => {
                  const local = g.iso3 ? porIso.get(g.iso3) : undefined;
                  const apagado = f.iso3 !== null && f.iso3 !== g.iso3;
                  return (
                    <path
                      key={g.iso3 ?? `s${i}`}
                      d={g.d}
                      className={[
                        "pais",
                        local ? "pais-com-dados" : "pais-vazio",
                        f.iso3 === g.iso3 ? "pais-selecionado" : "",
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
                        .map((c) => `${c.categoria} (${c.projetos})`)
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
              <span className="aviso">
                <i style={{ background: "var(--neutro)" }} /> Sem projetos
              </span>
              <span className="aviso">
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
                ? "Nenhum projeto com os filtros atuais."
                : "Clique para filtrar o painel inteiro."}
            </p>
            <ol>
              {locais.map((l) => (
                <li key={l.iso3 ?? l.nomePt}>
                  <button
                    className="linha-pais"
                    aria-pressed={f.iso3 !== null && f.iso3 === l.iso3}
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
          </section>
        </div>
      </main>
    </>
  );
}

function Kpi({
  rotulo,
  valor,
  atual,
  anterior,
  anoAnterior,
  formatar,
}: {
  rotulo: string;
  valor: string;
  atual: number;
  anterior: number | null | undefined;
  anoAnterior: number | undefined;
  formatar: (v: number) => string;
}) {
  const delta =
    anterior === null || anterior === undefined ? null : atual - anterior;

  return (
    <div className="kpi cartao">
      <div className="kpi-rotulo">{rotulo}</div>
      <div className="kpi-valor">{valor}</div>
      <div className="kpi-delta">
        {delta === null ? (
          "sem ciclo anterior"
        ) : (
          <>
            <span
              className={delta > 0 ? "subiu" : delta < 0 ? "desceu" : undefined}
            >
              {delta > 0 ? "▲ +" : delta < 0 ? "▼ −" : "= "}
              {formatar(Math.abs(delta))}
            </span>{" "}
            vs {anoAnterior}
          </>
        )}
      </div>
    </div>
  );
}
