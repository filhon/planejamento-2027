/**
 * Decisão de contingência sobre um projeto (valor aprovado + situação), gravada
 * SÓ no banco do painel (Firestore, coleção `decisoes`) — nunca na origem. Serve
 * para a mesa registrar o que decidiu quando o sistema de submissão não dá
 * conta no dia. Módulo puro: o formulário (cliente) e a Server Action usam o
 * mesmo vocabulário e o mesmo parser.
 */

export const SITUACOES = {
  aprovado: "Aprovado",
  "aprovado-ressalvas": "Aprovado com ressalvas",
  reprovado: "Reprovado",
  adiado: "Adiado",
  "devolvido-ajuste": "Devolvido para ajuste",
} as const;

export type Situacao = keyof typeof SITUACOES;

export interface Decisao {
  situacao: Situacao;
  /** Só faz sentido nas situações de aprovação; nas outras é null. */
  valorAprovado: number | null;
  observacao: string;
  atualizadoEm: Date;
  atualizadoPor: string;
}

const APROVA: Situacao[] = ["aprovado", "aprovado-ressalvas"];

/** "R$ 1.234,56", "1234,56", "1234.56" e "1.234" → número; lixo → NaN. */
export function lerValor(bruto: string): number {
  let t = bruto.replace(/R\$|\s/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Valida o formulário. `situacao` vazia = apagar a decisão. Devolve o erro em
 * frase, como o resto do painel.
 */
export function validarDecisao(entrada: {
  situacao: string;
  valor: string;
  observacao: string;
}):
  | { erro: string }
  | { apagar: true }
  | { situacao: Situacao; valorAprovado: number | null; observacao: string } {
  const situacao = entrada.situacao.trim();
  if (!situacao) return { apagar: true };
  if (!(situacao in SITUACOES)) return { erro: "Situação desconhecida." };
  const s = situacao as Situacao;
  const observacao = entrada.observacao.trim().slice(0, 500);

  if (!APROVA.includes(s))
    return { situacao: s, valorAprovado: null, observacao };

  const valor = lerValor(entrada.valor);
  if (!Number.isFinite(valor) || valor <= 0)
    return { erro: "Informe o valor aprovado (ex.: 45.000,00)." };
  if (valor > 1e9) return { erro: "Valor fora da faixa." };
  return {
    situacao: s,
    valorAprovado: Math.round(valor * 100) / 100,
    observacao,
  };
}
