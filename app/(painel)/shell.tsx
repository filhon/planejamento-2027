"use client";

import Link from "next/link";
import { NOME_UF } from "@/lib/uf";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { StatusGrupo } from "@/lib/types";
import { atualizarDados } from "../actions";
import {
  alternar,
  casaBusca,
  filtrar,
  ProvedorPainel,
  SEM_FILTRO,
  SEM_RESPONSAVEL,
  temFiltro,
  type CicloCarregado,
  type Filtros,
} from "./contexto";
import { ROTULO_STATUS, resumoFiltros, rotuloCategoria } from "./formato";

/**
 * Moldura de todas as páginas: marca, navegação, toggle de ano e a barra de
 * filtros globais. Como isto mora no layout, o estado NÃO se perde ao navegar —
 * é o que permite "clicar no país no mapa e ver o efeito no orçamento".
 */

/**
 * A ordem aqui é a ordem dos "slides" no modo apresentação. `menu` tira a página
 * da fileira de abas e a joga no dropdown de mesmo nome — é assim que o topo
 * ganha espaço quando entram páginas novas: uma linha, sem mexer no layout.
 */
const PAGINAS: {
  href: string;
  rotulo: string;
  menu?: string;
  /** Nome por extenso para o papel, quando a aba precisa ser curta. */
  titulo?: string;
}[] = [
  { href: "/", rotulo: "Resumo", titulo: "Resumo Executivo" },
  { href: "/visao-geral", rotulo: "Visão Geral" },
  { href: "/mapa", rotulo: "Mapa-múndi" },
  { href: "/projetos", rotulo: "Projetos & Pastas" },
  { href: "/parcerias", rotulo: "Parcerias" },
  // Pipeline desceu para o menu quando o Resumo entrou na fileira: a linha do
  // topo é o mesmo teto dos filtros (entra um, sai um), e nesta remessa é a
  // página com menos a dizer — 2026 não tem uma única avaliação registrada.
  { href: "/pipeline", rotulo: "Pipeline & Avaliação", menu: "Mais" },
  { href: "/orcamento", rotulo: "Orçamento", menu: "Mais" },
  { href: "/instituicoes", rotulo: "Instituições", menu: "Mais" },
  { href: "/prestacao", rotulo: "Prestação de contas", menu: "Mais" },
];

const ABAS = PAGINAS.filter((p) => !p.menu);
const GRUPOS = [...new Set(PAGINAS.map((p) => p.menu))].filter(
  (m): m is string => !!m,
);

function ordenados(valores: Iterable<string>): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Enquanto o foco está num campo, as setas são do campo, não da apresentação. */
function digitando(alvo: EventTarget | null): boolean {
  const tag = (alvo as HTMLElement | null)?.tagName;
  return tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA";
}

interface Opcao {
  valor: string;
  rotulo: string;
}

/**
 * Filtro de múltipla escolha: marcar dois valores no mesmo campo é OU (soma),
 * e os campos se cruzam entre si (E). Nada marcado = todos.
 *
 * É um <details> com checkboxes em vez de <select multiple> porque o painel
 * roda na TV da reunião: ctrl+clique para marcar dois itens não serve ali.
 *
 * `busca` liga a caixa de pesquisa (nome ou iniciais, ver `casaBusca`) — só
 * vale a pena onde a lista é longa demais para rolar, hoje as instituições.
 * O que já está marcado nunca some da lista, mesmo fora da busca: senão
 * desmarcar exigiria adivinhar o texto que traz o item de volta.
 */
function CampoMulti({
  rotulo,
  opcoes,
  selecionados,
  aoAlternar,
  busca = false,
}: {
  rotulo: string;
  opcoes: Opcao[];
  selecionados: string[];
  aoAlternar: (valor: string) => void;
  busca?: boolean;
}) {
  const [termo, setTermo] = useState("");
  const marcados = opcoes.filter((o) => selecionados.includes(o.valor));
  const visiveis = termo
    ? opcoes.filter(
        (o) => selecionados.includes(o.valor) || casaBusca(o.rotulo, termo),
      )
    : opcoes;

  // Abrir/fechar no próprio campo é o <details> nativo; fechar clicando FORA é
  // o efeito de `fecharForaDoClique`, um listener só para todos os campos.
  return (
    <details className="campo campo-multi">
      <summary aria-label={rotulo}>
        <span className="campo-rotulo">{rotulo}</span>
        <span className="campo-resumo">
          {marcados.length === 0
            ? "Todos"
            : marcados.length <= 2
              ? marcados.map((o) => o.rotulo).join(", ")
              : `${marcados.length} selecionados`}
        </span>
      </summary>
      <div className="opcoes">
        {busca && (
          <input
            className="opcoes-busca"
            type="search"
            value={termo}
            placeholder="Nome ou iniciais…"
            aria-label={`Pesquisar em ${rotulo}`}
            onChange={(e) => setTermo(e.target.value)}
          />
        )}
        {visiveis.map((o) => (
          <label key={o.valor}>
            <input
              type="checkbox"
              checked={selecionados.includes(o.valor)}
              onChange={() => aoAlternar(o.valor)}
            />
            {o.rotulo}
          </label>
        ))}
        {visiveis.length === 0 && (
          <p className="opcoes-vazio">Nada encontrado</p>
        )}
      </div>
    </details>
  );
}

/**
 * Fecha todo `<details>` usado como dropdown quando o clique cai fora dele —
 * o que qualquer menu faz e o `<details>` nativo não faz sozinho. Um listener
 * no documento serve os filtros e os menus do cabeçalho de uma vez; o `open` é
 * do DOM (o React não o controla), então basta apagá-lo.
 *
 * O clique que ABRE um campo não o fecha: ele cai dentro do próprio `<details>`.
 */
function fecharForaDoClique(alvo: Node): void {
  for (const d of document.querySelectorAll<HTMLDetailsElement>(
    "details.campo-multi[open], details.menu[open]",
  )) {
    if (!d.contains(alvo)) d.open = false;
  }
}

/**
 * Dropdown do cabeçalho — mesmo `<details>` nativo do CampoMulti, sem estado nem
 * biblioteca. Guarda páginas ou botões que não cabem mais na fileira do topo.
 * Fecha ao escolher um item (o `open` é do DOM, o React não mexe nele).
 */
function Menu({
  rotulo,
  ativo,
  children,
}: {
  rotulo: string;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="menu">
      <summary aria-current={ativo ? "page" : undefined}>{rotulo}</summary>
      <div
        className="menu-itens"
        onClick={(e) => {
          e.currentTarget.closest("details")!.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
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

  const alternarApresentacao = () => {
    const ligando = !apresentacao;
    setApresentacao(ligando);
    // Tela cheia precisa do gesto do usuário — daí sair daqui, e não do efeito.
    if (ligando) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.();
  };

  useEffect(() => {
    const aoClicar = (e: MouseEvent) => fecharForaDoClique(e.target as Node);
    document.addEventListener("click", aoClicar);
    return () => document.removeEventListener("click", aoClicar);
  }, []);

  const posicao = ciclos.findIndex((c) => c.ano === ano);
  const atual = ciclos[posicao];
  const anterior = ciclos[posicao + 1]; // do mais recente ao mais antigo

  const todos = useMemo(() => atual?.projetos ?? [], [atual]);
  const projetos = useMemo(() => filtrar(todos, filtros), [todos, filtros]);
  const projetosAnteriores = useMemo(
    () => (anterior ? filtrar(anterior.projetos, filtros) : []),
    [anterior, filtros],
  );

  /**
   * Modo apresentação/TV: fontes maiores (a classe no <body>, ver globals.css),
   * um painel por vez e navegação por teclado — ←/→ trocam de página, Esc sai.
   * Sem biblioteca de slides: as páginas já SÃO os slides.
   *
   * Fica depois de `projetos` de propósito: as setas leem o recorte.
   */
  useEffect(() => {
    if (!apresentacao) return;
    document.body.classList.add("apresentacao");

    const ir = (passo: number) => {
      const i = PAGINAS.findIndex((p) => p.href === caminho);
      // Dentro de uma pasta as setas andam pelos PROJETOS do recorte, não pelas
      // páginas: no meio da apresentação de um projeto, uma seta que saltava
      // para a Visão Geral perdia a sala. Fora do recorte, não anda.
      if (i < 0) {
        const j = projetos.findIndex((p) => caminho === `/projetos/${p.id}`);
        if (j < 0) return;
        const prox = projetos[(j + passo + projetos.length) % projetos.length]!;
        router.push(`/projetos/${prox.id}`);
        return;
      }
      const proximo = (i + passo + PAGINAS.length) % PAGINAS.length;
      router.push(PAGINAS[proximo]!.href);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (digitando(e.target)) return;
      // Com o visor de anexo aberto, o teclado é dele: Esc fecha o documento
      // (e não a apresentação) e as setas não trocam de projeto por baixo.
      if (document.querySelector("dialog[open]")) return;
      // Idem com o mapa expandido: o Esc fecha o mapa, não a apresentação.
      const cheio = document.fullscreenElement;
      if (cheio && cheio !== document.documentElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") ir(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") ir(-1);
      else if (e.key === "Escape") setApresentacao(false);
    };

    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.classList.remove("apresentacao");
    };
  }, [apresentacao, caminho, router, projetos]);

  // As opções saem do ciclo inteiro; se saíssem do resultado filtrado, o próprio
  // filtro sumiria da lista depois de aplicado.
  const opcoes = useMemo(
    () => ({
      continentes: ordenados(todos.map((p) => p.local.continente)),
      status: ordenados(todos.map((p) => p.statusGrupo)) as StatusGrupo[],
      categorias: ordenados(todos.map((p) => p.categoria)),
      instituicoes: ordenados(
        todos
          .map((p) => p.instituicaoNome)
          .filter((n): n is string => n !== null),
      ),
      responsaveis: ordenados(
        todos
          .map((p) => p.revisao.responsavel)
          .filter((r): r is string => r !== null),
      ),
      tags: ordenados(todos.flatMap((p) => p.analise.tags)),
    }),
    [todos],
  );

  // A pasta do projeto é tela cheia de leitura: filtro global ali só rouba
  // espaço da TV. Some na rota de detalhe (e só nela).
  const emDetalhe = caminho.startsWith("/projetos/");

  const aplicar = (parcial: Partial<Filtros>) =>
    setFiltros((f) => ({ ...f, ...parcial }));
  const alternarPais = (iso3: string | null) =>
    setFiltros((f) => ({ ...f, iso3: f.iso3 === iso3 ? null : iso3 }));

  const nomePais = filtros.iso3
    ? (todos.find((p) => p.local.iso3 === filtros.iso3)?.local.nomePt ??
      filtros.iso3)
    : null;
  const filtroAtivo = temFiltro(filtros);

  const aba = (p: (typeof PAGINAS)[number]) => (
    <Link
      key={p.href}
      href={p.href}
      aria-current={caminho === p.href ? "page" : undefined}
    >
      {p.rotulo}
    </Link>
  );

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
        nomePais,
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
            {/* Moldura, não título da página: o <h1> pertence ao registro
                aberto (o nome do projeto), senão o sumário de títulos abre
                com a marca em toda rota. */}
            <p className="titulo">Painel Consultivo · Hebron ASEEC</p>
            <p>Instrumentos de Deus na transformação de vidas.</p>
          </div>
        </div>

        <nav className="abas" aria-label="Páginas do painel">
          {ABAS.map(aba)}
          {GRUPOS.map((g) => {
            const dentro = PAGINAS.filter((p) => p.menu === g);
            const aqui = dentro.find((p) => p.href === caminho);
            // Estando numa página do grupo, o botão mostra qual — na TV o título
            // do slide não pode virar um "Mais" genérico.
            return (
              <Menu key={g} rotulo={aqui?.rotulo ?? g} ativo={!!aqui}>
                {dentro.map(aba)}
              </Menu>
            );
          })}
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
          <Menu rotulo="Ações">
            <button
              title="Fontes maiores, tela cheia e navegação por ←/→ (Esc sai)"
              onClick={alternarApresentacao}
            >
              {apresentacao ? "Sair da apresentação" : "Apresentar"}
            </button>
            <button
              title="Abre a impressão do navegador — escolha 'Salvar como PDF'"
              onClick={() => window.print()}
            >
              Exportar PDF
            </button>
          </Menu>
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
            Data e URL o próprio navegador carimba no cabeçalho da impressão.

            Na pasta de um projeto isto NÃO sai: `PAGINAS.find` não casa a rota
            de detalhe e carimbava "Painel · Remessa 2026" mais o recorte e a
            contagem de outra página em cima de um dossiê de um projeto só.
            Quem sabe o nome do registro é a própria página — ela imprime a
            sua linha (ver o .so-impressao em projetos/[id]/detalhe.tsx). */}
        {!emDetalhe && (
          <div className="so-impressao">
            <b>
              {(() => {
                const p = PAGINAS.find((x) => x.href === caminho);
                return p?.titulo ?? p?.rotulo ?? "Painel";
              })()}{" "}
              · Remessa {ano}
            </b>
            <span>{resumoFiltros(filtros, nomePais)}</span>
            <span>
              {projetos.length} de {todos.length} projetos
            </span>
          </div>
        )}

        <div className="filtros cartao" hidden={emDetalhe}>
          <CampoMulti
            rotulo="Continente"
            opcoes={opcoes.continentes.map((c) => ({ valor: c, rotulo: c }))}
            selecionados={filtros.continente}
            aoAlternar={(v) =>
              aplicar({ continente: alternar(filtros.continente, v) })
            }
          />

          <CampoMulti
            rotulo="Status"
            opcoes={opcoes.status.map((s) => ({
              valor: s,
              rotulo: ROTULO_STATUS[s],
            }))}
            selecionados={filtros.status}
            aoAlternar={(v) => aplicar({ status: alternar(filtros.status, v) })}
          />

          <CampoMulti
            rotulo="Categoria"
            opcoes={opcoes.categorias.map((c) => ({
              valor: c,
              rotulo: rotuloCategoria(c),
            }))}
            selecionados={filtros.categoria}
            aoAlternar={(v) =>
              aplicar({ categoria: alternar(filtros.categoria, v) })
            }
          />

          <CampoMulti
            rotulo="Instituição"
            busca
            opcoes={opcoes.instituicoes.map((i) => ({ valor: i, rotulo: i }))}
            selecionados={filtros.instituicao}
            aoAlternar={(v) =>
              aplicar({ instituicao: alternar(filtros.instituicao, v) })
            }
          />

          {/* Triagem novo × renovação (Fase 5): é o eixo que decide QUEM analisa
              o projeto na reunião, então anda junto dos outros filtros globais. */}
          <CampoMulti
            rotulo="Triagem"
            opcoes={[
              { valor: "novo", rotulo: "Novos" },
              { valor: "renovacao", rotulo: "Renovações" },
              { valor: "revisar", rotulo: "A revisar" },
            ]}
            selecionados={filtros.tipo}
            aoAlternar={(v) => aplicar({ tipo: alternar(filtros.tipo, v) })}
          />

          {/* Análise prévia (Fase 10): o filtro que responde "o que ainda não
              olhamos?". A equipe analisa um pouco por dia, a várias mãos, e o
              status do projeto quase nunca muda junto — sem este eixo não há
              como retomar de onde se parou. */}
          {/* "Análise prévia" por extenso, e não "Análise": ao lado de Triagem
              e de Tags, "Análise" sozinho se confunde com a avaliação (as notas
              dos conselheiros), que é outra coisa e vem depois. */}
          <CampoMulti
            rotulo="Análise prévia"
            opcoes={[
              { valor: "sim", rotulo: "Analisados" },
              { valor: "nao", rotulo: "Não analisados" },
            ]}
            selecionados={filtros.analise}
            aoAlternar={(v) =>
              aplicar({ analise: alternar(filtros.analise, v) })
            }
          />

          {opcoes.tags.length > 0 && (
            <CampoMulti
              rotulo="Tags"
              busca
              opcoes={opcoes.tags.map((t) => ({ valor: t, rotulo: t }))}
              selecionados={filtros.tag}
              aoAlternar={(v) => aplicar({ tag: alternar(filtros.tag, v) })}
            />
          )}

          {opcoes.responsaveis.length > 0 && (
            <CampoMulti
              rotulo="Responsável"
              opcoes={[
                ...opcoes.responsaveis.map((r) => ({ valor: r, rotulo: r })),
                { valor: SEM_RESPONSAVEL, rotulo: "Sem responsável" },
              ]}
              selecionados={filtros.responsavel}
              aoAlternar={(v) =>
                aplicar({ responsavel: alternar(filtros.responsavel, v) })
              }
            />
          )}

          {filtroAtivo && (
            <button
              className="limpar"
              title="Limpar filtros"
              aria-label="Limpar filtros"
              onClick={() => setFiltros(SEM_FILTRO)}
            >
              ✕
            </button>
          )}

          <div className="fichas">
            {nomePais && (
              <button className="ficha" onClick={() => alternarPais(null)}>
                <b>{nomePais}</b> ✕
              </button>
            )}
            {filtros.uf && (
              <button className="ficha" onClick={() => aplicar({ uf: null })}>
                <b>{NOME_UF[filtros.uf] ?? filtros.uf}</b> ✕
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
