import { SEM_RESPONSAVEL, type Filtros } from "@/lib/agregar";
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

/** "__sem" é o valor do filtro, não um nome de gente. */
export const rotuloResponsavel = (r: string) =>
  r === SEM_RESPONSAVEL ? "Sem responsável" : r;

/**
 * O recorte em uma linha. Sai no rodapé da impressão (shell.tsx) e no
 * cabeçalho das exportações de projetos — o mesmo texto nos dois, senão a ata
 * e o PDF do diretor divergem sobre quais números estão na mesa.
 */
export function resumoFiltros(
  filtros: Filtros,
  nomePais: string | null,
): string {
  return (
    [
      filtros.continente.length > 0 &&
        `Continente: ${filtros.continente.join(", ")}`,
      filtros.status.length > 0 &&
        `Status: ${filtros.status.map((s) => ROTULO_STATUS[s as StatusGrupo]).join(", ")}`,
      filtros.categoria.length > 0 &&
        `Categoria: ${filtros.categoria.join(", ")}`,
      filtros.conveniada.length > 0 &&
        `Instituição: ${filtros.conveniada.map((c) => (c === "true" ? "conveniadas" : "não conveniadas")).join(", ")}`,
      filtros.tipo.length > 0 && `Triagem: ${filtros.tipo.join(", ")}`,
      filtros.responsavel.length > 0 &&
        `Responsável: ${filtros.responsavel.map(rotuloResponsavel).join(", ")}`,
      nomePais && `País: ${nomePais}`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem filtros — ciclo inteiro"
  );
}

/** Ordem do funil: da entrada à decisão. */
export const ORDEM_STATUS: StatusGrupo[] = [
  "neutro",
  "em-avaliacao",
  "classificado",
  "aprovado",
  "encerrado",
  "rejeitado",
];
