"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  { href: "/instituicoes", rotulo: "Instituições" },
  { href: "/prestacao", rotulo: "Prestação de contas" },
];

function ordenados(valores: Iterable<string>): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Enquanto o foco está num campo, as setas são do campo, não da apresentação. */
function digitando(alvo: EventTarget | null): boolean {
  const tag = (alvo as HTMLElement | null)?.tagName;
  return tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA";
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
  const [apresentacao, setApresentacao] = useState(false);
  const caminho = usePathname();
  const router = useRouter();

  /**
   * Modo apresentação/TV: fontes maiores (a classe no <body>, ver globals.css),
   * um painel por vez e navegação por teclado — ←/→ trocam de página, Esc sai.
   * Sem biblioteca de slides: as páginas já SÃO os slides.
   */
  useEffect(() => {
    if (!apresentacao) return;
    document.body.classList.add("apresentacao");

    const ir = (passo: number) => {
      const i = PAGINAS.findIndex((p) => p.href === caminho);
      const proximo = (i + passo + PAGINAS.length) % PAGINAS.length;
      router.push(PAGINAS[proximo]!.href);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (digitando(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") ir(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") ir(-1);
      else if (e.key === "Escape") setApresentacao(false);
    };

    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.classList.remove("apresentacao");
    };
  }, [apresentacao, caminho, router]);

  const alternarApresentacao = () => {
    const ligando = !apresentacao;
    setApresentacao(ligando);
    // Tela cheia precisa do gesto do usuário — daí sair daqui, e não do efeito.
    if (ligando) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.();
  };

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
          {/* Símbolo da marca: versão branca (fundo azul); na impressão o CSS
              troca pela colorida, porque lá o cabeçalho vai em branco. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="marca-simbolo"
            src="/simbolo-branco.png"
            alt=""
            width={26}
            height={38}
          />
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
            className="botao-claro"
            aria-pressed={apresentacao}
            title="Fontes maiores, tela cheia e navegação por ←/→ (Esc sai)"
            onClick={alternarApresentacao}
          >
            {apresentacao ? "Sair da apresentação" : "Apresentar"}
          </button>
          <button
            className="botao-claro"
            title="Abre a impressão do navegador — escolha 'Salvar como PDF'"
            onClick={() => window.print()}
          >
            Exportar PDF
          </button>
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
        {/* Só no PDF: registra o recorte que gerou os números, para a ata.
            Data e URL o próprio navegador carimba no cabeçalho da impressão. */}
        <div className="so-impressao">
          <b>
            {PAGINAS.find((p) => p.href === caminho)?.rotulo ?? "Painel"} ·
            Remessa {ano}
          </b>
          <span>
            {[
              filtros.continente !== TODOS &&
                `Continente: ${filtros.continente}`,
              filtros.status !== TODOS &&
                `Status: ${ROTULO_STATUS[filtros.status as StatusGrupo]}`,
              filtros.categoria !== TODOS && `Categoria: ${filtros.categoria}`,
              filtros.conveniada !== TODOS &&
                `Instituição: ${filtros.conveniada === "true" ? "conveniadas" : "não conveniadas"}`,
              nomePais && `País: ${nomePais}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Sem filtros — ciclo inteiro"}
          </span>
          <span>
            {projetos.length} de {todos.length} projetos
          </span>
        </div>

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
