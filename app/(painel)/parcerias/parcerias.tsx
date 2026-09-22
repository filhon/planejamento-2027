"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { avaliavel } from "@/lib/agregar";
import type { ProjetoCiclo } from "@/lib/types";
import type { PaisGeo, UfGeo } from "@/lib/mapa";
import {
  ALTA_DEMANDA,
  montarBrasil,
  montarMundo,
  NOME_UF,
  ufDe,
  type Candidato,
  type Missionario,
  type Municipio,
  type Situacao,
} from "@/lib/parcerias";
import Link from "next/link";
import { marcarCandidato } from "../../actions";
import { usePainel } from "../contexto";
import { fmtInt, fmtMoeda, plural } from "../formato";
import { Kpi, Secao } from "../ui";

/**
 * Parcerias proativas (Fase 11) — a tela do diretor para escolher ONDE a Hebron
 * vai tomar a iniciativa, em vez de esperar o projeto chegar.
 *
 * Mundo: país pintado de laranja = agência tem missionário lá e NÃO chegou
 * pedido nesta remessa; verde = tinha projeto aprovado no ciclo anterior e
 * sumiu (retomar); azul = já atendido. Brasil: UF laranja = nenhum projeto;
 * ponto = cidade com missionário da JMN, verde quando está no top-100 de
 * demanda por produtos Hebron. Marcar candidato grava em
 * `data/parcerias_candidatos.csv` — a única escrita, fora da origem.
 */

type Modo = "mundo" | "brasil";
type MunicipioXY = Municipio & { x: number; y: number };

const soStatus = (ps: ProjetoCiclo[], status: string[]) =>
  status.length ? ps.filter((p) => status.includes(p.statusGrupo)) : ps;

const ROTULO_SITUACAO: Record<Situacao, string> = {
  oportunidade: "Sem pedido",
  retomar: "Retomar",
  atendido: "Atendido",
};
const COR_SITUACAO: Record<Situacao, string> = {
  oportunidade: "var(--laranja)",
  retomar: "var(--verde-escuro)",
  atendido: "var(--azul)",
};

export default function Parcerias({
  geoMundo,
  viewBoxMundo,
  geoBr,
  viewBoxBr,
  missionarios: missionariosTodos,
  municipios,
  candidatosIniciais,
}: {
  geoMundo: PaisGeo[];
  viewBoxMundo: string;
  geoBr: UfGeo[];
  viewBoxBr: string;
  missionarios: Missionario[];
  municipios: MunicipioXY[];
  candidatosIniciais: Candidato[];
}) {
  const { ano, anoAnterior, ciclos, filtros, aplicar } = usePainel();
  // A base de "já foi atingido" é a remessa INTEIRA, só com o filtro de Status:
  // qualquer outro eixo (categoria, instituição, país clicado…) encolheria os
  // pedidos e pintaria de "sem pedido" um país que tem projeto. Continente
  // recorta os missionários, não os pedidos.
  const projetos = useMemo(
    () =>
      soStatus(
        ciclos.find((c) => c.ano === ano)?.projetos ?? [],
        filtros.status,
      ),
    [ciclos, ano, filtros.status],
  );
  const projetosAnteriores = useMemo(
    () =>
      soStatus(
        ciclos.find((c) => c.ano === anoAnterior)?.projetos ?? [],
        filtros.status,
      ),
    [ciclos, anoAnterior, filtros.status],
  );
  const missionariosNoRecorte = useMemo(
    () =>
      filtros.continente.length
        ? missionariosTodos.filter(
            (m) =>
              m.agencia === "JMN-IPB" ||
              m.local.sensivel ||
              filtros.continente.includes(m.local.continente),
          )
        : missionariosTodos,
    [missionariosTodos, filtros.continente],
  );
  const missionarios = missionariosNoRecorte;
  const filtrosIgnorados = [
    filtros.categoria.length && "Categoria",
    filtros.instituicao.length && "Instituição",
    filtros.tipo.length && "Triagem",
    filtros.responsavel.length && "Responsável",
    filtros.analise.length && "Análise prévia",
    filtros.tag.length && "Tags",
    filtros.iso3 && "país clicado no mapa",
    filtros.uf && "UF",
  ].filter(Boolean) as string[];
  const [modo, setModo] = useState<Modo>("mundo");
  // `/parcerias#brasil` abre direto no Brasil (link para a pauta da reunião).
  useEffect(() => {
    if (window.location.hash === "#brasil") setModo("brasil");
  }, []);
  const [sel, setSel] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState(candidatosIniciais);
  useEffect(() => setCandidatos(candidatosIniciais), [candidatosIniciais]);
  const [salvando, iniciar] = useTransition();
  const [dica, setDica] = useState<{
    x: number;
    y: number;
    corpo: ReactNode;
  } | null>(null);
  const areaMapa = useRef<HTMLDivElement>(null);

  const mundo = useMemo(
    () => montarMundo(projetos, projetosAnteriores, missionarios, candidatos),
    [projetos, projetosAnteriores, missionarios, candidatos],
  );
  const brasil = useMemo(
    () => montarBrasil(projetos, missionarios, municipios, candidatos),
    [projetos, missionarios, municipios, candidatos],
  );
  // Países com pedido nesta remessa mas sem agência: pintam de "atendido" também.
  const comPedido = useMemo(
    () =>
      new Set(
        projetos.filter((p) => avaliavel(p.status)).map((p) => p.local.iso3),
      ),
    [projetos],
  );
  const marcados = useMemo(
    () => new Set(candidatos.map((c) => c.chave)),
    [candidatos],
  );
  const porChavePais = useMemo(
    () => new Map(mundo.paises.map((p) => [p.chave, p])),
    [mundo],
  );
  const porUf = useMemo(
    () => new Map(brasil.ufs.map((u) => [u.uf, u])),
    [brasil],
  );
  const maxMissionarios = Math.max(
    1,
    ...mundo.paises.map((p) => p.missionarios),
  );

  const alternar = (m: Missionario) =>
    iniciar(async () => {
      const rotulo = `${m.nome} — ${m.regiao ?? m.local.nomePt}${m.uf ? ` (${m.municipio ?? ""}/${m.uf})` : ""}`;
      const { marcado } = await marcarCandidato({ chave: m.chave, rotulo }, "");
      setCandidatos((atuais) =>
        marcado
          ? [...atuais, { chave: m.chave, rotulo, nota: "", marcadoEm: "" }]
          : atuais.filter((c) => c.chave !== m.chave),
      );
    });

  const mostrarDica = (e: React.MouseEvent, corpo: ReactNode) => {
    const r = areaMapa.current?.getBoundingClientRect();
    if (r) setDica({ x: e.clientX - r.left, y: e.clientY - r.top, corpo });
  };
  const trocarModo = (m: Modo) => {
    setModo(m);
    setSel(null);
    history.replaceState(null, "", m === "brasil" ? "#brasil" : "#");
  };

  // ------------------------------------------------------------- tabela
  const linhas = useMemo(() => {
    if (modo === "mundo") {
      const ordem = new Map(mundo.paises.map((p, i) => [p.chave, i]));
      return missionarios
        .filter((m) => m.agencia !== "JMN-IPB")
        .filter((m) => {
          const chave = m.local.iso3 ?? m.regiao ?? m.local.nomePt;
          if (sel) return chave === sel;
          return porChavePais.get(chave)?.situacao !== "atendido";
        })
        .sort(
          (a, b) =>
            (ordem.get(a.local.iso3 ?? a.regiao ?? "") ?? 999) -
              (ordem.get(b.local.iso3 ?? b.regiao ?? "") ?? 999) ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        );
    }
    const demanda = (m: Missionario) =>
      municipios.find((c) => c.codigo === m.codigoIbge)?.demanda ?? Infinity;
    return missionarios
      .filter((m) => m.agencia === "JMN-IPB")
      .filter((m) => (sel ? m.uf === sel : m.uf && !porUf.get(m.uf)?.coberta))
      .sort(
        (a, b) =>
          demanda(a) - demanda(b) || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [modo, sel, missionarios, municipios, mundo, porChavePais, porUf]);

  const selecionado =
    sel && (modo === "mundo" ? porChavePais.get(sel)?.nome : NOME_UF[sel]);
  // "Submetidos" = tudo que está na remessa com essa UF, em qualquer status —
  // é o que o filtro global `uf` vai mostrar em /projetos. O mapa conta só os
  // avaliáveis; os dois números divergem de propósito.
  const submetidosNaUf =
    modo === "brasil" && sel
      ? (ciclos.find((c) => c.ano === ano)?.projetos ?? []).filter(
          (p) => ufDe(p.estado) === sel,
        ).length
      : 0;

  return (
    <>
      <p className="intro-parcerias">
        Quem aparece aqui <b>não enviou projeto</b> nesta remessa: são
        missionários, pastores e evangelistas da{" "}
        <b>base das agências parceiras</b> (APMT, JMM, Pioneiros e JMN/IPB),
        cedida para a Hebron tomar a iniciativa e propor a parceria — em países
        e UFs onde nenhum pedido chegou.
        {filtrosIgnorados.length > 0 && (
          <span className="marca-alerta">
            {" "}
            Nesta tela só Status e Continente valem;{" "}
            {filtrosIgnorados.join(", ")} não
            {filtrosIgnorados.length > 1 ? " se aplicam" : " se aplica"} aqui.
          </span>
        )}
      </p>
      <div className="modo-parcerias">
        {(["mundo", "brasil"] as const).map((m) => (
          <button
            key={m}
            className="botao-modo"
            aria-pressed={modo === m}
            onClick={() => trocarModo(m)}
          >
            {m === "mundo" ? "Mundo" : "Brasil"}
          </button>
        ))}
        <span className="sub">
          {modo === "mundo"
            ? `Onde APMT, JMM e Pioneiros têm missionário e não chegou pedido na Remessa ${ano}.`
            : `UFs sem projeto na Remessa ${ano} e quem da JMN/IPB está lá — de preferência numa cidade que compra da Hebron.`}
        </span>
      </div>

      {modo === "mundo" ? (
        <div className="kpis">
          <Kpi
            rotulo="Países com missionário de agência"
            valor={fmtInt.format(mundo.comAgencia)}
            nota="APMT + JMM + Pioneiros, fora regiões sensíveis"
          />
          <Kpi
            rotulo={`Sem pedido em ${ano}`}
            valor={fmtInt.format(mundo.oportunidades)}
            nota="A oportunidade: agência lá, Hebron não"
            tom="atencao"
          />
          <Kpi
            rotulo="A retomar"
            valor={fmtInt.format(mundo.retomar)}
            nota={
              anoAnterior
                ? `Aprovado em ${anoAnterior}, nada em ${ano}`
                : "Sem ciclo anterior"
            }
            tom="atencao"
          />
          <Kpi
            rotulo="Missionários disponíveis"
            valor={fmtInt.format(mundo.missionariosDisponiveis)}
            nota="Nos países sem pedido ou a retomar"
          />
          <Kpi
            rotulo="Candidatos marcados"
            valor={fmtInt.format(mundo.candidatos)}
            nota="Gravados em data/parcerias_candidatos.csv"
            tom={mundo.candidatos ? "bom" : undefined}
          />
        </div>
      ) : (
        <div className="kpis">
          <Kpi
            rotulo="UFs com projeto"
            valor={`${brasil.cobertas} de 27`}
            nota={
              brasil.semUf
                ? `${brasil.semUf} projetos do Brasil sem UF`
                : "Projetos avaliáveis da remessa"
            }
          />
          <Kpi
            rotulo="UFs sem projeto"
            valor={fmtInt.format(brasil.descobertas)}
            nota={
              brasil.ufs
                .filter((u) => !u.coberta)
                .map((u) => u.uf)
                .join(", ") || "Meta batida: todas cobertas"
            }
            tom={brasil.descobertas ? "ruim" : "bom"}
          />
          <Kpi
            rotulo="… com missionário JMN"
            valor={fmtInt.format(brasil.descobertasComMissionario)}
            nota="UFs sem projeto onde há quem abraçar"
            tom="atencao"
          />
          <Kpi
            rotulo={`Cidades top ${ALTA_DEMANDA} com missionário`}
            valor={fmtInt.format(brasil.cidadesAltaDemanda)}
            nota="Retribuição: quem mais compra da Hebron"
          />
          <Kpi
            rotulo="Candidatos marcados"
            valor={fmtInt.format(brasil.candidatos)}
            nota="Gravados em data/parcerias_candidatos.csv"
            tom={brasil.candidatos ? "bom" : undefined}
          />
        </div>
      )}

      <div className="corpo">
        <section className="painel-mapa cartao">
          <div className="mapa" ref={areaMapa}>
            <Zoom
              viewBox={modo === "mundo" ? viewBoxMundo : viewBoxBr}
              chave={modo}
            >
              {modo === "mundo"
                ? geoMundo.map((g, i) => {
                    const pais = g.iso3 ? porChavePais.get(g.iso3) : undefined;
                    const situacao: Situacao | null = pais
                      ? pais.situacao
                      : comPedido.has(g.iso3)
                        ? "atendido"
                        : null;
                    const fill = !situacao
                      ? undefined
                      : situacao === "atendido"
                        ? "color-mix(in srgb, var(--azul) 45%, #e3e9f8)"
                        : `color-mix(in srgb, ${COR_SITUACAO[situacao]} ${Math.round(45 + 55 * Math.sqrt((pais?.missionarios ?? 1) / maxMissionarios))}%, #fff)`;
                    return (
                      <path
                        key={g.iso3 ?? `s${i}`}
                        d={g.d}
                        className={[
                          "pais",
                          pais ? "pais-com-dados" : "pais-vazio",
                          sel === g.iso3 ? "pais-selecionado" : "",
                          sel && pais && sel !== g.iso3 ? "pais-apagado" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={fill ? { fill } : undefined}
                        onMouseMove={(e) =>
                          pais &&
                          mostrarDica(
                            e,
                            <>
                              <b>{pais.nome}</b>
                              <div className="dica-linha">
                                <span>Situação</span>
                                <span>{ROTULO_SITUACAO[pais.situacao]}</span>
                              </div>
                              <div className="dica-linha">
                                <span>Missionários</span>
                                <span>
                                  {Object.entries(pais.porAgencia)
                                    .map(([a, n]) => `${a} ${n}`)
                                    .join(" · ")}
                                </span>
                              </div>
                              <div className="dica-linha">
                                <span>Projetos {ano}</span>
                                <span>{pais.projetos}</span>
                              </div>
                              {anoAnterior && (
                                <div className="dica-linha">
                                  <span>Aprovados {anoAnterior}</span>
                                  <span>{pais.aprovadosAnterior}</span>
                                </div>
                              )}
                              {pais.parceiros2026 > 0 && (
                                <div className="dica-linha">
                                  <span>Parceiros APMT 2026</span>
                                  <span>{pais.parceiros2026}</span>
                                </div>
                              )}
                            </>,
                          )
                        }
                        onMouseLeave={() => setDica(null)}
                        onClick={() =>
                          pais && setSel(sel === g.iso3 ? null : g.iso3)
                        }
                      >
                        <title>{g.nome}</title>
                      </path>
                    );
                  })
                : [
                    ...geoBr.map((g) => {
                      const uf = porUf.get(g.uf)!;
                      return (
                        <path
                          key={g.uf}
                          d={g.d}
                          className={[
                            "pais",
                            "pais-com-dados",
                            sel === g.uf ? "pais-selecionado" : "",
                            sel && sel !== g.uf ? "pais-apagado" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            fill: uf.coberta
                              ? "color-mix(in srgb, var(--azul) 45%, #e3e9f8)"
                              : "color-mix(in srgb, var(--laranja) 75%, #fff)",
                          }}
                          onMouseMove={(e) =>
                            mostrarDica(
                              e,
                              <>
                                <b>{uf.nome}</b>
                                <div className="dica-linha">
                                  <span>Projetos {ano}</span>
                                  <span>{uf.projetos}</span>
                                </div>
                                <div className="dica-linha">
                                  <span>Missionários JMN</span>
                                  <span>{uf.missionarios}</span>
                                </div>
                                <div className="dica-linha">
                                  <span>Em cidade top {ALTA_DEMANDA}</span>
                                  <span>{uf.emAltaDemanda}</span>
                                </div>
                                {uf.melhor && (
                                  <div className="dica-categorias">
                                    Melhor cidade: {uf.melhor.municipio.nome}
                                    {uf.melhor.municipio.demanda
                                      ? ` (${uf.melhor.municipio.demanda}º em demanda)`
                                      : ""}
                                  </div>
                                )}
                              </>,
                            )
                          }
                          onMouseLeave={() => setDica(null)}
                          onClick={() => setSel(sel === g.uf ? null : g.uf)}
                        >
                          <title>{uf.nome}</title>
                        </path>
                      );
                    }),
                    ...brasil.pontos.map((p) => {
                      const c = p.municipio as MunicipioXY;
                      const top =
                        c.demanda !== null && c.demanda <= ALTA_DEMANDA;
                      return (
                        <circle
                          key={c.codigo}
                          className={`ponto${top ? " ponto-top" : ""}${sel && sel !== c.uf ? " pais-apagado" : ""}`}
                          cx={c.x}
                          cy={c.y}
                          r={3 + 2 * Math.sqrt(p.missionarios.length)}
                          onMouseMove={(e) =>
                            mostrarDica(
                              e,
                              <>
                                <b>
                                  {c.nome}/{c.uf}
                                </b>
                                <div className="dica-linha">
                                  <span>Demanda Hebron</span>
                                  <span>
                                    {c.demanda
                                      ? `${c.demanda}º`
                                      : "fora do ranking"}
                                  </span>
                                </div>
                                <div className="dica-categorias">
                                  {p.missionarios
                                    .map((m) => m.nome)
                                    .join(" · ")}
                                </div>
                              </>,
                            )
                          }
                          onMouseLeave={() => setDica(null)}
                          onClick={() => setSel(sel === c.uf ? null : c.uf)}
                        />
                      );
                    }),
                  ]}
            </Zoom>
            {dica && (
              <div className="dica" style={{ left: dica.x, top: dica.y }}>
                {dica.corpo}
              </div>
            )}
          </div>

          <div className="legenda">
            {modo === "mundo" ? (
              <>
                <span className="aviso">
                  <i style={{ background: "var(--laranja)" }} /> Agência lá, sem
                  pedido em {ano}
                </span>
                <span className="aviso">
                  <i style={{ background: "var(--verde-escuro)" }} /> Retomar
                  (aprovado em {anoAnterior}, nada em {ano})
                </span>
                <span className="aviso">
                  <i style={{ background: "var(--azul)" }} /> Atendido
                </span>
                <span className="aviso">
                  <i style={{ background: "var(--neutro)" }} /> Sem agência nem
                  pedido
                </span>
              </>
            ) : (
              <>
                <span className="aviso">
                  <i style={{ background: "var(--laranja)" }} /> UF sem projeto
                </span>
                <span className="aviso">
                  <i style={{ background: "var(--azul)" }} /> UF com projeto
                </span>
                <span className="aviso">
                  <i className="ponto-legenda" /> Cidade com missionário JMN
                </span>
                <span className="aviso">
                  <i className="ponto-legenda ponto-top" /> No top{" "}
                  {ALTA_DEMANDA} de demanda
                </span>
              </>
            )}
            <span>Roda do mouse aproxima · arraste para mover</span>
          </div>
        </section>

        <section className="ranking cartao">
          <h2 className="titulo">
            {modo === "mundo" ? "Onde ir" : "UFs a cobrir"}
          </h2>
          <p className="sub">Clique para isolar no mapa e na tabela.</p>
          <div className="ranking-lista">
            <ol>
              {modo === "mundo"
                ? mundo.paises
                    .filter((p) => p.situacao !== "atendido")
                    .map((p) => (
                      <li key={p.chave}>
                        <button
                          className="linha-pais"
                          aria-pressed={sel === p.chave}
                          onClick={() =>
                            setSel(sel === p.chave ? null : p.chave)
                          }
                        >
                          <span className="linha-topo">
                            <b>
                              {p.nome}
                              {p.candidatos > 0 && (
                                <span className="pastilha pastilha-candidato">
                                  ★ {p.candidatos}
                                </span>
                              )}
                            </b>
                            <span>
                              {plural(
                                p.missionarios,
                                "missionário",
                                "missionários",
                              )}{" "}
                              · {Object.keys(p.porAgencia).join("+")}
                            </span>
                          </span>
                          <span
                            className={`barra${p.sensivel ? " barra-sensivel" : ""}`}
                          >
                            <i
                              style={{
                                width: `${Math.max(3, (p.missionarios / maxMissionarios) * 100)}%`,
                                background: COR_SITUACAO[p.situacao],
                              }}
                            />
                          </span>
                        </button>
                      </li>
                    ))
                : brasil.ufs.map((u) => (
                    <li
                      key={u.uf}
                      className={u.coberta ? "uf-coberta" : undefined}
                    >
                      <button
                        className="linha-pais"
                        aria-pressed={sel === u.uf}
                        onClick={() => setSel(sel === u.uf ? null : u.uf)}
                      >
                        <span className="linha-topo">
                          <b>
                            {u.nome}
                            {u.candidatos > 0 && (
                              <span className="pastilha pastilha-candidato">
                                ★ {u.candidatos}
                              </span>
                            )}
                          </b>
                          <span>
                            {u.coberta
                              ? `${plural(u.projetos, "projeto", "projetos")}`
                              : "sem projeto"}{" "}
                            · {u.missionarios} JMN
                          </span>
                        </span>
                        <span className="sub linha-melhor">
                          {u.melhor
                            ? `${u.melhor.municipio.nome}${u.melhor.municipio.demanda ? ` (${u.melhor.municipio.demanda}º em demanda)` : ""} · ${u.melhor.missionario.nome}`
                            : u.missionarios
                              ? "município não casado"
                              : "nenhum missionário JMN"}
                        </span>
                      </button>
                    </li>
                  ))}
            </ol>
          </div>
        </section>
      </div>

      <Secao
        titulo={
          selecionado
            ? `${plural(linhas.length, "missionário", "missionários")} em ${selecionado}`
            : modo === "mundo"
              ? `${plural(linhas.length, "missionário", "missionários")} em países sem pedido ou a retomar`
              : `${plural(linhas.length, "missionário", "missionários")} nas UFs sem projeto`
        }
        sub="★ marca o candidato a parceria proativa; clique de novo para desmarcar. A nota pode ser escrita no CSV."
        largura="cheia"
        acoes={
          sel ? (
            <>
              {modo === "brasil" && submetidosNaUf > 0 && (
                <Link
                  className="expandir expandir-inline"
                  href="/projetos"
                  onClick={() => aplicar({ uf: sel, iso3: null })}
                >
                  Ver{" "}
                  {plural(
                    submetidosNaUf,
                    "projeto submetido",
                    "projetos submetidos",
                  )}{" "}
                  em Projetos & Pastas →
                </Link>
              )}
              <button
                className="expandir expandir-inline"
                onClick={() => setSel(null)}
              >
                Limpar seleção
              </button>
            </>
          ) : undefined
        }
      >
        <div className="rolagem">
          <table className="tabela">
            <thead>
              {modo === "mundo" ? (
                <tr>
                  <th></th>
                  <th>Missionário</th>
                  <th>Agência</th>
                  <th>País / região</th>
                  <th>Situação</th>
                  <th className="n">Recebeu em 2026 (APMT)</th>
                </tr>
              ) : (
                <tr>
                  <th></th>
                  <th>Missionário</th>
                  <th>Tipo</th>
                  <th>Município</th>
                  <th>UF</th>
                  <th className="n">Demanda Hebron</th>
                  <th className="n">Projetos {ano} na UF</th>
                </tr>
              )}
            </thead>
            <tbody>
              {linhas.map((m) => {
                const marcado = marcados.has(m.chave);
                const estrela = (
                  <td>
                    <button
                      className={`estrela${marcado ? " estrela-on" : ""}`}
                      aria-pressed={marcado}
                      disabled={salvando}
                      title={
                        marcado
                          ? "Desmarcar candidato"
                          : "Marcar como candidato"
                      }
                      onClick={() => alternar(m)}
                    >
                      {marcado ? "★" : "☆"}
                    </button>
                  </td>
                );
                if (modo === "mundo") {
                  const pais = porChavePais.get(
                    m.local.iso3 ?? m.regiao ?? m.local.nomePt,
                  );
                  return (
                    <tr
                      key={m.chave}
                      className={marcado ? "linha-candidata" : undefined}
                    >
                      {estrela}
                      <td>
                        {m.nome}
                        {m.publico && (
                          <span className="sub"> · {m.publico}</span>
                        )}
                      </td>
                      <td>{m.agencia}</td>
                      <td>{m.regiao ?? m.local.nomePt}</td>
                      <td>
                        {pais && (
                          <span
                            className="pastilha"
                            style={
                              {
                                "--cor": COR_SITUACAO[pais.situacao],
                              } as React.CSSProperties
                            }
                          >
                            {ROTULO_SITUACAO[pais.situacao]}
                          </span>
                        )}
                      </td>
                      <td className="n">
                        {m.recebido2026 ? fmtMoeda.format(m.recebido2026) : "—"}
                      </td>
                    </tr>
                  );
                }
                const c = municipios.find((x) => x.codigo === m.codigoIbge);
                return (
                  <tr
                    key={m.chave}
                    className={marcado ? "linha-candidata" : undefined}
                  >
                    {estrela}
                    <td>{m.nome}</td>
                    <td>{m.tipo ?? "—"}</td>
                    <td>
                      {m.municipio ?? "—"}
                      {m.municipio && !c && (
                        <span className="sub"> (não casado)</span>
                      )}
                    </td>
                    <td>{m.uf ?? "—"}</td>
                    <td className="n">
                      {c?.demanda ? (
                        <>
                          {c.demanda}º
                          {c.demanda <= ALTA_DEMANDA && (
                            <span
                              className="pastilha"
                              style={
                                {
                                  "--cor": "var(--verde-escuro)",
                                  marginLeft: 6,
                                } as React.CSSProperties
                              }
                            >
                              top {ALTA_DEMANDA}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="n">
                      {m.uf ? (porUf.get(m.uf)?.projetos ?? 0) : "—"}
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="sub">
                    Nenhum missionário neste recorte.
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

/**
 * Zoom e pan no SVG mexendo só no `viewBox` — sem d3-zoom. Roda aproxima em
 * volta do cursor; arrastar move. `chave` zera ao trocar de mapa.
 */
function Zoom({
  viewBox,
  chave,
  children,
}: {
  viewBox: string;
  chave: string;
  children: ReactNode;
}) {
  const base = useMemo(
    () => viewBox.split(" ").map(Number) as [number, number, number, number],
    [viewBox],
  );
  const [vb, setVb] = useState(base);
  useEffect(() => setVb(base), [base, chave]);
  const svg = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ x: number; y: number; vb: typeof base } | null>(
    null,
  );
  // Arrastou de verdade? Então o clique que o navegador dispara no fim não é seleção.
  const moveu = useRef(false);

  // `wheel` precisa ser não-passivo para segurar a rolagem da página.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setVb(([x, y, w, h]) => {
        const fator = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        const nw = Math.min(base[2] * 1.5, Math.max(base[2] / 16, w * fator));
        const nh = (nw / w) * h;
        const px = x + ((e.clientX - r.left) / r.width) * w;
        const py = y + ((e.clientY - r.top) / r.height) * h;
        return [px - (px - x) * (nw / w), py - (py - y) * (nh / h), nw, nh];
      });
    };
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  }, [base]);

  return (
    <svg
      ref={svg}
      viewBox={vb.join(" ")}
      role="img"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        arrasto.current = { x: e.clientX, y: e.clientY, vb };
        moveu.current = false;
      }}
      onPointerMove={(e) => {
        const a = arrasto.current;
        if (!a) return;
        if (
          !moveu.current &&
          Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 4
        ) {
          moveu.current = true;
          // Capturar só quando o arrasto começa: com captura desde o
          // pointerdown, o `click` é entregue ao <svg>, e o estado/país
          // embaixo nunca o recebe.
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (!moveu.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const dx = ((e.clientX - a.x) / r.width) * a.vb[2];
        const dy = ((e.clientY - a.y) / r.height) * a.vb[3];
        setVb([a.vb[0] - dx, a.vb[1] - dy, a.vb[2], a.vb[3]]);
      }}
      onClickCapture={(e) => moveu.current && e.stopPropagation()}
      onPointerUp={() => (arrasto.current = null)}
      onPointerCancel={() => (arrasto.current = null)}
      onDoubleClick={() => setVb(base)}
    >
      {children}
    </svg>
  );
}
