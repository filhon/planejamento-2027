import { SEM_RESPONSAVEL, type Filtros } from "@/lib/agregar";
import { NOME_UF } from "@/lib/uf";
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

/** Tamanho de anexo — kB abaixo de 1 MB, que é a escala dos orçamentos. */
export function tamanhoArquivo(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

/**
 * "1 projeto" / "2 projetos". O painel é lido em voz alta na reunião e sai
 * impresso como documento de conselho — "projeto(s)" é forma de log, não de
 * ata. Um lugar só, porque o mesmo texto aparecia em seis telas.
 */
export const plural = (n: number, um: string, varios: string) =>
  `${fmtInt.format(n)} ${n === 1 ? um : varios}`;

/**
 * "pede 34,5% a mais" — a conta que a renovação obrigava a fazer de cabeça na
 * reunião, com o pedido numa linha e o recebido na outra. Sem base (o projeto
 * não recebeu nada no ciclo anterior) não há percentual: devolve "".
 */
export function variacaoPedido(
  solicitado: number,
  recebido: number | null,
): string {
  if (!recebido || recebido <= 0) return "";
  const d = solicitado / recebido - 1;
  if (Math.abs(d) < 0.005) return "pede o mesmo valor";
  return `pede ${pct(Math.abs(d))} ${d > 0 ? "a mais" : "a menos"}`;
}

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
 * A origem guarda a categoria em slug (`missoes-nacionais`). O slug segue sendo
 * o valor do filtro e da URL — só o rótulo muda, porque acento não se deriva do
 * slug. Categoria nova cai no fallback (hífen vira espaço, primeira maiúscula)
 * e aparece legível mesmo antes de entrar na lista.
 */
const ROTULO_CATEGORIA: Record<string, string> = {
  "missoes-transculturais": "Missões Transculturais",
  "missoes-nacionais": "Missões Nacionais",
  "construcao-reforma": "Construção / Reforma",
  educacao: "Educação",
  "projetos-sociais-cristaos": "Projetos Sociais Cristãos",
  saude: "Saúde",
  outros: "Outros",
};

export const rotuloCategoria = (c: string) =>
  ROTULO_CATEGORIA[c] ??
  c.replace(/-/g, " ").replace(/^./, (l) => l.toUpperCase());

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
        `Categoria: ${filtros.categoria.map(rotuloCategoria).join(", ")}`,
      filtros.instituicao.length > 0 &&
        `Instituição: ${filtros.instituicao.join(", ")}`,
      filtros.tipo.length > 0 && `Triagem: ${filtros.tipo.join(", ")}`,
      filtros.responsavel.length > 0 &&
        `Responsável: ${filtros.responsavel.map(rotuloResponsavel).join(", ")}`,
      filtros.analise.length > 0 &&
        `Análise prévia: ${filtros.analise.map((a) => (a === "sim" ? "analisados" : "não analisados")).join(", ")}`,
      filtros.tag.length > 0 && `Tags: ${filtros.tag.join(", ")}`,
      nomePais && `País: ${nomePais}`,
      filtros.uf && `UF: ${NOME_UF[filtros.uf] ?? filtros.uf}`,
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
