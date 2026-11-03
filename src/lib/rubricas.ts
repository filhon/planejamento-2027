import { agrupar, ehRenovacao } from "./agregar";
import type { ProjetoCiclo } from "./types";

/**
 * A DIRETRIZ ORÇAMENTÁRIA do presidente da associação (Fase 12).
 *
 * O teto da remessa se divide em quatro rubricas, e a pergunta que abre a
 * reunião é uma só: **o que foi submetido cabe nessa divisão, e onde não cabe?**
 *
 * Duas coisas diferentes vivem aqui, e a tela diz qual é qual:
 *  - os **percentuais** são a diretriz, recebida pronta (25 · 50 · 20 · 5);
 *  - o **de-para rubrica → categoria** é leitura nossa das sete categorias de
 *    `cycle_projects.category`, porque a origem não conhece o conceito de
 *    rubrica. Mudar a divisão (ou o de-para) é editar esta tabela; a página
 *    mostra quais categorias compõem cada rubrica para a mesa poder contestar o
 *    de-para em voz alta, que é o único lugar onde isso se decide.
 *
 * Regras puras, como `agregar.ts` e pela mesma razão: o cliente reagrega isto
 * quando o recorte muda.
 */

export interface Rubrica {
  chave: string;
  rotulo: string;
  /** Fração do teto que a diretriz destina à rubrica (as quatro somam 1). */
  alvo: number;
  /** Slugs de `cycle_projects.category` que compõem a rubrica. */
  categorias: string[];
  /** Ressalva do de-para, quando o rótulo promete mais do que a origem entrega. */
  nota?: string;
}

/** Na ordem da diretriz — da maior fatia para a menor. */
export const RUBRICAS: Rubrica[] = [
  {
    chave: "missoes",
    rotulo: "Missões",
    alvo: 0.5,
    categorias: ["missoes-transculturais", "missoes-nacionais"],
  },
  {
    chave: "construcao-igrejas",
    rotulo: "Construção de igrejas",
    alvo: 0.25,
    categorias: ["construcao-reforma"],
    nota: "A origem tem uma categoria só para construção E reforma; reforma de prédio que não é templo cai aqui.",
  },
  {
    chave: "outros",
    rotulo: "Outros",
    alvo: 0.2,
    categorias: ["educacao", "saude", "outros"],
  },
  {
    chave: "social",
    rotulo: "Social",
    alvo: 0.05,
    categorias: ["projetos-sociais-cristaos"],
  },
];

/**
 * Categoria que a diretriz não nomeia. Não existe hoje (as sete categorias da
 * origem estão todas mapeadas) e é justamente por isso que precisa de linha
 * própria: categoria nova na origem tem de aparecer somando fora da divisão, e
 * não desaparecer da conta.
 */
export const FORA_DA_DIRETRIZ = "__fora";

export const rubricaDe = (categoria: string): Rubrica | null =>
  RUBRICAS.find((r) => r.categorias.includes(categoria)) ?? null;

export const rotuloRubrica = (categoria: string): string =>
  rubricaDe(categoria)?.rotulo ?? "Fora das rubricas";

export interface LinhaDiretriz extends Rubrica {
  projetos: number;
  renovacoes: number;
  novos: number;
  pedido: number;
  pedidoRenovacoes: number;
  pedidoNovos: number;
  /** pedido da rubrica / pedido total do recorte. */
  fracao: number;
  /** teto × alvo — o que a diretriz reserva em reais (null sem teto confiável). */
  envelope: number | null;
  /** pedido − envelope: positivo é pedir acima do que a diretriz reservou. */
  desvio: number | null;
  /**
   * O MESMO desvio, em pontos (0,044 = 4,4 p.p. acima): `desvio / teto` com teto,
   * `fracao − alvo` sem ele. Com teto o sinal é sempre o do desvio em reais — duas
   * contas diferentes na mesma linha (pedido ÷ teto contra pedido ÷ pedido)
   * faziam a coluna dizer "acima" e a régua "abaixo" para a mesma rubrica.
   */
  desvioPp: number;
}

export interface Diretriz {
  teto: number | null;
  linhas: LinhaDiretriz[];
  projetos: number;
  pedido: number;
  /**
   * A CORTAR: quanto o pedido passa do teto (0 quando cabe). É dinheiro que
   * não existe, não se move para lugar nenhum.
   */
  cortar: number | null;
  /**
   * A REMANEJAR: quanto das rubricas acima do envelope pode ir para a folga das
   * que ficaram abaixo. Excesso total = remanejar + cortar (a folga absorve o
   * que cabe; o resto é corte). Antes o KPI somava os dois e chamava de
   * "remanejar".
   */
  remanejar: number | null;
  /** A rubrica que mais passou do envelope, e a que mais ficou abaixo. */
  acima: LinhaDiretriz | null;
  abaixo: LinhaDiretriz | null;
}

/** Desvio abaixo disto (0,1 p.p.) é empate, não notícia. */
const EMPATE = 0.001;

/**
 * Compara o pedido do recorte com a divisão da diretriz.
 *
 * Quem escolhe a base é o chamador: a página passa só os projetos **avaliáveis**
 * (rejeitado, rascunho e cancelado não disputam o teto — incluí-los inflava o
 * pedido de 2026 em R$ 7 mi e mentia sobre toda a aderência).
 */
export function montarDiretriz(
  projetos: ProjetoCiclo[],
  teto: number | null,
): Diretriz {
  const chaveDaCategoria = new Map(
    RUBRICAS.flatMap((r) => r.categorias.map((c) => [c, r.chave] as const)),
  );
  const grupos = agrupar(
    projetos,
    (p) => chaveDaCategoria.get(p.categoria) ?? FORA_DA_DIRETRIZ,
  );
  const pedido = projetos.reduce((s, p) => s + p.solicitado, 0);

  const fora = grupos.get(FORA_DA_DIRETRIZ) ?? [];
  const definicoes: Rubrica[] = [
    ...RUBRICAS,
    ...(fora.length > 0
      ? [
          {
            chave: FORA_DA_DIRETRIZ,
            rotulo: "Fora das rubricas",
            alvo: 0,
            categorias: [...new Set(fora.map((p) => p.categoria))].sort(),
            nota: "Categoria da origem que a diretriz não nomeia; a divisão não reserva nada para ela.",
          },
        ]
      : []),
  ];

  const soma = (ps: ProjetoCiclo[]) => ps.reduce((s, p) => s + p.solicitado, 0);

  const linhas: LinhaDiretriz[] = definicoes.map((r) => {
    const lista = grupos.get(r.chave) ?? [];
    const renovacoes = lista.filter(ehRenovacao);
    const novos = lista.filter((p) => !ehRenovacao(p));
    const pedidoRubrica = soma(lista);
    const fracao = pedido ? pedidoRubrica / pedido : 0;
    const envelope = teto === null ? null : teto * r.alvo;

    return {
      ...r,
      projetos: lista.length,
      renovacoes: renovacoes.length,
      novos: novos.length,
      pedido: pedidoRubrica,
      pedidoRenovacoes: soma(renovacoes),
      pedidoNovos: soma(novos),
      fracao,
      envelope,
      desvio: envelope === null ? null : pedidoRubrica - envelope,
      // Sem pedido nenhum no recorte, toda rubrica ficaria "abaixo" da diretriz
      // por construção, e isso não é um desvio, é um recorte vazio.
      desvioPp: !pedido
        ? 0
        : teto
          ? (pedidoRubrica - teto * r.alvo) / teto
          : fracao - r.alvo,
    };
  });

  const excesso = linhas.reduce((s, l) => s + Math.max(0, l.desvio ?? 0), 0);
  const folga = linhas.reduce((s, l) => s + Math.max(0, -(l.desvio ?? 0)), 0);

  const porDesvio = [...linhas].sort((a, b) => b.desvioPp - a.desvioPp);
  const maior = porDesvio[0];
  const menor = porDesvio[porDesvio.length - 1];

  return {
    teto,
    linhas,
    projetos: projetos.length,
    pedido,
    cortar: teto === null ? null : Math.max(0, pedido - teto),
    remanejar: teto === null ? null : Math.min(excesso, folga),
    acima: maior && maior.desvioPp > EMPATE ? maior : null,
    abaixo: menor && menor.desvioPp < -EMPATE ? menor : null,
  };
}
