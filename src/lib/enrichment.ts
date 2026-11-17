import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { REPO_ROOT } from "./env";
import type {
  Avaliador,
  CountryMapRow,
  InstitutionEnrichmentRow,
} from "./types";

/**
 * Camada de enriquecimento — vive FORA da origem, em data/*.csv
 * (docs/enriquecimento-dados.md). Estes arquivos são a fonte de verdade do que
 * não existe no banco: de-para de país e dados curados por instituição.
 */

export const DATA_DIR = resolve(REPO_ROOT, "data");
export const COUNTRY_MAP_CSV = resolve(DATA_DIR, "country_map.csv");
export const INSTITUTION_ENRICHMENT_CSV = resolve(
  DATA_DIR,
  "institution_enrichment.csv",
);
export const AVALIADORES_CSV = resolve(DATA_DIR, "avaliadores.csv");

export function lerCsv(caminho: string): Record<string, string>[] {
  if (!existsSync(caminho)) {
    throw new Error(`Arquivo de enriquecimento não encontrado: ${caminho}`);
  }
  const conteudo = readFileSync(caminho, "utf-8");
  return parse(conteudo, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/** Igual, mas devolve vazio quando o arquivo ainda não foi gerado. */
export function lerCsvOpcional(caminho: string): Record<string, string>[] {
  return existsSync(caminho) ? lerCsv(caminho) : [];
}

function texto(valor: string | undefined): string | null {
  const t = valor?.trim();
  return t ? t : null;
}

function numero(valor: string | undefined): number {
  const t = texto(valor);
  if (!t) return 0;
  return numeroDoCsv(t);
}

/**
 * O CSV tem dois donos: as colunas derivadas saem do `enrich:regen` com ponto
 * decimal ("249600.00"), e quem edita no Excel pt-BR digita "249.600,00".
 * Tirar todo ponto lia o primeiro como 24.960.000. Vírgula manda no formato
 * brasileiro; ponto só é milhar quando vem em grupos de três ("1.250").
 */
export function numeroDoCsv(t: string): number {
  const s =
    /,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "").replace(",", ".")
      : t;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function inteiroOuNulo(valor: string | undefined): number | null {
  const t = texto(valor);
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function booleanoPtOuNulo(valor: string | undefined): boolean | null {
  const t = texto(valor)?.toLowerCase();
  if (!t) return null;
  if (["sim", "true", "1", "s"].includes(t)) return true;
  if (["não", "nao", "false", "0", "n"].includes(t)) return false;
  return null;
}

let cacheCountryMap: CountryMapRow[] | null = null;
let cacheEnrichment: InstitutionEnrichmentRow[] | null = null;

/** De-para de país → ISO-3 + continente (data/country_map.csv). */
export function carregarCountryMap(forcar = false): CountryMapRow[] {
  if (cacheCountryMap && !forcar) return cacheCountryMap;

  const linhas = lerCsv(COUNTRY_MAP_CSV)
    .map((r) => ({
      rawCountry: r["raw_country"] ?? "",
      iso3: (r["iso3"] ?? "").toUpperCase(),
      namePt: r["name_pt"] ?? "",
      continent: r["continent"] ?? "",
    }))
    .filter((r) => r.rawCountry && r.iso3.length === 3);

  cacheCountryMap = linhas;
  return linhas;
}

/** Enriquecimento por instituição (derivado + curado). */
export function carregarInstitutionEnrichment(
  forcar = false,
): InstitutionEnrichmentRow[] {
  if (cacheEnrichment && !forcar) return cacheEnrichment;

  const linhas = lerCsv(INSTITUTION_ENRICHMENT_CSV)
    .map((r) => ({
      institutionId: (r["institution_id"] ?? "").trim(),
      institutionName: r["institution_name"] ?? "",
      isConveniada: booleanoPtOuNulo(r["is_conveniada"]),
      projetos2025: numero(r["projetos_2025"]),
      projetos2026: numero(r["projetos_2026"]),
      aprovados2025: numero(r["aprovados_2025"]),
      valorAprovado2025Derivado: numero(r["valor_aprovado_2025_derivado"]),
      situacaoNoSistemaDerivada: r["situacao_no_sistema_derivada"] ?? "",
      parceriaDesdeAno: inteiroOuNulo(r["parceria_desde_ano"]),
      tipoParceria: texto(r["tipo_parceria"]),
      observacoesAvaliacao: texto(r["observacoes_avaliacao"]),
    }))
    .filter((r) => r.institutionId);

  cacheEnrichment = linhas;
  return linhas;
}

export function indexarEnrichment(
  linhas = carregarInstitutionEnrichment(),
): Map<string, InstitutionEnrichmentRow> {
  return new Map(linhas.map((l) => [l.institutionId, l]));
}

// --------------------- avaliadores da rodada (a triagem mora no Firestore)

let cacheAvaliadores: Avaliador[] | null = null;

/** Diretores e conselheiros da rodada (data/avaliadores.csv). */
export function carregarAvaliadores(forcar = false): Avaliador[] {
  if (cacheAvaliadores && !forcar) return cacheAvaliadores;

  const linhas = lerCsvOpcional(AVALIADORES_CSV)
    .map((r) => ({
      userId: (r["user_id"] ?? "").trim(),
      nome: (r["nome"] ?? "").trim(),
      papel: r["papel"] ?? "",
      // Só um "não" explícito tira alguém da rodada.
      ativo: booleanoPtOuNulo(r["ativo"]) !== false,
    }))
    .filter((r) => r.nome);

  cacheAvaliadores = linhas;
  return linhas;
}

// ------------------------------------- prestação de contas no Drive (Fase 9)

/** Esquece os CSVs em memória (usado pelo botão "Atualizar"). */
export function limparCacheEnriquecimento(): void {
  cacheCountryMap = null;
  cacheEnrichment = null;
  cacheAvaliadores = null;
}

/** Cobertura do enriquecimento — insumo do relatório de sanidade. */
export interface CoberturaEnriquecimento {
  totalNoCsv: number;
  curadasComAno: number;
  curadasComTipo: number;
  curadasComObservacao: number;
}

export function resumirCobertura(
  linhas = carregarInstitutionEnrichment(),
): CoberturaEnriquecimento {
  return {
    totalNoCsv: linhas.length,
    curadasComAno: linhas.filter((l) => l.parceriaDesdeAno !== null).length,
    curadasComTipo: linhas.filter((l) => l.tipoParceria !== null).length,
    curadasComObservacao: linhas.filter((l) => l.observacoesAvaliacao !== null)
      .length,
  };
}
