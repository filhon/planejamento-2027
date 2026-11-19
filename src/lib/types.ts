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

// --------------------------------------------- triagem da reunião (Fase 5)

/**
 * Como o projeto entra na reunião:
 *  - `renovacao` — continuação de um projeto da remessa anterior. Só a equipe
 *    ASEEC analisa (prestação de contas + valor pedido) e dá o parecer.
 *  - `novo` — vai para a pasta de um diretor/conselheiro, que avalia a fundo e
 *    apresenta; todos votam.
 *  - `revisar` — o casamento automático achou um candidato plausível mas não
 *    conclusivo. Pendência da equipe: decidir na pasta do projeto.
 */
export type TipoRevisao = "novo" | "renovacao" | "revisar";

/** Um avaliador da rodada (data/avaliadores.csv). */
export interface Avaliador {
  userId: string;
  nome: string;
  papel: string;
  ativo: boolean;
}

/** Um doc da coleção `triagem` (Firestore), já com o curado sobrepondo. */
export interface RevisaoProjeto {
  /**
   * false = o projeto não tem doc na triagem. Acontece com quem foi submetido
   * depois do último `avaliacao:regen` — e é diferente de "analisado e
   * classificado como novo", que é o que `tipo` diz.
   */
  naTriagem: boolean;
  /** Vale para a reunião: o curado vence a sugestão. */
  tipo: TipoRevisao;
  /** O que o casamento automático propôs (auditoria). */
  sugestao: TipoRevisao;
  /** true quando a equipe decidiu na mão (Editar triagem). */
  curado: boolean;
  /**
   * Exatamente o que a equipe escreveu nas colunas curadas — null quando a
   * célula está em branco. Guardado cru porque o regen grava **isto** de volta:
   * se gravasse o valor efetivo, um `projeto_anterior_id` preenchido sozinho
   * carimbaria a sugestão na coluna `tipo` e viraria decisão humana sem ninguém
   * ter decidido nada.
   */
  tipoCurado: TipoRevisao | null;
  projetoAnteriorIdCurado: string | null;
  /** 0..1 do casamento de título; null se não houve candidato. */
  similaridade: number | null;
  /** Projeto da remessa anterior a que este dá continuidade. */
  projetoAnteriorId: string | null;
  projetoAnteriorTitulo: string | null;
  /**
   * Quanto ESTE projeto recebeu na remessa anterior — o `approved_amount` do
   * projeto casado. Null quando não há vínculo (aí vale o valor da instituição,
   * em `enriquecimento.valorAprovado2025`).
   */
  recebidoAnterior: number | null;
  /** Diretor/conselheiro dono da pasta. Só projeto novo recebe. */
  responsavel: string | null;
  observacoes: string | null;
}

/** Sem CSV ainda: tudo é "novo" até a triagem rodar. */
export const SEM_REVISAO: RevisaoProjeto = {
  naTriagem: false,
  tipo: "novo",
  sugestao: "novo",
  curado: false,
  tipoCurado: null,
  projetoAnteriorIdCurado: null,
  similaridade: null,
  projetoAnteriorId: null,
  projetoAnteriorTitulo: null,
  recebidoAnterior: null,
  responsavel: null,
  observacoes: null,
};

// ------------------------------------------- análise prévia (Fase 10)

/**
 * O rastro da **análise prévia** — o trabalho que a equipe ASEEC faz nas semanas
 * ANTES da reunião, para só levar à mesa o que está alinhado aos objetivos.
 *
 * Tudo vem da origem (nada de CSV): a equipe registra no próprio sistema de
 * submissão. Por que existe como campo próprio: a análise acontece **um pouco
 * por dia e a várias mãos**, e quase nunca muda o `status` do projeto (232 dos
 * 267 de 2026 seguem em `em-validacao`) — sem isto não há como saber onde a
 * equipe parou ontem.
 *
 * Não há coluna de autor nem de data da análise na origem: dá para dizer **o
 * que** já foi registrado, não **quem** registrou.
 */
export interface AnalisePrevia {
  /** Parecer escrito. HTML vazio (`<p></p>`) não conta — ver `TEM_PARECER`. */
  temParecer: boolean;
  /** Tags do parecer: é a classificação por objetivo ("Janela 10/40", "Crianças"…). */
  tags: string[];
  /** `reviewer_notes` — a devolutiva pedindo ajuste ao proponente. */
  temDevolutiva: boolean;
  /** A definição da equipe: já tem parecer **ou** tags. */
  analisado: boolean;
  /**
   * `updated_at` do registro. É "última alteração", NÃO "analisado em": o
   * proponente também edita o projeto. Serve para retomar de onde se parou.
   */
  atualizadoEm: Date | null;
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
  /** Nº de reunião: ordem de criação na remessa (1…n), derivado — ver `fetchProjetos`. */
  numero: number;
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
  /** Triagem novo × renovação e dono da pasta (Fase 5). */
  revisao: RevisaoProjeto;
  /** O que a equipe ASEEC já registrou na análise prévia (Fase 10). */
  analise: AnalisePrevia;
}

// ------------------------------------------ detalhe do projeto (Fase 5)

/** Um anexo, já com a URL pública do Storage montada. */
export interface Anexo {
  id: string;
  nome: string;
  /** Rótulo da origem: video · orcamento · cronograma · portfolio · … */
  tipo: string;
  /** URL pública do bucket (os três buckets da origem são públicos). */
  url: string;
  bytes: number | null;
  enviadoEm: Date | null;
  enviadoPor: string | null;
  /** Deriva da extensão — decide se toca no `<video>` ou vira link. */
  ehVideo: boolean;
}

export interface AvaliacaoProjeto {
  avaliador: string;
  papel: string | null;
  aprovou: boolean | null;
  nota: number | null;
  comentario: string | null;
  enviadaEm: Date | null;
}

export interface VotoProjeto {
  avaliador: string;
  tipo: string;
  criterioChave: string | null;
  criterio: string | null;
  valor: string | null;
  pontuacao: number | null;
  comentario: string | null;
}

export interface MudancaStatus {
  de: string | null;
  para: string;
  em: Date | null;
  por: string | null;
}

export interface RelatorioDetalhe {
  id: string;
  ano: Ano;
  trimestre: number;
  status: string | null;
  andamento: string | null;
  objetivosAlcancados: string | null;
  mudancasOuAtrasos: string | null;
  enviadoEm: Date | null;
  notasDoRevisor: string | null;
  anexos: Anexo[];
}

/** Uma pessoa da equipe do projeto (`cycle_projects.equipe`, jsonb). */
export interface MembroEquipe {
  nome: string | null;
  funcao: string | null;
  contato: string | null;
}

/** Um indicador (`cycle_projects.indicadores`, jsonb). */
export interface Indicador {
  nome: string | null;
  meta: string | null;
}

/** O projeto anterior casado — a base da renovação. */
export interface ProjetoAnterior {
  id: string;
  ano: Ano;
  titulo: string;
  status: string;
  solicitado: number;
  aprovado: number | null;
  liberado: number | null;
  relatorios: RelatorioDetalhe[];
  /** Prestação que existe só no Drive (Firestore do painel, `prestacao_links`). */
  linksPrestacao: Anexo[];
}

/** Tudo o que a origem guarda sobre um projeto — a "pasta" da reunião. */
export interface ProjetoDetalhe {
  projeto: ProjetoCiclo;

  descricao: string | null;
  justificativa: string | null;
  resultadosEsperados: string | null;
  natureza: string | null;
  metodologia: string | null;
  parcerias: string | null;
  redeSocial: string | null;
  inicio: Date | null;
  fim: Date | null;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
  avaliadoEm: Date | null;

  indicadores: Indicador[];
  equipe: MembroEquipe[];

  /** Parecer da equipe ASEEC, direto de `cycle_projects`. */
  parecerTexto: string | null;
  parecerTags: string[];
  notasDoRevisor: string | null;

  anexos: Anexo[];
  avaliacoesDetalhe: AvaliacaoProjeto[];
  votos: VotoProjeto[];
  historico: MudancaStatus[];
  /** Prestação de contas DESTE projeto (existe quando o ciclo já executou). */
  relatorios: RelatorioDetalhe[];
  /** Prestação deste projeto que existe só no Drive (Firestore do painel, `prestacao_links`). */
  linksPrestacao: Anexo[];
  /** Prestação de contas do projeto anterior — o que a equipe cobra na renovação. */
  anterior: ProjetoAnterior | null;

  instituicao: {
    id: string;
    nome: string;
    cnpj: string | null;
    conveniada: boolean | null;
    contato: string | null;
    email: string | null;
    telefone: string | null;
  } | null;
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

// ----------------------------------------------- instituições (Fase 4)

/** Conformidade documental de uma instituição (`institution_documents`). */
export interface DocumentosInstituicao {
  enviados: number;
  pendentes: number;
  total: number;
}

export interface Conformidade {
  /** Chaveado pelo uuid da instituição — a UI só faz lookup. */
  porInstituicao: Record<string, DocumentosInstituicao>;
  porTipo: {
    tipo: string;
    enviados: number;
    pendentes: number;
    total: number;
  }[];
  /** Quantos tipos de documento o sistema cobra de cada instituição. */
  tiposExigidos: number;
}

/** 1 linha por instituição no recorte — o ranking de verba da página 05. */
export interface InstituicaoResumo {
  id: string;
  nome: string;
  conveniada: boolean;
  projetos: number;
  solicitado: number;
  aprovado: number;
  reservado: number;
  paises: number;
  /** Mediana das notas medianas dos projetos da instituição. */
  notaMediana: number | null;
  situacao: string | null;
  anosDeParceria: number | null;
  valorAprovado2025: number | null;
  documentos: DocumentosInstituicao;
}

// ---------------------------------------- prestação de contas (Fase 4)

/** 1 linha de `cycle_project_accountability_reports`. */
export interface RelatorioPrestacao {
  projetoId: string;
  instituicaoId: string | null;
  /** Ano-CALENDÁRIO do relatório — não é o ano da remessa. */
  ano: Ano;
  trimestre: number;
  status: string | null;
  enviadoEm: Date | null;
  /** Ano da remessa a que o relatório pertence. */
  cicloAno: Ano | null;
}

export interface CoberturaPrestacao {
  ano: Ano;
  /** Projetos do recorte que receberam verba — quem deve prestar contas. */
  financiados: number;
  comRelatorio: number;
  /** comRelatorio / financiados. */
  cobertura: number;
  relatorios: number;
  enviados: number;
  rascunhos: number;
  /** Instituições que entregaram ao menos um relatório. */
  instituicoes: number;
  aprovadoTotal: number;
  aprovadoCoberto: number;
  aprovadoDescoberto: number;
  /** Relatórios de projetos que não estão aprovados — higiene, não cobertura. */
  relatoriosForaDoEsperado: number;
  /**
   * Relatórios do projeto certo mas carimbados com outro `cycle_id` na origem
   * (acontece quando o relatório é enviado já com a remessa seguinte aberta).
   */
  relatoriosDeOutroCiclo: number;
  porTrimestre: {
    rotulo: string;
    relatorios: number;
    enviados: number;
    projetos: number;
  }[];
  /** Financiados sem nenhum relatório, do maior aprovado para o menor. */
  pendentes: ProjetoCiclo[];
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
