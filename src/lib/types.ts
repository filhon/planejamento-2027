/** Tipos da fundação de dados (Fase 1). */

export type Ano = number;

// ---------------------------------------------------------------- geografia

/** De-para de país (data/country_map.csv). */
export interface CountryMapRow {
  rawCountry: string;
  iso3: string;
  namePt: string;
  continent: string;
}

/** Rótulo do grupo dos projetos sem país identificável (área sensível). */
export const GRUPO_SENSIVEL = "Multi-país / sensível";
export const CONTINENTE_SENSIVEL = "Sensível";

/** De onde saiu o país do projeto. */
export type FonteLocal = "country" | "state" | "city" | "sem-pais";

export interface LocalNormalizado {
  /** ISO-3166 alpha-3; null para o grupo multi-país/sensível (não pinta o mapa). */
  iso3: string | null;
  nomePt: string;
  continente: string;
  /** true = entra em "Multi-país / sensível" (conta nos KPIs, não pinta o mapa). */
  sensivel: boolean;
  fonte: FonteLocal;
  /** Valor cru de cycle_projects.country, para auditoria. */
  bruto: string | null;
}

// ------------------------------------------------------------ enriquecimento

/** Uma linha de data/institution_enrichment.csv. */
export interface InstitutionEnrichmentRow {
  institutionId: string;
  institutionName: string;
  isConveniada: boolean | null;
  // derivadas (regeneráveis por SELECT na origem)
  projetos2025: number;
  projetos2026: number;
  aprovados2025: number;
  valorAprovado2025Derivado: number;
  situacaoNoSistemaDerivada: string;
  // curadas (preenchidas pela equipe)
  parceriaDesdeAno: number | null;
  tipoParceria: string | null;
  observacoesAvaliacao: string | null;
}

/** O que o enriquecimento agrega a um projeto. */
export interface EnriquecimentoProjeto {
  parceriaDesdeAno: number | null;
  /** ano de referência − parceriaDesdeAno (null se não curado). */
  anosDeParceria: number | null;
  tipoParceria: string | null;
  observacoesAvaliacao: string | null;
  situacaoNoSistema: string | null;
  valorAprovado2025: number | null;
  projetos2025: number | null;
  projetos2026: number | null;
}

// ------------------------------------------------------------------- ciclos

export interface Ciclo {
  id: string;
  ano: Ano;
  nome: string;
  status: string;
  orcamentoAnual: number | null;
}

// ----------------------------------------------------------------- projetos

export type StatusGrupo =
  | "aprovado"
  | "em-avaliacao"
  | "classificado"
  | "rejeitado"
  | "neutro"
  | "encerrado";

export interface ProjetoCiclo {
  id: string;
  cicloId: string;
  ano: Ano;
  titulo: string;
  categoria: string;
  status: string;
  statusGrupo: StatusGrupo;

  local: LocalNormalizado;
  cidade: string | null;
  estado: string | null;
  areaSensivel: boolean;

  solicitado: number;
  aprovado: number | null;

  instituicaoId: string | null;
  instituicaoNome: string | null;
  conveniada: boolean | null;
  submetidoPor: string | null;
  submetidoEm: Date | null;

  duracaoMeses: number | null;
  numeroParcelas: number | null;
  mesesParcelas: number[] | null;
  simulacaoIncluida: boolean | null;

  alocado: number | null;
  mensal: number | null;
  parcelasAprovadas: number | null;
  reservado: number | null;
  liberado: number | null;

  avaliacoes: number;
  notaMedia: number | null;
  notaMediana: number | null;
  notaMin: number | null;
  notaMax: number | null;
  votosAprovacao: number;

  enriquecimento: EnriquecimentoProjeto;
}

// ------------------------------------------------------- datasets agregados

/** 1 linha por país — insumo direto do choropleth. */
export interface ProjetoLocal {
  iso3: string | null;
  nomePt: string;
  continente: string;
  sensivel: boolean;
  projetos: number;
  solicitado: number;
  aprovado: number;
  instituicoes: number;
  categorias: { categoria: string; projetos: number }[];
}

export interface OrcamentoCiclo {
  ano: Ano;
  /** Linha de resource_allocations usada, e por quê. */
  fonteOrcamento: {
    id: string | null;
    status: string | null;
    criterio: string;
    alertas: string[];
  };
  faturamento: number | null;
  porcentagemDoacao: number | null;
  margemSeguranca: number | null;
  custosAdministrativos: number | null;
  ofertasAprovadas: number | null;
  valorMinisterioSaude: number | null;
  tetoConveniadas: number | null;
  tetoNaoConveniadas: number | null;
  tetoTotal: number | null;

  solicitado: number;
  aprovado: number;
  alocado: number;
  reservado: number;
  liberado: number;

  /** teto − aprovado (null quando não há teto confiável). */
  saldo: number | null;
  /** solicitado / teto. */
  pressaoDemanda: number | null;
}

export interface EstatisticaNota {
  n: number;
  media: number | null;
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  desvio: number | null;
  min: number | null;
  max: number | null;
  /** fração de notas exatamente 10,0 — sinal de inflação. */
  fracaoNotaMaxima: number | null;
}

export interface AvaliacoesCiclo {
  ano: Ano;
  geral: EstatisticaNota;
  porCategoria: (EstatisticaNota & { categoria: string })[];
  porConselheiro: (EstatisticaNota & {
    conselheiroId: string;
    conselheiro: string;
  })[];
}

export interface ResumoCiclo {
  ano: Ano;
  projetos: number;
  paisesAlcancados: number;
  projetosInternacionais: number;
  fracaoInternacional: number;
  projetosSensiveis: number;
  solicitado: number;
  aprovado: number;
  instituicoes: number;
  instituicoesConveniadas: number;
  porStatus: { status: string; projetos: number; solicitado: number }[];
  porCategoria: {
    categoria: string;
    projetos: number;
    solicitado: number;
    aprovado: number;
  }[];
  porContinente: { continente: string; projetos: number; solicitado: number }[];
}
