"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { avaliavel } from "@/lib/agregar";
import { lerValor, SITUACOES, type Situacao } from "@/lib/decisao";
import {
  atribuir,
  compararNaLista,
  grupoNaLista,
  ROTULO_GRUPO,
  type GrupoLista,
  distribuir,
  ENVELOPE,
  ENVELOPES,
  ENVELOPES_DE_PROJETO,
  fluxo,
  igualADiretriz,
  linhaProjeto,
  MESES,
  mesesParaTotal,
  montarCaixaAno,
  montarQuadro,
  posicoes,
  ROTULO_DESTINO,
  ROTULO_FONTE,
  somaAlvos,
  somaMeses,
  tirarDoMes,
  type Alvos,
  type ChaveEnvelope,
  type DestinoParcela,
  type LinhaQuadro,
} from "@/lib/envelopes";
import { planilhaEnvelopes } from "@/lib/envelopes-xlsx";
import type { AjusteEnvelope } from "@/lib/painel-db";
import type { ProjetoCiclo } from "@/lib/types";
import { TIPO_XLSX } from "@/lib/xlsx";
import { baixar } from "../projetos/exportar";
import { urlVotacao } from "../projetos/ir-para";
import {
  salvarAdministrativo,
  salvarCaixa,
  salvarEnvelope,
  salvarMesesEmLote,
} from "../../actions";
import { usePainel } from "../contexto";
import {
  fmtInt,
  fmtMoeda,
  num,
  plural,
  rotuloCategoria,
  rotuloStatus,
  SEM_RESULTADO,
} from "../formato";
import { Regua, Secao } from "../ui";

/**
 * Envelopes da diretriz (Fases 15 e 15b). Três leituras, de cima para baixo:
 *
 *  1. O CAIXA mês a mês: receita (do sistema ou digitada) menos administrativo
 *     e projetos, com o saldo do mês e o acumulado. É onde se decide adiar ou
 *     diminuir parcelas.
 *  2. Os ENVELOPES no ano: limite = receita × diretriz, contra a proposta. A
 *     base é a RECEITA, não o teto do sistema, que já vem sem o administrativo
 *     (aplicar a diretriz nele descontava o administrativo duas vezes).
 *  3. Os PROJETOS, com o recorte global e o filtro por envelope; os votados
 *     sobem pela nota (com empate dito como empate).
 *
 * Os dois primeiros somam a remessa inteira, sem o recorte: um envelope
 * recortado "cabe" sempre.
 *
 * Edição tipo planilha: setas andam entre as células; Enter ou um número abre
 * a célula; Enter grava e desce, Tab anda para o lado, Esc desiste. Baixar um
 * mês pergunta para onde vai a diferença (mês seguinte, outros meses ou corte).
 */

type Filtro = ChaveEnvelope | "sem" | null;
type Mover = "baixo" | "direita" | "esquerda" | null;
/** Linha (id do projeto, ou "receita" / "admin" / "saldo") e coluna (0..11 = mês, 12 = total). */
type Alvo = { linha: string; col: number; inicial?: string };

interface Digitados {
  receita: (number | null)[] | null;
  admin: (number | null)[] | null;
  saldoInicial: number | null;
  /** Percentuais da mesa; null = diretriz da reunião. */
  alvos?: Alvos | null;
}

const RECEITA = "receita";
const ADMIN = "admin";
const SALDO = "saldo";
/** Linha do percentual de um envelope no quadro: "alvo:missoes". */
const ALVO = "alvo:";

/** Percentual com até duas casas: "6,8%", "6,85%". */
const fmtPct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const COL_TOTAL = 12;
/** Coluna do select de envelope na navegação por setas. */
const COL_ENVELOPE = -1;
const COLS_PROJETO = [COL_ENVELOPE, COL_TOTAL, ...MESES.map((_, i) => i)];

/** A origem da proposta na célula (o rótulo inteiro fica na dica). */
const FONTE_CURTA: Record<string, string> = {
  ajuste: "ajustado",
  decisao: "da pasta",
  sistema: "aprovado",
  zerado: "fora",
};

const fmtReal = (v: number) =>
  Math.abs(v) < 0.5
    ? "·"
    : `${v < 0 ? "−" : ""}${fmtInt.format(Math.round(Math.abs(v)))}`;
const fmtCampo = (v: number) =>
  v === 0 ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtSinal = (v: number) =>
  `${v < 0 ? "−" : ""}${fmtMoeda.format(Math.abs(v))}`;

/** "R$ 1,2 mi" para a frase do veredito, que é lida em voz alta. */
const fmtFala = (v: number) =>
  Math.abs(v) >= 1e6
    ? `R$ ${num(v / 1e6, 2)} mi`
    : `R$ ${fmtInt.format(Math.round(v / 1000))} mil`;

const lista = (itens: string[]) =>
  itens.length <= 1
    ? (itens[0] ?? "")
    : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;

const ehNav = (e: Element | null): e is HTMLElement =>
  !!e && e instanceof HTMLElement && !!e.dataset.nav;

/** Uma célula de valor: texto até ser aberta, campo enquanto edita. */
function Celula({
  valor,
  texto,
  rotulo,
  editavel,
  editando,
  inicial,
  nav,
  tabbable,
  classe,
  dica,
  aoAbrir,
  aoConfirmar,
  aoCancelar,
  children,
}: {
  valor: number;
  texto: string;
  rotulo: string;
  editavel: boolean;
  editando: boolean;
  /** Tecla que abriu a célula (digitar um número já começa a edição). */
  inicial?: string;
  /** "linha:coluna" para as setas; sem isso a célula fica fora da grade. */
  nav?: string;
  tabbable?: boolean;
  classe?: string;
  dica?: string;
  aoAbrir: (inicial?: string) => void;
  aoConfirmar: (bruto: string, mover: Mover) => void;
  aoCancelar: () => void;
  /** Linhas de apoio abaixo do valor (de onde veio, ações). */
  children?: React.ReactNode;
}) {
  // Enter/Tab desmontam o campo, e alguns navegadores ainda disparam o blur.
  const feito = useRef(false);
  if (!editavel)
    return (
      <td className={`n ${classe ?? ""}`} title={dica}>
        {texto}
        {children}
      </td>
    );
  return (
    <td className={`n celula-edita ${classe ?? ""}`} title={dica}>
      {editando ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          inputMode="decimal"
          aria-label={rotulo}
          defaultValue={inicial ?? fmtCampo(valor)}
          onFocus={(e) => {
            feito.current = false;
            if (inicial === undefined) e.currentTarget.select();
          }}
          onKeyDown={(e) => {
            const fim = (m: Mover) => {
              e.preventDefault();
              feito.current = true;
              aoConfirmar(e.currentTarget.value, m);
            };
            if (e.key === "Enter") fim("baixo");
            else if (e.key === "Tab") fim(e.shiftKey ? "esquerda" : "direita");
            else if (e.key === "Escape") {
              e.preventDefault();
              feito.current = true;
              aoCancelar();
            }
          }}
          onBlur={(e) => {
            if (!feito.current) aoConfirmar(e.currentTarget.value, null);
          }}
        />
      ) : (
        <button
          type="button"
          data-nav={nav}
          tabIndex={nav ? (tabbable ? 0 : -1) : undefined}
          aria-label={`${rotulo}: ${texto === "·" ? "zero" : texto}`}
          onClick={() => aoAbrir()}
          onKeyDown={(e) => {
            if (/^[0-9]$/.test(e.key)) {
              e.preventDefault();
              aoAbrir(e.key);
            }
          }}
        >
          {texto}
        </button>
      )}
      {children}
    </td>
  );
}

/**
 * Baixou um mês: para onde vai a diferença? Fica dentro da célula, sem janela
 * modal. 1/2/3 escolhem, Enter repete a última escolha, Esc desiste.
 */
function Escolha({
  diferenca,
  mes,
  ultimo,
  podeAdiar,
  aoEscolher,
  aoDesistir,
}: {
  diferenca: number;
  mes: string;
  ultimo: DestinoParcela;
  podeAdiar: boolean;
  aoEscolher: (d: DestinoParcela) => void;
  aoDesistir: () => void;
}) {
  const destinos: DestinoParcela[] = ["adiar", "redistribuir", "cortar"];
  const inicial = podeAdiar || ultimo !== "adiar" ? ultimo : "redistribuir";
  return (
    <div
      className="escolha"
      role="group"
      aria-label={`O que fazer com ${fmtMoeda.format(diferenca)} tirados de ${mes}`}
      onKeyDown={(e) => {
        const i = Number(e.key) - 1;
        if (i >= 0 && i < 3 && (i !== 0 || podeAdiar)) {
          e.preventDefault();
          aoEscolher(destinos[i]!);
        } else if (e.key === "Escape") {
          e.preventDefault();
          aoDesistir();
        }
      }}
    >
      <p>
        <b>{fmtMoeda.format(diferenca)}</b> a menos em {mes}:
      </p>
      {destinos.map((d, i) => (
        <button
          key={d}
          type="button"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={d === inicial}
          disabled={d === "adiar" && !podeAdiar}
          onClick={() => aoEscolher(d)}
        >
          <kbd>{i + 1}</kbd> {ROTULO_DESTINO[d]}
        </button>
      ))}
      <button type="button" className="escolha-desistir" onClick={aoDesistir}>
        Esc · desistir
      </button>
    </div>
  );
}

interface Linha extends ReturnType<typeof linhaProjeto> {
  p: ProjetoCiclo;
  atrib: ReturnType<typeof atribuir>;
  sugestao: ReturnType<typeof atribuir>;
  situacao: string | null;
  /** Aprovados › votados › sem voto › fora da proposta. */
  grupo: GrupoLista;
}

/** A ordem da lista: a classificação padrão, ou uma coluna clicada no cabeçalho. */
interface Ordem {
  col: "classificacao" | "projeto" | "pedido" | "proposta" | number;
  desc: boolean;
}

export default function Envelopes({
  sistema,
  digitadosIniciais,
  ajustesIniciais,
  decisoes,
  gravavel,
  falhaBanco,
  envelopeInicial,
}: {
  /** O que o sistema de submissão diz do ano: receita (antes do adm.), teto e adm. */
  sistema: Record<
    number,
    { receita: number | null; teto: number | null; admin: number | null }
  >;
  digitadosIniciais: Record<number, Digitados>;
  ajustesIniciais: Record<string, AjusteEnvelope>;
  decisoes: Record<
    string,
    { situacao: string | null; valorAprovado: number | null }
  >;
  gravavel: boolean;
  /** Por que o banco do painel não leu (null = leu normalmente). */
  falhaBanco: string | null;
  envelopeInicial: Filtro;
}) {
  const { ano, todos, projetos, filtroAtivo } = usePainel();
  const [ajustes, setAjustes] = useState(ajustesIniciais);
  const [digitados, setDigitados] = useState(digitadosIniciais);
  const [filtro, setFiltro] = useState<Filtro>(envelopeInicial);
  const [editando, setEditando] = useState<Alvo | null>(null);
  const [pendente, setPendente] = useState<
    (Alvo & { novo: number; mover: Mover }) | null
  >(null);
  const [ultimoDestino, setUltimoDestino] = useState<DestinoParcela>("adiar");
  const [foco, setFoco] = useState<{ r: number; c: number }>({
    r: 0,
    c: COL_TOTAL,
  });
  const [lote, setLote] = useState<number | null>(null);
  const [ordem, setOrdem] = useState<Ordem>({
    col: "classificacao",
    desc: false,
  });
  const [soComParcela, setSoComParcela] = useState(false);
  const [salvando, setSalvando] = useState(0);
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(
    null,
  );
  const [geradoEm, setGeradoEm] = useState("");
  const tabela = useRef<HTMLTableElement>(null);

  useEffect(() => {
    setGeradoEm(
      new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date()),
    );
  }, []);

  const doSistema = sistema[ano] ?? { receita: null, teto: null, admin: null };
  const dig = digitados[ano] ?? {
    receita: null,
    admin: null,
    saldoInicial: null,
  };

  // ------------------------------------------------------------ as contas

  const linhas: Linha[] = useMemo(
    () =>
      todos
        .filter((p) => avaliavel(p.status))
        .map((p) => {
          const aj = ajustes[p.id];
          const decisao = decisoes[p.id] ?? null;
          return {
            p,
            atrib: atribuir(p, aj?.envelope),
            sugestao: atribuir(p, null),
            situacao: decisao?.situacao ?? null,
            grupo: grupoNaLista(p, decisao?.situacao ?? null),
            ...linhaProjeto(p, aj?.meses ?? null, decisao),
          };
        }),
    [todos, ajustes, decisoes],
  );

  const caixa = useMemo(
    () => montarCaixaAno(doSistema.receita, dig),
    [doSistema.receita, dig],
  );

  const quadro = useMemo(
    () =>
      montarQuadro(
        linhas.map((l) => ({
          chave: l.atrib.chave,
          pedido: l.p.solicitado,
          propostaMeses: l.propostaMeses,
        })),
        caixa.adminMeses,
        caixa.receita,
        caixa.alvos,
      ),
    [linhas, caixa],
  );
  const envelopesProjeto = quadro.linhas.filter(
    (q) => q.chave !== "administrativo",
  );
  const projetosMeses = MESES.map((_, i) =>
    envelopesProjeto.reduce((s, q) => s + q.propostaMeses[i]!, 0),
  );
  const fx = fluxo(caixa.saldoInicial, caixa.receitaMeses, [
    caixa.adminMeses,
    projetosMeses,
  ]);

  const noRecorte = useMemo(() => {
    const ids = new Set(projetos.map((p) => p.id));
    return linhas.filter((l) => ids.has(l.p.id));
  }, [linhas, projetos]);

  const casa = (l: Linha, f: Filtro) =>
    f === null || (f === "sem" ? l.atrib.chave === null : l.atrib.chave === f);
  const contagem = (f: Filtro) => noRecorte.filter((l) => casa(l, f)).length;

  /** A classificação padrão: grupo (aprovados › votados › sem voto › fora) e nota. */
  const classificados = useMemo(
    () =>
      noRecorte
        .filter((l) => casa(l, filtro))
        .sort((a, b) =>
          compararNaLista(
            { ...a.p, grupo: a.grupo },
            { ...b.p, grupo: b.grupo },
          ),
        ),
    [noRecorte, filtro],
  );

  /**
   * A colocação vale para quem foi classificado pela nota (aprovados e
   * votados). Empate pela nota que a tela mostra (uma casa) e dentro do mesmo
   * grupo: um 5,0 aprovado não empata com um 5,0 ainda sem decisão.
   */
  const colocacao = useMemo(() => {
    const ranqueados = classificados.filter((l) => l.grupo <= 1);
    const pos = posicoes(
      ranqueados.map((l) =>
        l.p.notaMedia === null
          ? null
          : (l.grupo === 0 ? 100 : 0) + Math.round(l.p.notaMedia * 10) / 10,
      ),
    );
    return new Map(
      ranqueados.map((l, i) => [
        l.p.id,
        {
          pos: pos[i]!,
          empatado: pos[i] === pos[i - 1] || pos[i] === pos[i + 1],
        },
      ]),
    );
  }, [classificados]);
  const empateTopo = [...colocacao.values()].filter((c) => c.pos === 1).length;

  const ordemPadrao = ordem.col === "classificacao" && !ordem.desc;
  const mesOrdenado = typeof ordem.col === "number" ? ordem.col : null;
  const visiveis = useMemo(() => {
    const chave = (l: Linha): number | string => {
      if (ordem.col === "projeto") return l.p.titulo;
      if (ordem.col === "pedido") return l.p.solicitado;
      if (ordem.col === "proposta") return somaMeses(l.propostaMeses);
      if (typeof ordem.col === "number") return l.propostaMeses[ordem.col]!;
      return 0;
    };
    let r =
      mesOrdenado !== null && soComParcela
        ? classificados.filter((l) => l.propostaMeses[mesOrdenado]! > 0)
        : [...classificados];
    if (ordem.col === "classificacao") return ordem.desc ? r.reverse() : r;
    // Ordenação estável: no empate fica a ordem da classificação.
    r = r.sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      const c =
        typeof x === "string"
          ? x.localeCompare(String(y), "pt-BR", { sensitivity: "base" })
          : x - (y as number);
      return ordem.desc ? -c : c;
    });
    return r;
  }, [classificados, ordem, soComParcela, mesOrdenado]);

  /** Clicar no cabeçalho ordena; clicar de novo inverte. */
  const ordenarPor = (col: Ordem["col"]) =>
    setOrdem((o) =>
      o.col === col
        ? { col, desc: !o.desc }
        : { col, desc: col !== "classificacao" && col !== "projeto" },
    );
  const ariaSort = (col: Ordem["col"]) =>
    ordem.col === col ? (ordem.desc ? "descending" : "ascending") : undefined;
  // Função, não componente: um componente criado no render remontaria o botão
  // a cada clique e o foco do teclado se perderia.
  const cabecalho = (
    col: Ordem["col"],
    children: React.ReactNode,
    classe?: string,
  ) => (
    <th key={String(col)} className={classe} aria-sort={ariaSort(col)}>
      <button
        type="button"
        className="ordenar"
        title="Ordenar por esta coluna (clique de novo para inverter)"
        onClick={() => ordenarPor(col)}
      >
        {children}
        <span aria-hidden="true" className="seta-ordem">
          {ordem.col === col ? (ordem.desc ? "▼" : "▲") : "↕"}
        </span>
      </button>
    </th>
  );
  const temSemEnvelope = linhas.some((l) => l.atrib.chave === null);

  // A célula que recebe o Tab (as setas cuidam do resto) não pode apontar para
  // uma linha que sumiu com o filtro.
  const focoValido = {
    r: Math.min(foco.r, Math.max(0, visiveis.length - 1)),
    c: foco.c,
  };

  // Fechou a edição ou a escolha de um projeto: o foco volta para a célula,
  // não para o topo da página (só depois de editar, nunca ao carregar).
  const editavaProjeto = useRef(false);
  useEffect(() => {
    const aberto = editando ?? pendente;
    if (aberto) {
      editavaProjeto.current =
        ![RECEITA, ADMIN, SALDO].includes(aberto.linha) &&
        !aberto.linha.startsWith(ALVO);
      return;
    }
    if (!editavaProjeto.current) return;
    editavaProjeto.current = false;
    if (document.activeElement && document.activeElement !== document.body)
      return;
    tabela.current
      ?.querySelector<HTMLElement>(
        `[data-nav="${focoValido.r}:${focoValido.c}"]`,
      )
      ?.focus();
  }, [editando, pendente, focoValido.r, focoValido.c]);

  /** Abrir uma célula descarta a escolha pendente de outra. */
  const abrirCelula = (a: Alvo | null) => {
    setPendente(null);
    setEditando(a);
  };

  // ------------------------------------------------------------ gravação

  async function executar(
    rotulo: string,
    otimista: () => () => void,
    chamada: () => Promise<{ erro?: string }>,
  ) {
    const desfazer = otimista();
    setSalvando((n) => n + 1);
    const r = await chamada().catch(() => ({
      erro: "Sem conexão com o servidor. Nada foi gravado.",
    }));
    setSalvando((n) => n - 1);
    if (r.erro) {
      desfazer();
      setAviso({ erro: true, texto: `${rotulo}: ${r.erro}` });
    } else setAviso({ erro: false, texto: `Gravado: ${rotulo}` });
  }

  function gravar(
    l: Linha,
    campos: { envelope?: ChaveEnvelope | null; meses?: number[] | null },
  ) {
    const id = l.p.id;
    return executar(
      l.p.titulo,
      () => {
        const antes = ajustes[id];
        setAjustes((a) => ({
          ...a,
          [id]: {
            envelope: a[id]?.envelope ?? null,
            meses: a[id]?.meses ?? null,
            atualizadoPor: a[id]?.atualizadoPor ?? null,
            ...campos,
          },
        }));
        return () =>
          setAjustes((a) => {
            const { [id]: _, ...resto } = a;
            return antes ? { ...a, [id]: antes } : resto;
          });
      },
      () => salvarEnvelope({ id, ano: l.p.ano, titulo: l.p.titulo }, campos),
    );
  }

  function gravarDigitados(rotulo: string, novo: Partial<Digitados>) {
    const chamada =
      "admin" in novo
        ? () => salvarAdministrativo(ano, novo.admin)
        : () => salvarCaixa(ano, novo);
    return executar(
      rotulo,
      () => {
        const antes = digitados[ano];
        setDigitados((d) => ({ ...d, [ano]: { ...dig, ...novo } }));
        return () => setDigitados((d) => ({ ...d, [ano]: antes! }));
      },
      chamada,
    );
  }

  /** Lê o valor digitado. Vazio vira `vazio`; devolve undefined (e avisa) se não for número. */
  function lido(
    bruto: string,
    vazio: number | null,
    negativo = false,
  ): number | null | undefined {
    const t = bruto.trim();
    if (t === "") return vazio;
    const menos = negativo && /^[-−]/.test(t);
    const v = lerValor(menos ? t.slice(1) : t);
    if (!Number.isFinite(v) || v > 1e9) {
      setAviso({
        erro: true,
        texto: `"${bruto}" não é um valor. Use, por exemplo, 3.500 ou 3500,50.`,
      });
      return undefined;
    }
    return Math.round((menos ? -v : v) * 100) / 100;
  }

  /** Para onde o cursor vai depois de gravar: a planilha anda sozinha. */
  function proximo(alvo: Alvo, mover: Mover): Alvo | null {
    if (mover === null) return null;
    if (alvo.linha.startsWith(ALVO)) {
      // Percentuais: Enter desce para o envelope de baixo; o resto fecha.
      if (mover !== "baixo") return null;
      const i = ENVELOPES.findIndex((e) => ALVO + e.chave === alvo.linha);
      const prox = ENVELOPES[i + 1];
      return prox ? { linha: ALVO + prox.chave, col: 0 } : null;
    }
    const noCaixa = alvo.linha === RECEITA || alvo.linha === ADMIN;
    if (alvo.linha === SALDO) return null;
    const ordem = noCaixa ? [RECEITA, ADMIN] : visiveis.map((l) => l.p.id);
    const cols = noCaixa ? MESES.map((_, i) => i) : COLS_PROJETO.slice(1);
    const i = ordem.indexOf(alvo.linha);
    if (mover === "baixo") {
      const prox = ordem[i + 1];
      return prox ? { linha: prox, col: alvo.col } : null;
    }
    const passo = mover === "direita" ? 1 : -1;
    const col = cols[cols.indexOf(alvo.col) + passo];
    if (col !== undefined) return { linha: alvo.linha, col };
    const prox = ordem[i + passo];
    return prox
      ? { linha: prox, col: passo > 0 ? cols[0]! : cols.at(-1)! }
      : null;
  }

  function andar(alvo: Alvo, mover: Mover) {
    const prox = proximo(alvo, mover);
    setEditando(prox);
    const r = visiveis.findIndex((l) => l.p.id === (prox ?? alvo).linha);
    if (r >= 0) setFoco({ r, c: (prox ?? alvo).col });
  }

  function confirmarProjeto(
    l: Linha,
    col: number,
    bruto: string,
    mover: Mover,
  ) {
    const v = lido(bruto, 0);
    if (v === undefined || v === null || v < 0) return;
    const alvo = { linha: l.p.id, col };
    if (col === COL_TOTAL) {
      andar(alvo, mover);
      if (Math.abs(v - somaMeses(l.propostaMeses)) < 0.005) return;
      void gravar(l, {
        meses: distribuir(v, mesesParaTotal(l.propostaMeses, l.meses)),
      });
      return;
    }
    const atual = l.propostaMeses[col]!;
    if (Math.abs(v - atual) < 0.005) return andar(alvo, mover);
    if (v < atual) {
      // Baixou: a decisão de para onde vai a diferença é da mesa, na célula.
      setEditando(null);
      setPendente({ ...alvo, novo: v, mover });
      return;
    }
    andar(alvo, mover);
    void gravar(l, {
      meses: l.propostaMeses.map((x, i) => (i === col ? v : x)),
    });
  }

  function escolher(destino: DestinoParcela) {
    if (!pendente) return;
    const l = linhas.find((x) => x.p.id === pendente.linha);
    const meses =
      l && tirarDoMes(l.propostaMeses, pendente.col, pendente.novo, destino);
    if (!l || !meses) return;
    setUltimoDestino(destino);
    setPendente(null);
    andar(pendente, pendente.mover);
    void gravar(l, { meses });
  }

  function confirmarCaixa(
    linha: typeof RECEITA | typeof ADMIN,
    col: number,
    bruto: string,
    mover: Mover,
  ) {
    // Vazio volta ao padrão (sistema ÷ 12, ou a reserva do administrativo).
    const v = lido(bruto, null);
    if (v === undefined || (v !== null && v < 0)) return;
    setEditando(proximo({ linha, col }, mover));
    const atual = linha === RECEITA ? dig.receita : dig.admin;
    if ((atual?.[col] ?? null) === v) return;
    const exibido =
      linha === RECEITA ? caixa.receitaMeses[col]! : caixa.adminMeses[col]!;
    if (atual?.[col] == null && v !== null && Math.abs(v - exibido) < 0.005)
      return;
    const meses = (atual ?? Array<number | null>(12).fill(null)).map((x, i) =>
      i === col ? v : x,
    );
    void gravarDigitados(
      linha === RECEITA ? "receita" : "custos administrativos",
      linha === RECEITA ? { receita: meses } : { admin: meses },
    );
  }

  /**
   * Percentual de um envelope, digitado em pontos ("6,8" ou "6,8%"). Vazio
   * volta à diretriz da reunião. A soma pode sair de 100% no meio do caminho:
   * a tela avisa, não bloqueia.
   */
  function confirmarAlvo(chave: ChaveEnvelope, bruto: string, mover: Mover) {
    const v = lido(bruto.replace("%", ""), null);
    if (v === undefined) return;
    if (v !== null && (v < 0 || v > 100)) {
      setAviso({
        erro: true,
        texto: `"${bruto}" não é um percentual. Use um número de 0 a 100.`,
      });
      return;
    }
    setEditando(proximo({ linha: ALVO + chave, col: 0 }, mover));
    const novoValor =
      v === null ? ENVELOPE[chave].alvo : Math.round(v * 1e4) / 1e6;
    if (Math.abs(novoValor - caixa.alvos[chave]) < 1e-7) return;
    const novo = { ...caixa.alvos, [chave]: novoValor };
    void gravarDigitados(`diretriz de ${ENVELOPE[chave].rotulo}`, {
      alvos: igualADiretriz(novo) ? null : novo,
    });
  }

  /** Planilha da tela inteira, com as contas vivas (Leia-me explica). */
  function exportar() {
    const projetos = [...linhas]
      .sort((a, b) =>
        compararNaLista({ ...a.p, grupo: a.grupo }, { ...b.p, grupo: b.grupo }),
      )
      .map((l) => ({
        numero: l.p.numero,
        titulo: l.p.titulo,
        link: urlVotacao(l.p.id),
        instituicao: l.p.instituicaoNome,
        chave: l.atrib.chave,
        origem:
          l.atrib.origem === "mesa"
            ? "mesa"
            : l.atrib.origem === "avaliacao"
              ? `avaliação: ${l.atrib.motivo}`
              : l.atrib.origem === "sem"
                ? `categoria sem envelope (${rotuloCategoria(l.p.categoria)})`
                : `categoria (${rotuloCategoria(l.p.categoria)})`,
        grupo: ROTULO_GRUPO[l.grupo],
        nota: l.p.notaMedia,
        pedido: l.p.solicitado,
        pedidoMeses: l.pedidoMeses,
        propostaMeses: l.propostaMeses,
        fonte: l.fonte,
      }));
    baixar(
      `envelopes-${ano}.xlsx`,
      planilhaEnvelopes({
        ano,
        geradoEm,
        caixa,
        quadro,
        fx,
        tetoSistema: doSistema.teto,
        projetos,
      }),
      TIPO_XLSX,
    );
  }

  function confirmarSaldo(bruto: string) {
    setEditando(null);
    const v = lido(bruto, null, true);
    if (v === undefined || v === dig.saldoInicial) return;
    void gravarDigitados("saldo inicial", { saldoInicial: v });
  }

  /** Setas entre as células da lista (a grade tem uma parada só no Tab). */
  function navegar(e: React.KeyboardEvent<HTMLTableElement>) {
    const alvo = e.target as HTMLElement;
    if (!ehNav(alvo) || !e.key.startsWith("Arrow") || e.altKey) return;
    const [r, c] = alvo.dataset.nav!.split(":").map(Number) as [number, number];
    let nr = r;
    let ci = COLS_PROJETO.indexOf(c);
    if (e.key === "ArrowUp") nr--;
    else if (e.key === "ArrowDown") nr++;
    else if (e.key === "ArrowLeft") ci--;
    else if (e.key === "ArrowRight") ci++;
    // No select a seta trocaria o envelope (e gravaria): aqui ela só anda.
    e.preventDefault();
    const nc = COLS_PROJETO[ci];
    if (nc === undefined || nr < 0 || nr >= visiveis.length) return;
    setFoco({ r: nr, c: nc });
    tabela.current
      ?.querySelector<HTMLElement>(`[data-nav="${nr}:${nc}"]`)
      ?.focus();
  }

  // --------------------------------------------- adiar os sem nota num mês

  const mesesNegativos = fx.saldoMes
    .map((v, i) => (v < -0.5 ? i : -1))
    .filter((i) => i >= 0);

  const adiaveis = (mes: number) =>
    linhas.filter((l) => l.grupo === 2 && (l.propostaMeses[mes] ?? 0) > 0);

  function adiarLote(mes: number) {
    const itens = adiaveis(mes).map((l) => ({
      l,
      meses: tirarDoMes(l.propostaMeses, mes, 0, "adiar")!,
    }));
    setLote(null);
    const rotulo = `${plural(itens.length, "projeto adiado", "projetos adiados")} de ${MESES[mes]} para ${MESES[mes + 1]}`;
    void executar(
      rotulo,
      () => {
        const antes = ajustes;
        setAjustes((a) => {
          const novo = { ...a };
          for (const { l, meses } of itens)
            novo[l.p.id] = {
              envelope: a[l.p.id]?.envelope ?? null,
              atualizadoPor: a[l.p.id]?.atualizadoPor ?? null,
              meses,
            };
          return novo;
        });
        return () => setAjustes(antes);
      },
      () =>
        salvarMesesEmLote(
          itens.map(({ l, meses }) => ({
            id: l.p.id,
            ano: l.p.ano,
            titulo: l.p.titulo,
            meses,
          })),
        ),
    );
  }

  // ------------------------------------------------------------ o veredito

  const estouram = quadro.linhas
    .filter((q) => q.envelope && q.saldo !== null && q.saldo < -0.5)
    .sort((a, b) => a.saldo! - b.saldo!);
  // Misericórdia e administrativo não entram como "folga": um não recebe
  // projeto sem decisão da mesa, o outro não é dinheiro de projeto.
  const sobram = quadro.linhas
    .filter(
      (q) =>
        q.envelope &&
        !q.envelope.semProjetos &&
        q.chave !== "misericordia" &&
        q.saldo !== null &&
        q.saldo > 0.5,
    )
    .sort((a, b) => b.saldo! - a.saldo!);
  const receita = caixa.receita;
  const escala = Math.max(
    0.05,
    ...quadro.linhas.map((q) =>
      q.limite === null || !receita
        ? 0
        : Math.abs(q.proposta - q.limite) / receita,
    ),
  );
  const acumuladoNegativo = fx.acumulado
    .map((v, i): string | null => (v < -0.5 ? MESES[i]! : null))
    .filter((m): m is string => m !== null);
  const adminReserva = caixa.adminDigitado.filter((d) => !d).length;
  const paraProjetos = receita === null ? null : receita - caixa.admin;

  if (linhas.length === 0)
    return (
      <p className="vazio">
        Nenhum projeto avaliável na Remessa {ano}. Rejeitado, rascunho e
        cancelado ficam fora porque não disputam o teto.
      </p>
    );

  const rotuloFiltro =
    filtro === null
      ? null
      : filtro === "sem"
        ? "Sem envelope"
        : ENVELOPE[filtro].rotulo;

  const celulaCaixa = (
    linha: typeof RECEITA | typeof ADMIN,
    i: number,
    valor: number,
    digitado: boolean,
  ) => (
    <Celula
      key={i}
      valor={digitado ? valor : 0}
      texto={fmtReal(valor)}
      rotulo={`${linha === RECEITA ? "Receita" : "Custos administrativos"}, ${MESES[i]}`}
      editavel={gravavel}
      editando={editando?.linha === linha && editando.col === i}
      inicial={
        editando?.linha === linha && editando.col === i
          ? editando.inicial
          : undefined
      }
      classe={`mes${digitado ? "" : " padrao"}`}
      dica={
        digitado
          ? `Digitado: ${fmtMoeda.format(valor)}. Apague o valor para voltar ao padrão.`
          : `${linha === RECEITA ? "Receita do sistema ÷ 12" : `Reserva: ${fmtPct(caixa.alvos.administrativo)} da receita do mês`} (${fmtMoeda.format(valor)}), não digitado.`
      }
      aoAbrir={(inicial) => setEditando({ linha, col: i, inicial })}
      aoConfirmar={(b, m) => confirmarCaixa(linha, i, b, m)}
      aoCancelar={() => setEditando(null)}
    />
  );

  const somaDiretriz = somaAlvos(caixa.alvos);
  const foraDeCem = Math.abs(somaDiretriz - 1) > 0.0005;

  const celulaAlvo = (chave: ChaveEnvelope) => {
    const alvo = caixa.alvos[chave];
    const reuniao = ENVELOPE[chave].alvo;
    const linha = ALVO + chave;
    const mudou = Math.abs(alvo - reuniao) >= 1e-7;
    return (
      <Celula
        valor={Math.round(alvo * 1e6) / 1e4}
        texto={fmtPct(alvo)}
        rotulo={`Diretriz de ${ENVELOPE[chave].rotulo}, em %`}
        editavel={gravavel}
        editando={editando?.linha === linha}
        inicial={editando?.linha === linha ? editando.inicial : undefined}
        classe={mudou ? "mudou" : undefined}
        dica={
          mudou
            ? `Definido na reunião: ${fmtPct(reuniao)}. Apague o valor para voltar a ele.`
            : "Percentual da receita definido na reunião. Clique para mudar."
        }
        aoAbrir={(inicial) => setEditando({ linha, col: 0, inicial })}
        aoConfirmar={(b, m) => confirmarAlvo(chave, b, m)}
        aoCancelar={() => setEditando(null)}
      />
    );
  };

  return (
    <>
      <div className="so-impressao doc-campos">
        <span>
          Responsável: <i className="campo-papel" />
        </span>
        <span>Gerado em {geradoEm}</span>
        <span>Versão: documento de trabalho, sujeito à consolidação</span>
      </div>

      <div className="veredito">
        <h1>
          {receita === null ? (
            <>
              A proposta soma <b>{fmtFala(quadro.total.proposta)}</b>; sem
              receita conhecida, os envelopes não têm limite em reais.
            </>
          ) : estouram.length === 0 && quadro.total.saldo! >= 0 ? (
            <>
              A proposta de <b>{fmtFala(quadro.total.proposta)}</b> cabe na
              receita de {fmtFala(receita)} e em todos os envelopes.
            </>
          ) : (
            <>
              A proposta soma <b>{fmtFala(quadro.total.proposta)}</b> para uma
              receita de {fmtFala(receita)}
              {estouram.length > 0 ? (
                <>
                  ;{" "}
                  <b>
                    {plural(
                      estouram.length,
                      "envelope passa",
                      "envelopes passam",
                    )}
                  </b>{" "}
                  do limite.
                </>
              ) : (
                <>, {fmtFala(-quadro.total.saldo!)} acima.</>
              )}
            </>
          )}
        </h1>
        <p>
          {estouram.map((q, i) => (
            <span key={q.rotulo}>
              {i > 0 && "; "}
              <b>{q.rotulo}</b> {fmtFala(-q.saldo!)} acima
            </span>
          ))}
          {estouram.length > 0 && ". "}
          {sobram.length > 0 && (
            <>
              Há folga em{" "}
              {lista(sobram.map((q) => `${q.rotulo} (${fmtFala(q.saldo!)})`))}
              .{" "}
            </>
          )}
          {receita !== null &&
            (mesesNegativos.length === 0 ? (
              <>
                No caixa, todo mês fecha positivo
                {Math.abs(fx.acumulado[11]!) >= 0.5 &&
                  `, com ${fmtFala(fx.acumulado[11]!)} acumulados em dezembro`}
                .
              </>
            ) : (
              <>
                No caixa, a saída passa a receita em{" "}
                <b>{lista(mesesNegativos.map((i) => MESES[i]!))}</b>
                {acumuladoNegativo.length > 0
                  ? `, e o acumulado fica negativo em ${lista(acumuladoNegativo)}`
                  : ", mas o acumulado cobre"}
                .
              </>
            ))}
        </p>
      </div>

      {!gravavel && (
        <p className="marca-alerta aviso-recorte">
          {falhaBanco
            ? `Só leitura: ${falhaBanco}. A tela mostra a sugestão e o pedido, sem os ajustes gravados, e não grava nada até o banco voltar.`
            : "O banco do painel não está configurado: a tela mostra a sugestão e o pedido, mas não grava nenhuma alteração."}
        </p>
      )}

      <p className="env-estado" aria-live="polite">
        {salvando > 0 ? (
          "Gravando…"
        ) : aviso ? (
          <span className={aviso.erro ? "erro-linha" : undefined}>
            {aviso.texto}
          </span>
        ) : null}
      </p>

      <div className="grade">
        <Secao
          titulo="Caixa mês a mês"
          sub={`Receita menos saídas. Itálico = valor padrão, ainda não digitado (receita do sistema ÷ 12; administrativo = ${fmtPct(caixa.alvos.administrativo)} da receita do mês). Apague um valor digitado para voltar ao padrão. Remessa inteira, sem o recorte.`}
          largura="cheia"
        >
          <table className="tabela tabela-caixa">
            <thead>
              <tr>
                <th>Em R$</th>
                <th className="n">Ano</th>
                {MESES.map((m) => (
                  <th key={m} className="n mes">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="linha-calculada">
                <th scope="row">Saldo inicial</th>
                <td className="n">{fmtReal(caixa.saldoInicial)}</td>
                <Celula
                  valor={dig.saldoInicial ?? 0}
                  texto={fmtReal(caixa.saldoInicial)}
                  rotulo="Saldo inicial do ano"
                  editavel={gravavel}
                  editando={editando?.linha === SALDO}
                  inicial={
                    editando?.linha === SALDO ? editando.inicial : undefined
                  }
                  classe={`mes${dig.saldoInicial === null ? " padrao" : ""}`}
                  dica="Dinheiro em caixa no começo de janeiro. Pode ser negativo."
                  aoAbrir={(inicial) =>
                    setEditando({ linha: SALDO, col: 0, inicial })
                  }
                  aoConfirmar={(b) => confirmarSaldo(b)}
                  aoCancelar={() => setEditando(null)}
                />
                {fx.inicial.slice(1).map((v, i) => (
                  <td key={i} className="n mes calculado">
                    {fmtReal(v)}
                  </td>
                ))}
              </tr>
              <tr className="linha-entrada">
                <th scope="row">
                  Receita prevista
                  <span className="celula-sub">
                    {caixa.receitaDigitada.some(Boolean)
                      ? `${plural(caixa.receitaDigitada.filter(Boolean).length, "mês digitado", "meses digitados")}`
                      : "do sistema, ÷ 12"}
                  </span>
                </th>
                <td className="n">
                  {receita === null ? "—" : fmtReal(receita)}
                </td>
                {caixa.receitaMeses.map((v, i) =>
                  celulaCaixa(RECEITA, i, v, caixa.receitaDigitada[i]!),
                )}
              </tr>
              <tr>
                <th scope="row">
                  (−) Custos administrativos
                  <span className="celula-sub">
                    {adminReserva === 12
                      ? `reserva de ${fmtPct(caixa.alvos.administrativo)}, não digitado`
                      : adminReserva > 0
                        ? `${plural(adminReserva, "mês ainda em reserva", "meses ainda em reserva")}`
                        : "digitado mês a mês"}
                  </span>
                </th>
                <td className="n">{fmtReal(caixa.admin)}</td>
                {caixa.adminMeses.map((v, i) =>
                  celulaCaixa(ADMIN, i, v, caixa.adminDigitado[i]!),
                )}
              </tr>
              <tr>
                <th scope="row">(−) Projetos</th>
                <td className="n">{fmtReal(somaMeses(projetosMeses))}</td>
                {projetosMeses.map((v, i) => (
                  <td key={i} className="n mes">
                    {fmtReal(v)}
                  </td>
                ))}
              </tr>
              {envelopesProjeto
                .filter((q) => q.proposta > 0 || q.chave === null)
                .map((q) => (
                  <tr key={q.rotulo} className="sub-linha">
                    <th scope="row">{q.rotulo}</th>
                    <td className="n">{fmtReal(q.proposta)}</td>
                    {q.propostaMeses.map((v, i) => (
                      <td key={i} className="n mes">
                        {fmtReal(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              <tr className="linha-saldo">
                <th scope="row">= Saldo do mês</th>
                <td className="n">{fmtReal(somaMeses(fx.saldoMes))}</td>
                {fx.saldoMes.map((v, i) => (
                  <td key={i} className={`n mes${v < -0.5 ? " falta" : ""}`}>
                    {fmtReal(v)}
                  </td>
                ))}
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">= Saldo acumulado</th>
                <td className="n">{fmtReal(fx.acumulado[11]!)}</td>
                {fx.acumulado.map((v, i) => (
                  <td key={i} className={`n mes${v < -0.5 ? " falta" : ""}`}>
                    {fmtReal(v)}
                    {v < -0.5 && <span className="celula-sub">falta</span>}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>

          {mesesNegativos.filter((i) => i < 11 && adiaveis(i).length > 0)
            .length > 0 &&
            gravavel && (
              <div className="acoes-caixa">
                {mesesNegativos
                  .filter((i) => i < 11 && adiaveis(i).length > 0)
                  .map((i) => {
                    const itens = adiaveis(i);
                    const soma = itens.reduce(
                      (s, l) => s + l.propostaMeses[i]!,
                      0,
                    );
                    return lote === i ? (
                      <p key={i} className="confirma-lote">
                        Grava o mês a mês de{" "}
                        {plural(itens.length, "projeto", "projetos")}: as
                        parcelas de {MESES[i]} ({fmtMoeda.format(soma)}) passam
                        para {MESES[i + 1]}.{" "}
                        <button
                          type="button"
                          className="botao-claro"
                          onClick={() => adiarLote(i)}
                        >
                          Confirmar
                        </button>{" "}
                        <button
                          type="button"
                          className="botao-desfazer"
                          onClick={() => setLote(null)}
                        >
                          Cancelar
                        </button>
                      </p>
                    ) : (
                      <p key={i}>
                        <b>{MESES[i]}</b> fecha {fmtSinal(fx.saldoMes[i]!)}.{" "}
                        <button
                          type="button"
                          className="botao-desfazer"
                          onClick={() => setLote(i)}
                        >
                          Adiar para {MESES[i + 1]} as parcelas de {MESES[i]}{" "}
                          dos{" "}
                          {plural(
                            itens.length,
                            "projeto sem nota",
                            "projetos sem nota",
                          )}{" "}
                          ({fmtMoeda.format(soma)})
                        </button>
                      </p>
                    );
                  })}
              </div>
            )}

          {receita !== null && (
            <p className="rodape">
              Conferência: receita {fmtMoeda.format(receita)}
              {caixa.receitaDigitada.some(Boolean)
                ? ` (o sistema estima ${fmtMoeda.format(caixa.receitaSistema ?? 0)})`
                : " (faturamento × doação × margem, do sistema)"}{" "}
              − administrativo {fmtMoeda.format(caixa.admin)} ={" "}
              <b>{fmtMoeda.format(paraProjetos!)} para projetos</b>.
              {doSistema.teto !== null &&
                ` O sistema registra teto de ${fmtMoeda.format(doSistema.teto)}${doSistema.admin !== null ? `, com ${fmtMoeda.format(doSistema.admin)} de administrativo` : ""}; diferença de ${fmtSinal(paraProjetos! - doSistema.teto)}.`}
            </p>
          )}
        </Secao>

        <Secao
          titulo="Envelopes no ano"
          sub="Limite = a diretriz aplicada à receita (o administrativo é uma das seis fatias, não sai antes). A diretriz é editável: clique no percentual; marcado = diferente do definido na reunião. Proposta = ajuste da mesa, decisão da pasta, aprovado no sistema ou, sem nada disso, o pedido. Clique no nome para filtrar a lista."
          largura="cheia"
        >
          <table className="tabela tabela-envelopes">
            <thead>
              <tr>
                <th>Envelope</th>
                <th className="n">Diretriz</th>
                <th className="n">Limite</th>
                <th className="n">Pedido</th>
                <th className="n">Proposta</th>
                <th className="n">Saldo</th>
                <th>Abaixo do limite ◂ ▸ Acima</th>
              </tr>
            </thead>
            <tbody>
              {quadro.linhas.map((q) => (
                <LinhaDoQuadro
                  key={q.rotulo}
                  q={q}
                  receita={receita}
                  escala={escala}
                  filtro={filtro}
                  aoFiltrar={(f) => setFiltro(f === filtro ? null : f)}
                  diretriz={
                    q.chave === null ? (
                      <td className="n">—</td>
                    ) : (
                      celulaAlvo(q.chave)
                    )
                  }
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  Total ({plural(quadro.total.projetos, "projeto", "projetos")}{" "}
                  + administrativo)
                  {caixa.alvosDigitados && gravavel && (
                    <span className="celula-sub">
                      <button
                        type="button"
                        className="botao-desfazer"
                        title="Apaga os percentuais da mesa e volta aos definidos na reunião"
                        onClick={() =>
                          void gravarDigitados("diretriz da reunião", {
                            alvos: null,
                          })
                        }
                      >
                        Voltar à diretriz da reunião
                      </button>
                    </span>
                  )}
                </td>
                <td
                  className={`n${foraDeCem ? " marca-alerta" : ""}`}
                  title={foraDeCem ? "A diretriz não soma 100%" : undefined}
                >
                  {fmtPct(somaDiretriz)}
                </td>
                <td className="n">
                  {receita === null ? "—" : fmtMoeda.format(receita)}
                </td>
                <td className="n">{fmtMoeda.format(quadro.total.pedido)}</td>
                <td className="n">{fmtMoeda.format(quadro.total.proposta)}</td>
                <td className="n">
                  {quadro.total.saldo === null
                    ? "—"
                    : fmtSinal(quadro.total.saldo)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          {foraDeCem && (
            <p className="marca-alerta aviso-recorte">
              A diretriz soma {fmtPct(somaDiretriz)}:{" "}
              {receita === null
                ? "ajuste os percentuais até 100%."
                : somaDiretriz < 1
                  ? `${fmtMoeda.format(receita * (1 - somaDiretriz))} da receita ficam fora de qualquer envelope.`
                  : `os limites somam ${fmtMoeda.format(receita * (somaDiretriz - 1))} além da receita.`}
            </p>
          )}
          <p className="rodape">
            Base: projetos avaliáveis da Remessa {ano} (rejeitado, rascunho e
            cancelado ficam fora). Saúde e &ldquo;outros&rdquo; entram em
            Missões; nenhum projeto vai para a oferta de misericórdia sem
            decisão da mesa. Decisão &ldquo;reprovado&rdquo;,
            &ldquo;adiado&rdquo; ou &ldquo;devolvido&rdquo; na pasta tira o
            projeto da proposta. Pedido sem meses informados foi dividido em 12.
          </p>
        </Secao>

        <Secao
          titulo={rotuloFiltro ? `Projetos: ${rotuloFiltro}` : "Projetos"}
          acoes={
            <button
              type="button"
              className="botao-claro"
              title="Planilha com caixa, envelopes e todos os projetos avaliáveis, com as contas vivas e as células editáveis marcadas"
              onClick={exportar}
            >
              Exportar .xlsx
            </button>
          }
          sub={`Classificação: aprovados (no sistema ou na pasta), votados sem decisão, sem voto e, no fim, os que a pasta reprovou, adiou ou devolveu. Dentro de cada grupo, a maior nota média dos diretores (0 a 5)${empateTopo > 1 ? `; os ${empateTopo} primeiros empatam` : ""}; sem nota, o maior pedido. Clique num cabeçalho para ordenar por ele. Setas andam; Enter ou um número abre a célula.`}
          largura="cheia"
        >
          <div
            className="chips-envelope"
            role="group"
            aria-label="Filtrar a lista por envelope"
          >
            {(
              [
                [null, "Todos"],
                ...ENVELOPES_DE_PROJETO.map((e) => [e.chave, e.rotulo]),
                ...(temSemEnvelope ? [["sem", "Sem envelope"]] : []),
              ] as [Filtro, string][]
            ).map(([f, r]) => (
              <button
                key={r}
                type="button"
                className="botao-modo"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
              >
                {r} <span className="chip-n">{fmtInt.format(contagem(f))}</span>
              </button>
            ))}
            {mesOrdenado !== null && (
              <label className="so-parcela">
                <input
                  type="checkbox"
                  checked={soComParcela}
                  onChange={(e) => setSoComParcela(e.target.checked)}
                />
                Só com parcela em {MESES[mesOrdenado]}
              </label>
            )}
            {!ordemPadrao && (
              <button
                type="button"
                className="botao-desfazer"
                onClick={() => {
                  setOrdem({ col: "classificacao", desc: false });
                  setSoComParcela(false);
                }}
              >
                Voltar à classificação
              </button>
            )}
          </div>

          {filtroAtivo && (
            <p className="sub env-recorte">
              A lista segue o recorte da barra de filtros (
              {fmtInt.format(noRecorte.length)} de{" "}
              {fmtInt.format(linhas.length)} avaliáveis); o caixa e os envelopes
              somam a remessa inteira.
            </p>
          )}

          {visiveis.length === 0 ? (
            <p className="vazio">
              {filtro !== null && contagem(null) > 0
                ? `Nenhum projeto em ${rotuloFiltro} neste recorte.`
                : SEM_RESULTADO}
            </p>
          ) : (
            <div className="env-rolagem">
              <table
                ref={tabela}
                className="tabela tabela-projetos-env"
                onKeyDown={navegar}
                onFocus={(e) => {
                  if (!ehNav(e.target)) return;
                  const [r, c] = e.target.dataset.nav!.split(":").map(Number);
                  if (r !== foco.r || c !== foco.c) setFoco({ r: r!, c: c! });
                }}
              >
                <thead>
                  <tr>
                    {cabecalho("classificacao", "Clas.", "col-clas")}
                    {cabecalho("projeto", "Projeto · envelope", "col-projeto")}
                    <th className="n">Nota</th>
                    {cabecalho("pedido", "Pedido", "n")}
                    {cabecalho("proposta", "Proposta", "n")}
                    {MESES.map((m, i) => cabecalho(i, m, "n mes"))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l, r) => (
                    <Fragment key={l.p.id}>
                      {ordemPadrao && l.grupo !== visiveis[r - 1]?.grupo && (
                        <tr className="linha-grupo">
                          <th colSpan={5 + MESES.length} scope="rowgroup">
                            <span>
                              {ROTULO_GRUPO[l.grupo]} ·{" "}
                              {fmtInt.format(
                                visiveis.filter((x) => x.grupo === l.grupo)
                                  .length,
                              )}
                            </span>
                          </th>
                        </tr>
                      )}
                      <LinhaDoProjeto
                        l={l}
                        r={r}
                        posicao={colocacao.get(l.p.id) ?? null}
                        gravavel={gravavel}
                        focoCol={focoValido.r === r ? focoValido.c : null}
                        editando={editando?.linha === l.p.id ? editando : null}
                        pendente={pendente?.linha === l.p.id ? pendente : null}
                        ultimoDestino={ultimoDestino}
                        setEditando={abrirCelula}
                        confirmar={confirmarProjeto}
                        escolher={escolher}
                        desistir={() => setPendente(null)}
                        gravar={gravar}
                      />
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="col-clas" />
                    <td className="col-projeto">
                      Soma da lista (
                      {plural(visiveis.length, "projeto", "projetos")}, sem
                      administrativo)
                    </td>
                    <td />
                    <td className="n">
                      {fmtMoeda.format(
                        visiveis.reduce((s, l) => s + l.p.solicitado, 0),
                      )}
                    </td>
                    <td className="n">
                      {fmtMoeda.format(
                        visiveis.reduce(
                          (s, l) => s + somaMeses(l.propostaMeses),
                          0,
                        ),
                      )}
                    </td>
                    {MESES.map((m, i) => (
                      <td key={m} className="n mes">
                        {fmtReal(
                          visiveis.reduce((s, l) => s + l.propostaMeses[i]!, 0),
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="rodape">
            <span className="mudou-legenda">Valor marcado</span> = ajustado na
            mesa; o pedido original aparece ao passar o mouse. Baixar um mês
            pergunta para onde vai a diferença: mês seguinte, outros meses ou
            corte. O envelope e o mês a mês ficam no banco do painel, com
            histórico; seguem para o banco de projetos depois da consolidação
            com a diretoria.
          </p>
        </Secao>
      </div>
    </>
  );
}

function LinhaDoQuadro({
  q,
  receita,
  escala,
  filtro,
  aoFiltrar,
  diretriz,
}: {
  q: LinhaQuadro;
  receita: number | null;
  escala: number;
  filtro: Filtro;
  aoFiltrar: (f: Filtro) => void;
  /** A célula do percentual (editável), montada por quem tem o estado. */
  diretriz: React.ReactNode;
}) {
  const ehAdmin = q.chave === "administrativo";
  const chaveFiltro: Filtro = q.chave ?? "sem";
  const pp =
    q.limite === null || !receita ? 0 : (q.proposta - q.limite) / receita;

  return (
    <tr className={ehAdmin ? "linha-admin" : undefined}>
      <td>
        {ehAdmin ? (
          <b>{q.rotulo}</b>
        ) : (
          <button
            type="button"
            className="link-envelope"
            aria-pressed={filtro === chaveFiltro}
            title="Mostrar só os projetos deste envelope na lista abaixo"
            onClick={() => aoFiltrar(chaveFiltro)}
          >
            {q.rotulo}
          </button>
        )}
        <span className="celula-sub">
          {ehAdmin
            ? "Lançado no caixa, acima."
            : `${plural(q.projetos, "projeto", "projetos")}${q.envelope ? `. ${q.envelope.criterio}` : ""}`}
        </span>
      </td>
      {diretriz}
      <td className="n">
        {q.limite === null ? "—" : fmtMoeda.format(q.limite)}
      </td>
      <td className="n">{ehAdmin ? "—" : fmtMoeda.format(q.pedido)}</td>
      <td className="n">
        <b>{fmtMoeda.format(q.proposta)}</b>
      </td>
      <td className="n">
        {q.saldo === null ? (
          "—"
        ) : Math.abs(q.saldo) < 0.5 ? (
          "no limite"
        ) : (
          <>
            {fmtSinal(q.saldo)}
            <span className={`celula-sub${q.saldo < 0 ? " marca-alerta" : ""}`}>
              {q.saldo < 0 ? "acima do limite" : "de folga"}
            </span>
          </>
        )}
      </td>
      <td>
        <Regua pp={pp} escala={escala} />
      </td>
    </tr>
  );
}

function LinhaDoProjeto({
  l,
  r,
  posicao,
  gravavel,
  focoCol,
  editando,
  pendente,
  ultimoDestino,
  setEditando,
  confirmar,
  escolher,
  desistir,
  gravar,
}: {
  l: Linha;
  r: number;
  /** Colocação na classificação (aprovados e votados); null para os demais. */
  posicao: { pos: number; empatado: boolean } | null;
  gravavel: boolean;
  /** Coluna que recebe o Tab, se a parada da grade estiver nesta linha. */
  focoCol: number | null;
  editando: Alvo | null;
  pendente: (Alvo & { novo: number }) | null;
  ultimoDestino: DestinoParcela;
  setEditando: (a: Alvo | null) => void;
  confirmar: (l: Linha, col: number, bruto: string, mover: Mover) => void;
  escolher: (d: DestinoParcela) => void;
  desistir: () => void;
  gravar: (
    l: Linha,
    campos: { envelope?: ChaveEnvelope | null; meses?: number[] | null },
  ) => Promise<void>;
}) {
  const { p, atrib, sugestao } = l;
  const zerada = l.fonte === "zerado";
  const editavel = gravavel && !zerada;
  const aqui = (col: number) => editando?.col === col;
  const total = somaMeses(l.propostaMeses);
  const emDoze = l.propostaMeses.every((v) => v > 0);

  // Origem só quando diz algo: "pela categoria" em 250 linhas era ruído.
  const origem =
    atrib.origem === "mesa"
      ? `Definido pela mesa${sugestao.chave && sugestao.chave !== atrib.chave ? `; sugestão: ${ENVELOPE[sugestao.chave].rotulo}` : ""}`
      : atrib.origem === "avaliacao"
        ? atrib.motivo
        : atrib.origem === "sem"
          ? "Categoria sem envelope"
          : null;

  const abrir = (col: number) => (inicial?: string) =>
    setEditando({ linha: p.id, col, inicial });

  return (
    <tr className={zerada ? "linha-zerada" : undefined}>
      <td className="col-clas">
        {posicao ? (
          <span
            className="posicao"
            title={
              posicao.empatado ? "Empatado com os vizinhos na nota" : undefined
            }
          >
            {posicao.pos}º{posicao.empatado ? "=" : ""}
          </span>
        ) : (
          <span className="sub">—</span>
        )}
      </td>
      <th scope="row" className="col-projeto">
        <Link
          className="link-projeto titulo-curto"
          href={`/projetos/${p.id}`}
          title={p.titulo}
        >
          {p.titulo}
        </Link>
        {/* O envelope mora embaixo do nome, no começo da linha da instituição
            (Fase 15c): a coluna própria tomava ~200 px que os meses precisam.
            Rótulo curto no seletor; o nome inteiro está no quadro anual. */}
        <span className="celula-sub linha-envelope">
          <select
            className="env-compacto"
            value={atrib.chave ?? ""}
            disabled={!gravavel}
            data-nav={`${r}:${COL_ENVELOPE}`}
            tabIndex={focoCol === COL_ENVELOPE ? 0 : -1}
            aria-label={`Envelope de ${p.titulo}`}
            title={`Categoria escolhida pelo proponente: ${rotuloCategoria(p.categoria)}`}
            onChange={(e) => {
              const v = e.target.value as ChaveEnvelope;
              void gravar(l, { envelope: v === sugestao.chave ? null : v });
            }}
          >
            {atrib.chave === null && <option value="">Sem envelope</option>}
            {ENVELOPES_DE_PROJETO.map((e) => (
              <option key={e.chave} value={e.chave}>
                {e.curto}
              </option>
            ))}
          </select>
          {/* No papel o select vira texto. */}
          <b className="rotulo-impresso">
            {atrib.chave ? ENVELOPE[atrib.chave].curto : "Sem envelope"} ·{" "}
          </b>
          {atrib.origem === "mesa" && <b className="origem-mesa">mesa · </b>}
          {p.instituicaoNome ?? "Sem instituição"} · {rotuloStatus(p.status)}
          {zerada &&
            ` · ${SITUACOES[l.situacao as Situacao] ?? "Sem aprovação"} na pasta: fora da proposta`}
          {!l.mesesInformados && " · meses não informados"}
        </span>
        {origem && atrib.origem !== "mesa" && (
          <span className="celula-sub origem" title={origem}>
            {origem}
          </span>
        )}
      </th>
      <td className="n">
        {p.avaliacoes > 0 ? (
          <>
            <b>{num(p.notaMedia, 1)}</b>
            <span className="celula-sub">
              med. {num(p.notaMediana, 1)} · {fmtInt.format(p.avaliacoes)}
            </span>
          </>
        ) : (
          <span className="sub">—</span>
        )}
      </td>
      <td className="n">{fmtMoeda.format(p.solicitado)}</td>
      <Celula
        valor={total}
        texto={fmtMoeda.format(total)}
        rotulo={`${p.titulo}, total (espalha nos meses com parcela)`}
        editavel={editavel}
        editando={aqui(COL_TOTAL)}
        inicial={aqui(COL_TOTAL) ? editando?.inicial : undefined}
        nav={`${r}:${COL_TOTAL}`}
        tabbable={focoCol === COL_TOTAL}
        classe="col-proposta"
        dica={`${ROTULO_FONTE[l.fonte]}. Digitar um total espalha igualmente nos meses que já têm parcela.`}
        aoAbrir={abrir(COL_TOTAL)}
        aoConfirmar={(b, m) => confirmar(l, COL_TOTAL, b, m)}
        aoCancelar={() => setEditando(null)}
      >
        <span className="celula-sub">
          {l.fonte !== "pedido" && <span>{FONTE_CURTA[l.fonte]}</span>}
          {editavel && !emDoze && total > 0 && (
            <button
              type="button"
              className="botao-desfazer"
              tabIndex={-1}
              title="Espalha o total igualmente de janeiro a dezembro"
              onClick={() => void gravar(l, { meses: distribuir(total, []) })}
            >
              12 meses
            </button>
          )}
          {l.fonte === "ajuste" && gravavel && (
            <button
              type="button"
              className="botao-desfazer"
              tabIndex={-1}
              title="Apaga o ajuste da mesa e volta ao pedido (ou à decisão da pasta)"
              onClick={() => void gravar(l, { meses: null })}
            >
              desfazer
            </button>
          )}
        </span>
      </Celula>
      {l.propostaMeses.map((v, i) => {
        const mudou =
          l.fonte === "ajuste" && Math.abs(v - l.pedidoMeses[i]!) >= 0.005;
        const escolhendo = pendente?.col === i;
        return (
          <Celula
            key={i}
            valor={v}
            texto={fmtReal(escolhendo ? pendente!.novo : v)}
            rotulo={`${p.titulo}, ${MESES[i]}`}
            editavel={editavel}
            editando={aqui(i)}
            inicial={aqui(i) ? editando?.inicial : undefined}
            nav={`${r}:${i}`}
            tabbable={focoCol === i}
            classe={`mes${mudou ? " mudou" : ""}${escolhendo ? " com-escolha" : ""}`}
            dica={
              mudou
                ? `Pedido: ${fmtMoeda.format(l.pedidoMeses[i]!)}`
                : fmtMoeda.format(v)
            }
            aoAbrir={abrir(i)}
            aoConfirmar={(b, m) => confirmar(l, i, b, m)}
            aoCancelar={() => setEditando(null)}
          >
            {escolhendo && (
              <Escolha
                diferenca={v - pendente!.novo}
                mes={MESES[i]!}
                ultimo={ultimoDestino}
                podeAdiar={i < 11}
                aoEscolher={escolher}
                aoDesistir={desistir}
              />
            )}
          </Celula>
        );
      })}
    </tr>
  );
}
