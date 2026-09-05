import type { StatusGrupo } from "@/lib/types";

/** Formatação e vocabulário visual compartilhados pelas páginas do painel. */

export const fmtInt = new Intl.NumberFormat("pt-BR");
export const fmtMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
export const fmtMoedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const pct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const num = (v: number | null, casas = 1) =>
  v === null
    ? "—"
    : v.toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      });

export const ROTULO_STATUS: Record<StatusGrupo, string> = {
  aprovado: "Aprovado",
  "em-avaliacao": "Em avaliação",
  classificado: "Classificado",
  rejeitado: "Rejeitado",
  encerrado: "Encerrado",
  neutro: "Rascunho / outros",
};

/** Paleta semântica de status (docs/plano-dashboard.md §7). */
export const COR_STATUS: Record<StatusGrupo, string> = {
  aprovado: "var(--verde)",
  "em-avaliacao": "var(--laranja)",
  classificado: "var(--azul-claro)",
  rejeitado: "var(--vermelho)",
  encerrado: "var(--azul)",
  neutro: "var(--neutro-forte)",
};

/** Ordem do funil: da entrada à decisão. */
export const ORDEM_STATUS: StatusGrupo[] = [
  "neutro",
  "em-avaliacao",
  "classificado",
  "aprovado",
  "encerrado",
  "rejeitado",
];
