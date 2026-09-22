import { agrupar, ehRenovacao } from "./agregar";
import type { ProjetoCiclo } from "./types";

/**
 * A DIRETRIZ ORÇAMENTÁRIA do presidente da associação (Fase 12).
 *
 * O teto da remessa se divide em quatro rúbricas, e a pergunta que abre a
 * reunião é uma só: **o que foi submetido cabe nessa divisão, e onde não cabe?**
 *
 * Duas coisas diferentes vivem aqui, e a tela diz qual é qual:
 *  - os **percentuais** são a diretriz, recebida pronta (25 · 50 · 20 · 5);
 *  - o **de-para rúbrica → categoria** é leitura nossa das sete categorias de
 *    `cycle_projects.category`, porque a origem não conhece o conceito de
 *    rúbrica. Mudar a divisão (ou o de-para) é editar esta tabela; a página
 *    mostra quais categorias compõem cada rúbrica para a mesa poder contestar o
 *    de-para em voz alta, que é o único lugar onde isso se decide.
 *
 * Regras puras, como `agregar.ts` e pela mesma razão: o cliente reagrega isto
 * quando o recorte muda.
 */

export interface Rubrica {
  chave: string;
  rotulo: string;
  /** Fração do teto que a diretriz destina à rúbrica (as quatro somam 1). */
  alvo: number;
  /** Slugs de `cycle_projects.category` que compõem a rúbrica. */
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
  rubricaDe(categoria)?.rotulo ?? "Fora das rúbricas";

export interface LinhaDiretriz extends Rubrica {
  projetos: number;
  renovacoes: number;
  novos: number;
  pedido: number;
  pedidoRenovacoes: number;
  pedidoNovos: number;
  /** pedido da rúbrica / pedido total do recorte. */
  fracao: number;
  /** teto × alvo — o que a diretriz reserva em reais (null sem teto confiável). */
  envelope: number | null;
  /** pedido − envelope: positivo é pedir acima do que a diretriz reservou. */
  desvio: number | null;
  /** fracao − alvo, em pontos (0,044 = 4,4 p.p. acima). Independe do teto. */
  desvioPp: number;
}

export interface Diretriz {
  teto: number | null;
  linhas: LinhaDiretriz[];
  projetos: number;
  pedido: number;
  /**
   * Soma dos excessos — quanto teria de sair das rúbricas que passaram do
   * envelope para o pedido caber na divisão da diretriz. É o número que a mesa
   * precisa fechar; o vão total contra o teto é outra conta (e está nos KPIs).
   */
  remanejar: number | null;
  /** A rúbrica que mais passou do envelope, e a que mais ficou abaixo. */
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
            rotulo: "Fora das rúbricas",
            alvo: 0,
            categorias: [...new Set(fora.map((p) => p.categoria))].sort(),
            nota: "Categoria da origem que a diretriz não nomeia — a divisão não reserva nada para ela.",
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
      // Sem pedido nenhum no recorte, toda rúbrica ficaria "abaixo" da diretriz
      // por construção — e isso não é um desvio, é um recorte vazio.
      desvioPp: pedido ? fracao - r.alvo : 0,
    };
  });

  const porDesvio = [...linhas].sort((a, b) => b.desvioPp - a.desvioPp);
  const maior = porDesvio[0];
  const menor = porDesvio[porDesvio.length - 1];

  return {
    teto,
    linhas,
    projetos: projetos.length,
    pedido,
    remanejar:
      teto === null
        ? null
        : linhas.reduce((s, l) => s + Math.max(0, l.desvio ?? 0), 0),
    acima: maior && maior.desvioPp > EMPATE ? maior : null,
    abaixo: menor && menor.desvioPp < -EMPATE ? menor : null,
  };
}
