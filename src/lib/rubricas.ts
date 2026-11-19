import { agrupar, ehRenovacao } from "./agregar";
import {
  ENVELOPES,
  PADRAO_CATEGORIA,
  type ChaveEnvelope,
  type Envelope,
} from "./envelopes";
import type { ProjetoCiclo } from "./types";

/**
 * A DIRETRIZ ORÇAMENTÁRIA aplicada ao pedido (Resumo Executivo).
 *
 * Desde a Fase 15 a divisão é a dos ENVELOPES (`envelopes.ts`), e o envelope de
 * cada projeto vem de quem chama (`chaveDe`): mesa › avaliação › categoria. O
 * padrão, sem chamador, é só a categoria — serve à remessa anterior e aos testes.
 *
 * Regras puras, como `agregar.ts` e pela mesma razão: o cliente reagrega isto
 * quando o recorte muda.
 */

/** Projeto cujo envelope não se resolve (categoria nova na origem). */
export const FORA_DA_DIRETRIZ = "__fora";

const porCategoria = (p: ProjetoCiclo): ChaveEnvelope | null =>
  PADRAO_CATEGORIA[p.categoria] ?? null;

export interface LinhaDiretriz {
  chave: string;
  rotulo: string;
  alvo: number;
  criterio: string;
  /** Linha sem projetos (custos administrativos): o pedido é o valor digitado. */
  semProjetos: boolean;
  /**
   * Custos administrativos ainda não digitados: a linha reserva o próprio
   * envelope, senão o veredito diria que o teto "cobre tudo" esquecendo o custo
   * que vai existir. A tela escreve "reserva, não preenchido".
   */
  estimado: boolean;
  projetos: number;
  renovacoes: number;
  novos: number;
  pedido: number;
  pedidoRenovacoes: number;
  pedidoNovos: number;
  /** pedido do envelope / pedido total. */
  fracao: number;
  /** teto × alvo — o que a diretriz reserva em reais (null sem teto confiável). */
  envelope: number | null;
  /** pedido − envelope: positivo é pedir acima do que a diretriz reservou. */
  desvio: number | null;
  /**
   * O MESMO desvio, em pontos (0,044 = 4,4 p.p. acima): `desvio / teto` com teto,
   * `fracao − alvo` sem ele. Com teto o sinal é sempre o do desvio em reais.
   */
  desvioPp: number;
}

export interface Diretriz {
  teto: number | null;
  linhas: LinhaDiretriz[];
  projetos: number;
  pedido: number;
  /** A CORTAR: quanto o pedido passa do teto (0 quando cabe). */
  cortar: number | null;
  /**
   * A REMANEJAR: quanto dos envelopes acima do limite pode ir para a folga dos
   * que ficaram abaixo. Excesso total = remanejar + cortar.
   */
  remanejar: number | null;
  /** O envelope que mais passou do limite, e o que mais ficou abaixo. */
  acima: LinhaDiretriz | null;
  abaixo: LinhaDiretriz | null;
}

/** Desvio abaixo disto (0,1 p.p.) é empate, não notícia. */
const EMPATE = 0.001;

/**
 * Compara o pedido com a divisão da diretriz.
 *
 * A base é do chamador: a página passa só os projetos **avaliáveis** (rejeitado,
 * rascunho e cancelado não disputam o teto). `administrativo` é o total digitado
 * na linha de custos administrativos, que conta como pedido daquele envelope;
 * `null` (ainda não digitado) reserva o envelope inteiro — ver `estimado`.
 */
export function montarDiretriz(
  projetos: ProjetoCiclo[],
  teto: number | null,
  chaveDe: (p: ProjetoCiclo) => ChaveEnvelope | null = porCategoria,
  administrativo: number | null = null,
): Diretriz {
  const grupos = agrupar(projetos, (p) => chaveDe(p) ?? FORA_DA_DIRETRIZ);
  const estimado = !administrativo;
  const admin = estimado
    ? (teto ?? 0) * (ENVELOPES.find((e) => e.semProjetos)?.alvo ?? 0)
    : administrativo;
  const pedido = projetos.reduce((s, p) => s + p.solicitado, 0) + admin;

  const fora = grupos.get(FORA_DA_DIRETRIZ) ?? [];
  const definicoes: Envelope[] = [
    ...ENVELOPES,
    ...(fora.length > 0
      ? [
          {
            chave: FORA_DA_DIRETRIZ as ChaveEnvelope,
            rotulo: "Sem envelope",
            curto: "Sem envelope",
            alvo: 0,
            criterio:
              "Categoria da origem sem envelope; a divisão não reserva nada para ela.",
          },
        ]
      : []),
  ];

  const soma = (ps: ProjetoCiclo[]) => ps.reduce((s, p) => s + p.solicitado, 0);

  const linhas: LinhaDiretriz[] = definicoes.map((r) => {
    const lista = grupos.get(r.chave) ?? [];
    const renovacoes = lista.filter(ehRenovacao);
    const novos = lista.filter((p) => !ehRenovacao(p));
    const pedidoLinha = r.semProjetos ? admin : soma(lista);
    const fracao = pedido ? pedidoLinha / pedido : 0;
    const envelope = teto === null ? null : teto * r.alvo;

    return {
      chave: r.chave,
      rotulo: r.rotulo,
      alvo: r.alvo,
      criterio: r.criterio,
      semProjetos: !!r.semProjetos,
      estimado: !!r.semProjetos && estimado,
      projetos: lista.length,
      renovacoes: renovacoes.length,
      novos: novos.length,
      pedido: pedidoLinha,
      pedidoRenovacoes: soma(renovacoes),
      pedidoNovos: soma(novos),
      fracao,
      envelope,
      desvio: envelope === null ? null : pedidoLinha - envelope,
      // Sem pedido nenhum, todo envelope ficaria "abaixo" por construção, e isso
      // não é um desvio, é um recorte vazio.
      desvioPp: !pedido
        ? 0
        : teto
          ? (pedidoLinha - teto * r.alvo) / teto
          : fracao - r.alvo,
    };
  });

  // A reserva do administrativo não é folga nem excesso: é custo que vai existir.
  const comparaveis = linhas.filter((l) => !l.estimado);
  const excesso = comparaveis.reduce(
    (s, l) => s + Math.max(0, l.desvio ?? 0),
    0,
  );
  const folga = comparaveis.reduce(
    (s, l) => s + Math.max(0, -(l.desvio ?? 0)),
    0,
  );

  const porDesvio = [...comparaveis].sort((a, b) => b.desvioPp - a.desvioPp);
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
