/**
 * Fundação de dados do Painel Consultivo Hebron ASEEC (Fase 1).
 *
 * Ponto de entrada da camada de dados: a API/UI da Fase 2 deve importar daqui.
 * A origem é SOMENTE LEITURA — tudo aqui só faz `SELECT` e junta em memória com
 * os CSVs de data/.
 */
export { dados, atualizar, infoCache, ttlMs } from "./cache";
export {
  agregarPorInstituicao,
  agregarPorPais,
  avaliacoesCiclo,
  ciclos,
  conformidade,
  ehFinanciado,
  escolherLinhaOrcamento,
  estatisticaNota,
  grupoDeStatus,
  montarAvaliacoes,
  montarCobertura,
  montarConformidade,
  montarOrcamento,
  montarResumo,
  orcamentoCiclo,
  prestacaoContas,
  projetoLocal,
  projetosCiclo,
  resumoCiclo,
} from "./datasets";
export {
  assertReadOnly,
  closePool,
  pingDatabase,
  query,
  ReadOnlyViolationError,
} from "./db";
export {
  carregarCountryMap,
  carregarInstitutionEnrichment,
  indexarEnrichment,
  limparCacheEnriquecimento,
  resumirCobertura,
} from "./enrichment";
export { construirIndicePaises, dobrar, normalizarLocal } from "./geo";
export * from "./types";
