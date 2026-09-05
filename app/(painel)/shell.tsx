"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { StatusGrupo } from "@/lib/types";
import { atualizarDados } from "../actions";
import {
  filtrar,
  ProvedorPainel,
  SEM_FILTRO,
  temFiltro,
  TODOS,
  type CicloCarregado,
  type Filtros,
} from "./contexto";
import { ROTULO_STATUS } from "./formato";

/**
 * Moldura de todas as páginas: marca, navegação, toggle de ano e a barra de
 * filtros globais. Como isto mora no layout, o estado NÃO se perde ao navegar —
 * é o que permite "clicar no país no mapa e ver o efeito no orçamento".
 */

const PAGINAS = [
  { href: "/", rotulo: "Visão Geral" },
  { href: "/mapa", rotulo: "Mapa-múndi" },
  { href: "/pipeline", rotulo: "Pipeline & Avaliação" },
  { href: "/orcamento", rotulo: "Orçamento" },
];

function ordenados(valores: Iterable<string>): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export default function Shell({
  ciclos,
  children,
}: {
  ciclos: CicloCarregado[];
  children: React.ReactNode;
}) {
  const [ano, setAno] = useState(ciclos[0]?.ano ?? 0);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const [atualizando, iniciarAtualizacao] = useTransition();
  const caminho = usePathname();

  const posicao = ciclos.findIndex((c) => c.ano === ano);
  const atual = ciclos[posicao];
  const anterior = ciclos[posicao + 1]; // do mais recente ao mais antigo

  const todos = useMemo(() => atual?.projetos ?? [], [atual]);
  const projetos = useMemo(() => filtrar(todos, filtros), [todos, filtros]);
  const projetosAnteriores = useMemo(
    () => (anterior ? filtrar(anterior.projetos, filtros) : []),
    [anterior, filtros],
  );

  // As opções saem do ciclo inteiro; se saíssem do resultado filtrado, o próprio
  // filtro sumiria da lista depois de aplicado.
  const opcoes = useMemo(
    () => ({
      continentes: ordenados(todos.map((p) => p.local.continente)),
      status: ordenados(todos.map((p) => p.statusGrupo)) as StatusGrupo[],
      categorias: ordenados(todos.map((p) => p.categoria)),
    }),
    [todos],
  );

  const aplicar = (parcial: Partial<Filtros>) =>
    setFiltros((f) => ({ ...f, ...parcial }));
  const alternarPais = (iso3: string | null) =>
    setFiltros((f) => ({ ...f, iso3: f.iso3 === iso3 ? null : iso3 }));

  const nomePais = filtros.iso3
    ? (todos.find((p) => p.local.iso3 === filtros.iso3)?.local.nomePt ??
      filtros.iso3)
    : null;
  const filtroAtivo = temFiltro(filtros);

  return (
    <ProvedorPainel
      value={{
        ciclos,
        ano,
        trocarAno: setAno,
        anoAnterior: anterior?.ano,
        filtros,
        aplicar,
        alternarPais,
        limpar: () => setFiltros(SEM_FILTRO),
        filtroAtivo,
        projetos,
        projetosAnteriores,
        todos,
        opcoes,
      }}
    >
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

        <nav className="abas" aria-label="Páginas do painel">
          {PAGINAS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={caminho === p.href ? "page" : undefined}
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>

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
              value={filtros.continente}
              onChange={(e) => aplicar({ continente: e.target.value })}
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
              value={filtros.status}
              onChange={(e) => aplicar({ status: e.target.value })}
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
              value={filtros.categoria}
              onChange={(e) => aplicar({ categoria: e.target.value })}
            >
              <option value={TODOS}>Todas</option>
              {opcoes.categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="fv">Instituição</label>
            <select
              id="fv"
              value={filtros.conveniada}
              onChange={(e) => aplicar({ conveniada: e.target.value })}
            >
              <option value={TODOS}>Todas</option>
              <option value="true">Conveniadas</option>
              <option value="false">Não conveniadas</option>
            </select>
          </div>

          {filtroAtivo && (
            <button className="limpar" onClick={() => setFiltros(SEM_FILTRO)}>
              Limpar filtros
            </button>
          )}

          <div className="fichas">
            {nomePais && (
              <button className="ficha" onClick={() => alternarPais(null)}>
                <b>{nomePais}</b> ✕
              </button>
            )}
            <span className="ficha ficha-clara">
              {projetos.length} de {todos.length} projetos
            </span>
          </div>
        </div>

        {children}
      </main>
    </ProvedorPainel>
  );
}
