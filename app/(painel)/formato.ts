import { SEM_RESPONSAVEL, type Filtros } from "@/lib/agregar";
import { NOME_UF } from "@/lib/uf";
import type { StatusGrupo, TipoRevisao } from "@/lib/types";
import { ROTULO_TIPO } from "./projetos/tipo";

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
  const d = deltaPedido(solicitado, recebido);
  if (d === null) return "";
  if (Math.abs(d) < 0.005) return "pede o mesmo valor";
  return `pede ${pct(Math.abs(d))} ${d > 0 ? "a mais" : "a menos"}`;
}

/** A mesma conta em número (0,186 = pede 18,6% a mais); `null` sem base. */
export const deltaPedido = (solicitado: number, recebido: number | null) =>
  !recebido || recebido <= 0 ? null : solicitado / recebido - 1;

/** "↑ 18,6%" — o mesmo salto, do tamanho de uma célula de tabela. */
export function setaVariacao(solicitado: number, recebido: number | null) {
  const d = deltaPedido(solicitado, recebido);
  if (d === null) return "";
  if (Math.abs(d) < 0.005) return "= 0%";
  return `${d > 0 ? "↑" : "↓"} ${pct(Math.abs(d))}`;
}

/**
 * O status COMO ESTÁ na origem (`em-validacao`, `devolvido-para-correcao`).
 * É ele que o filtro global, os funis e as tabelas mostram; o grupo da paleta
 * (`StatusGrupo`) só decide a cor. Antes o filtro era por grupo, e o
 * "Rascunho / outros" juntava o que nunca foi enviado (rascunho) com o que foi
 * enviado e voltou ao proponente (devolvido para correção). Status novo cai no
 * mesmo recuo de `rotuloCategoria` (hífen vira espaço, primeira maiúscula).
 *
 * A ordem das chaves é a do fluxo, da entrada à decisão, e é a ordem do filtro
 * e dos funis. São os 14 valores do enum `status` de `cycle_projects`.
 */
const ROTULO_STATUS_BRUTO: Record<string, string> = {
  rascunho: "Rascunho",
  submetido: "Submetido",
  "devolvido-para-correcao": "Devolvido para correção",
  "em-analise": "Em análise",
  "em-validacao": "Em validação",
  "para-votacao": "Para votação",
  "em-votacao": "Em votação",
  classificado: "Classificado",
  aprovado: "Aprovado",
  "em-andamento": "Em andamento",
  concluido: "Concluído",
  rejeitado: "Rejeitado",
  reprovado: "Reprovado",
  cancelado: "Cancelado",
};

export const rotuloStatus = (s: string) =>
  ROTULO_STATUS_BRUTO[s] ??
  s.replace(/-/g, " ").replace(/^./, (l) => l.toUpperCase());

/** Todos os status da origem, na ordem do fluxo. */
export const STATUS_ORIGEM = Object.keys(ROTULO_STATUS_BRUTO);

/** Ordena pela ordem do fluxo; status fora do enum conhecido vai para o fim. */
export const compararStatus = (a: string, b: string) =>
  (STATUS_ORIGEM.indexOf(a) + 1 || 99) - (STATUS_ORIGEM.indexOf(b) + 1 || 99) ||
  a.localeCompare(b, "pt-BR");

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
        `Status: ${filtros.status.map(rotuloStatus).join(", ")}`,
      filtros.categoria.length > 0 &&
        `Categoria: ${filtros.categoria.map(rotuloCategoria).join(", ")}`,
      filtros.instituicao.length > 0 &&
        `Instituição: ${filtros.instituicao.join(", ")}`,
      // Os rótulos da triagem, não os valores do filtro: esta linha sai no
      // rodapé impresso e no cabeçalho da pasta do diretor, onde "revisar"
      // cru não diz nada a quem lê a ata.
      filtros.tipo.length > 0 &&
        `Triagem: ${filtros.tipo
          .map((t) => ROTULO_TIPO[t as TipoRevisao] ?? t)
          .join(", ")}`,
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

/**
 * O vazio de todas as tabelas e rankings do painel. Diz a saída, e não só o
 * fato: quem cruza quatro filtros na reunião cai numa tela vazia sem lembrar
 * qual deles apertou demais, e o ✕ é o desfazer de todos de uma vez.
 * Um texto só porque o mesmo vazio aparece em sete telas.
 */
export const SEM_RESULTADO =
  "Nada neste recorte. Limpe os filtros no ✕ da barra acima.";
