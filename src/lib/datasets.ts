import {
  fetchAnexos,
  fetchAnexosDeRelatorios,
  fetchAvaliacoes,
  fetchAvaliacoesDoProjeto,
  fetchCiclos,
  fetchDocumentos,
  fetchHistoricoDoProjeto,
  fetchOrcamentos,
  fetchPrestacaoContas,
  fetchProjetoDetalhe,
  fetchProjetos,
  fetchProjetosChave,
  fetchRelatoriosDosProjetos,
  fetchVotosDoProjeto,
} from "./queries";
import type {
  AvaliacaoRow,
  DocumentoRow,
  OrcamentoRow,
  ProjetoChaveRow,
  ProjetoRow,
} from "./queries";
import {
  agregarPorPais,
  agrupar,
  estatisticaNota,
  grupoDeStatus,
  montarResumo,
} from "./agregar";
import { carregarCountryMap, indexarEnrichment } from "./enrichment";
import { getStorageBaseUrl } from "./env";
import { carregarTriagem } from "./painel-db";
import { construirIndicePaises, normalizarLocal } from "./geo";
import { SEM_REVISAO } from "./types";
import type {
  AnalisePrevia,
  Anexo,
  Ano,
  AvaliacoesCiclo,
  Ciclo,
  Conformidade,
  OrcamentoCiclo,
  ProjetoCiclo,
  ProjetoDetalhe,
  ProjetoLocal,
  RelatorioPrestacao,
  ResumoCiclo,
  RevisaoProjeto,
} from "./types";

/**
 * Camada de junção: dados da ORIGEM (só SELECT) + enriquecimento de data/*.csv,
 * unidos em memória pelos uuids. Nenhum objeto é criado no banco de origem.
 *
 * São os "datasets" do plano (docs/plano-dashboard.md §8):
 *   projetos_ciclo · projeto_local · orcamento_ciclo · avaliacoes_ciclo
 * mais um resumo de KPIs por ciclo.
 *
 * As agregações puras moram em `agregar.ts` (a UI as usa no cliente); ficam
 * reexportadas aqui para quem já importava deste módulo.
 */
export {
  agregarPorInstituicao,
  agregarPorPais,
  ehFinanciado,
  estatisticaNota,
  grupoDeStatus,
  montarCobertura,
  montarResumo,
} from "./agregar";

// -------------------------------------------------------------------- ciclos

export async function ciclos(): Promise<Ciclo[]> {
  const rows = await fetchCiclos();
  return rows.map((r) => ({
    id: r.id,
    ano: r.year,
    nome: r.name,
    status: r.status,
    orcamentoAnual:
      r.annual_budget && r.annual_budget > 0 ? r.annual_budget : null,
  }));
}

// -------------------------------------------------------- projetos_ciclo

/** O que `montarProjetoCom` precisa ter em mãos, montado uma vez por lote. */
interface ContextoJuncao {
  indice: ReturnType<typeof construirIndicePaises>;
  enriquecimento: ReturnType<typeof indexarEnrichment>;
  revisoes: Map<string, RevisaoProjeto>;
  /** Todos os projetos de todas as remessas, por id — resolve o vínculo. */
  chaves: Map<string, ProjetoChaveRow>;
}

async function contextoJuncao(): Promise<ContextoJuncao> {
  return {
    indice: construirIndicePaises(carregarCountryMap()),
    enriquecimento: indexarEnrichment(),
    revisoes: await carregarTriagem(),
    chaves: new Map((await fetchProjetosChave()).map((p) => [p.id, p])),
  };
}

/**
 * Resolve a triagem do projeto: tipo, vínculo com a remessa anterior e — o que
 * a diretoria pede — quanto ESTE projeto recebeu no ciclo passado.
 *
 * O valor é lido da origem pelo id vinculado, não do CSV: assim, corrigir o
 * vínculo na planilha corrige o número na tela sem regerar nada.
 */
function montarRevisao(id: string, ctx: ContextoJuncao): RevisaoProjeto {
  const csv = ctx.revisoes.get(id);
  if (!csv) return SEM_REVISAO;

  const anterior = csv.projetoAnteriorId
    ? ctx.chaves.get(csv.projetoAnteriorId)
    : undefined;

  return {
    ...csv,
    projetoAnteriorTitulo: anterior?.title ?? csv.projetoAnteriorTitulo,
    recebidoAnterior: anterior?.approved_amount ?? null,
  };
}

/**
 * A análise prévia sai inteira da origem — a equipe registra parecer e tags no
 * próprio sistema de submissão. Nada a curar em CSV.
 */
function montarAnalise(row: ProjetoRow): AnalisePrevia {
  const tags = (row.parecer_aseec_tags ?? []).filter(Boolean);
  return {
    temParecer: row.tem_parecer,
    tags,
    temDevolutiva: row.tem_devolutiva,
    analisado: row.tem_parecer || tags.length > 0,
    atualizadoEm: row.updated_at,
  };
}

function montarProjetoCom(
  row: ProjetoRow,
  anoReferencia: Ano,
  ctx: ContextoJuncao,
): ProjetoCiclo {
  const { indice, enriquecimento: enriquecimentoPorInstituicao } = ctx;
  const e = row.institution_id
    ? enriquecimentoPorInstituicao.get(row.institution_id)
    : undefined;

  return {
    id: row.id,
    numero: row.numero,
    cicloId: row.cycle_id,
    ano: row.year,
    titulo: row.title,
    categoria: row.category,
    status: row.status,
    statusGrupo: grupoDeStatus(row.status),

    local: normalizarLocal(
      { country: row.country, state: row.state, city: row.city },
      indice,
    ),
    cidade: row.city,
    estado: row.state,
    areaSensivel: row.area_sensivel ?? false,

    solicitado: row.requested_amount ?? 0,
    aprovado: row.approved_amount,

    instituicaoId: row.institution_id,
    instituicaoNome: row.institution_name,
    conveniada: row.is_conveniada,
    submetidoPor: row.submitter_name,
    submetidoEm: row.submitted_at,

    duracaoMeses: row.timeline_months,
    numeroParcelas: row.numero_parcelas,
    mesesParcelas: row.meses_parcelas,
    simulacaoIncluida: row.simulation_included,

    alocado: row.allocated_amount,
    mensal: row.monthly_amount,
    parcelasAprovadas: row.approved_installments,
    reservado: row.reservado,
    liberado: row.liberado,

    avaliacoes: row.n_avaliacoes ?? 0,
    notaMedia: row.nota_media,
    notaMediana: row.nota_mediana,
    notaMin: row.nota_min,
    notaMax: row.nota_max,
    votosAprovacao: row.votos_aprovacao ?? 0,

    enriquecimento: {
      parceriaDesdeAno: e?.parceriaDesdeAno ?? null,
      anosDeParceria: e?.parceriaDesdeAno
        ? anoReferencia - e.parceriaDesdeAno
        : null,
      tipoParceria: e?.tipoParceria ?? null,
      observacoesAvaliacao: e?.observacoesAvaliacao ?? null,
      situacaoNoSistema: e?.situacaoNoSistemaDerivada ?? null,
      valorAprovado2025: e?.valorAprovado2025Derivado ?? null,
      projetos2025: e?.projetos2025 ?? null,
      projetos2026: e?.projetos2026 ?? null,
    },

    revisao: montarRevisao(row.id, ctx),
    analise: montarAnalise(row),
  };
}

/** 1 linha por projeto, país normalizado e enriquecimento já unidos. */
export async function projetosCiclo(ano: Ano): Promise<ProjetoCiclo[]> {
  const [rows, ctx] = await Promise.all([fetchProjetos(ano), contextoJuncao()]);
  return rows.map((r) => montarProjetoCom(r, ano, ctx));
}

export async function projetoLocal(ano: Ano): Promise<ProjetoLocal[]> {
  return agregarPorPais(await projetosCiclo(ano));
}

// ------------------------------------------ detalhe do projeto (Fase 5)

const BUCKET_PROJETO = "project-attachments";
const BUCKET_PRESTACAO = "accountability-documents";

/** Extensões que o `<video>` do navegador toca sem plugin nenhum. */
const EXT_VIDEO = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;

function montarAnexo(
  r: {
    id: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    file_type: string;
    uploaded_at: Date | null;
  },
  bucket: string,
  enviadoPor: string | null = null,
): Anexo {
  const base = getStorageBaseUrl();
  return {
    id: r.id,
    nome: r.file_name,
    tipo: r.file_type,
    // Sem base configurada o link fica vazio e a UI mostra "sem URL" — melhor
    // que um href quebrado no meio da reunião.
    url: base
      ? `${base}/${bucket}/${r.file_path.split("/").map(encodeURIComponent).join("/")}`
      : "",
    bytes: r.file_size,
    enviadoEm: r.uploaded_at,
    enviadoPor,
    ehVideo:
      r.file_type === "video" ||
      EXT_VIDEO.test(r.file_name) ||
      EXT_VIDEO.test(r.file_path),
  };
}

/** `indicadores`/`equipe` são jsonb livre — só aceitamos o que tem forma de lista. */
function lista(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor)
    ? valor.filter(
        (i): i is Record<string, unknown> => !!i && typeof i === "object",
      )
    : [];
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * A "pasta" do projeto: tudo o que a origem guarda sobre ele, mais o projeto
 * anterior vinculado (com a prestação de contas dele — é o que a equipe ASEEC
 * analisa numa renovação). Ver docs/fase5-projetos.md.
 */
export async function projetoDetalhe(
  id: string,
): Promise<ProjetoDetalhe | null> {
  const [linhas, ctx, detalhe] = await Promise.all([
    fetchProjetos(),
    contextoJuncao(),
    fetchProjetoDetalhe(id),
  ]);

  const row = linhas.find((l) => l.id === id);
  if (!row || !detalhe) return null;

  const projeto = montarProjetoCom(row, row.year, ctx);
  const anteriorId = projeto.revisao.projetoAnteriorId;
  const alvos = anteriorId ? [id, anteriorId] : [id];

  const [anexos, avaliacoesDetalhe, votos, historico, relatorios] =
    await Promise.all([
      fetchAnexos(alvos),
      fetchAvaliacoesDoProjeto(id),
      fetchVotosDoProjeto(id),
      fetchHistoricoDoProjeto(id),
      fetchRelatoriosDosProjetos(alvos),
    ]);

  const anexosRelatorio = await fetchAnexosDeRelatorios(
    relatorios.map((r) => r.id),
  );

  const relatoriosDe = (projetoId: string) =>
    relatorios
      .filter((r) => r.project_id === projetoId)
      .map((r) => ({
        id: r.id,
        ano: r.year,
        trimestre: r.quarter,
        status: r.status,
        andamento: r.project_progress,
        objetivosAlcancados: r.objectives_achieved,
        mudancasOuAtrasos: r.changes_or_delays,
        enviadoEm: r.submitted_at,
        notasDoRevisor: r.reviewer_notes,
        anexos: anexosRelatorio
          .filter((a) => a.report_id === r.id)
          .map((a) => montarAnexo(a, BUCKET_PRESTACAO)),
      }));

  const chaveAnterior = anteriorId ? ctx.chaves.get(anteriorId) : undefined;

  return {
    projeto,
    descricao: detalhe.description,
    justificativa: detalhe.justification,
    resultadosEsperados: detalhe.expected_results,
    natureza: detalhe.natureza,
    metodologia: detalhe.metodologia,
    parcerias: detalhe.parcerias,
    redeSocial: str(detalhe.rede_social),
    inicio: detalhe.start_date,
    fim: detalhe.end_date,
    criadoEm: detalhe.created_at,
    atualizadoEm: detalhe.updated_at,
    avaliadoEm: detalhe.reviewed_at,

    indicadores: lista(detalhe.indicadores).map((i) => ({
      nome: str(i["nome"]),
      meta: str(i["meta"]),
    })),
    equipe: lista(detalhe.equipe).map((m) => ({
      nome: str(m["nome"]),
      funcao: str(m["funcao"]),
      contato: str(m["contato"]),
    })),

    // `<p></p>` de editor não é parecer: quem decide isso é a mesma regra da
    // lista (`analise.temParecer`), senão a pasta abre um cartão "Parecer" vazio.
    parecerTexto: projeto.analise.temParecer
      ? detalhe.parecer_aseec_texto
      : null,
    parecerTags: (detalhe.parecer_aseec_tags ?? []).filter(Boolean),
    notasDoRevisor: detalhe.reviewer_notes,

    anexos: anexos
      .filter((a) => a.project_id === id)
      .map((a) => montarAnexo(a, BUCKET_PROJETO, a.uploader_name)),
    avaliacoesDetalhe: avaliacoesDetalhe.map((a) => ({
      avaliador: a.voter_name ?? "(sem nome no profiles)",
      papel: a.voter_role,
      aprovou: a.is_approved,
      nota: a.final_score,
      comentario: a.general_comments,
      enviadaEm: a.submitted_at,
    })),
    votos: votos.map((v) => ({
      avaliador: v.voter_name ?? "(sem nome no profiles)",
      tipo: v.vote_type,
      criterioChave: v.criterion_key,
      criterio: v.criterion_name,
      valor: v.vote_value,
      pontuacao: v.score_value,
      comentario: v.comments,
    })),
    historico: historico.map((h) => ({
      de: h.old_status,
      para: h.new_status,
      em: h.changed_at,
      por: h.changed_by_name,
    })),
    relatorios: relatoriosDe(id),
    // Preenchido na página, direto do Firestore e sem cache: um link colado
    // numa instância da Vercel tem que aparecer nas outras na hora.
    linksPrestacao: [],

    anterior: chaveAnterior
      ? {
          id: chaveAnterior.id,
          ano: chaveAnterior.year,
          titulo: chaveAnterior.title,
          status: chaveAnterior.status,
          solicitado: chaveAnterior.requested_amount ?? 0,
          aprovado: chaveAnterior.approved_amount,
          liberado: chaveAnterior.liberado,
          relatorios: relatoriosDe(chaveAnterior.id),
          linksPrestacao: [],
        }
      : null,

    instituicao: detalhe.inst_id
      ? {
          id: detalhe.inst_id,
          nome: detalhe.inst_nome ?? "(sem nome)",
          cnpj: detalhe.inst_cnpj,
          conveniada: detalhe.inst_conveniada,
          contato: detalhe.inst_responsavel,
          email: detalhe.inst_email,
          telefone: detalhe.inst_telefone,
        }
      : null,
  };
}

// -------------------------------------------------------- orcamento_ciclo

/** Abaixo disso a linha de orçamento é resíduo de teste, não planejamento real. */
const TETO_MINIMO_PLAUSIVEL = 100_000;

export interface EscolhaOrcamento {
  linha: OrcamentoRow | null;
  criterio: string;
  alertas: string[];
}

/**
 * Escolhe a linha de `resource_allocations` do ano.
 *
 * O doc original mandava filtrar `status='confirmado'`, mas os dados vivos
 * mostram o inverso em 2025: as três linhas `confirmado` de 2025 têm valores
 * de teste (faturamento R$ 10 mil, tetos de 3/60/70) e a linha real está como
 * `rascunho`. Por isso a regra aqui é: confirmado **e** plausível; senão, a
 * linha plausível de maior teto, sempre registrando o alerta.
 */
export function escolherLinhaOrcamento(
  rows: OrcamentoRow[],
  ano: Ano,
): EscolhaOrcamento {
  const doAno = rows.filter((r) => r.year === ano);
  const alertas: string[] = [];
  if (doAno.length === 0) {
    return {
      linha: null,
      criterio: "sem linha de orçamento para o ano",
      alertas: ["sem linha em resource_allocations"],
    };
  }

  const teto = (r: OrcamentoRow) =>
    (r.total_conveniados ?? 0) + (r.total_nao_conveniados ?? 0);
  const plausiveis = doAno.filter((r) => teto(r) >= TETO_MINIMO_PLAUSIVEL);
  const descartadas = doAno.filter((r) => teto(r) < TETO_MINIMO_PLAUSIVEL);

  if (descartadas.length > 0) {
    alertas.push(
      `${descartadas.length} linha(s) descartada(s) por teto implausível ` +
        `(${descartadas.map((r) => `${r.status ?? "sem status"}: ${teto(r).toLocaleString("pt-BR")}`).join("; ")})`,
    );
  }

  if (plausiveis.length === 0) {
    return { linha: null, criterio: "nenhuma linha plausível", alertas };
  }

  const confirmada = plausiveis
    .filter((r) => r.status === "confirmado")
    .sort((a, b) => teto(b) - teto(a))[0];
  if (confirmada) {
    return {
      linha: confirmada,
      criterio: "status=confirmado com teto plausível",
      alertas,
    };
  }

  const maior = plausiveis.sort((a, b) => teto(b) - teto(a))[0]!;
  alertas.push(
    `nenhuma linha 'confirmado' plausível em ${ano}: usando a linha '${maior.status ?? "sem status"}' de maior teto — confirmar com a equipe`,
  );
  return {
    linha: maior,
    criterio: "maior teto plausível (sem confirmado válido)",
    alertas,
  };
}

/** Parte pura: já recebe as linhas de orçamento e os projetos do ciclo. */
export function montarOrcamento(
  orcamentos: OrcamentoRow[],
  projetos: ProjetoCiclo[],
  ano: Ano,
): OrcamentoCiclo {
  const { linha, criterio, alertas } = escolherLinhaOrcamento(orcamentos, ano);

  const soma = (f: (p: ProjetoCiclo) => number | null) =>
    projetos.reduce((s, p) => s + (f(p) ?? 0), 0);

  const tetoConveniadas = linha?.total_conveniados ?? null;
  const tetoNaoConveniadas = linha?.total_nao_conveniados ?? null;
  const tetoTotal =
    tetoConveniadas === null && tetoNaoConveniadas === null
      ? null
      : (tetoConveniadas ?? 0) + (tetoNaoConveniadas ?? 0);

  // Um dos dois tetos zerado costuma significar "ainda não definido" — o painel
  // não pode tratar isso como "sem verba para conveniadas" sem avisar.
  if (linha) {
    if (!tetoConveniadas)
      alertas.push(
        `teto de conveniadas zerado/vazio em ${ano} — conferir com a equipe`,
      );
    if (!tetoNaoConveniadas)
      alertas.push(
        `teto de não conveniadas zerado/vazio em ${ano} — conferir com a equipe`,
      );
  }

  const solicitado = soma((p) => p.solicitado);
  const aprovado = soma((p) => p.aprovado);

  return {
    ano,
    fonteOrcamento: {
      id: linha?.id ?? null,
      status: linha?.status ?? null,
      criterio,
      alertas,
    },
    faturamento: linha?.faturamento ?? null,
    porcentagemDoacao: linha?.porcentagem_doacao ?? null,
    margemSeguranca: linha?.margem_seguranca ?? null,
    custosAdministrativos: linha?.custos_administrativos ?? null,
    ofertasAprovadas: linha?.ofertas_aprovadas ?? null,
    valorMinisterioSaude: linha?.valor_ministerio_saude ?? null,
    tetoConveniadas,
    tetoNaoConveniadas,
    tetoTotal,
    solicitado,
    aprovado,
    alocado: soma((p) => p.alocado),
    reservado: soma((p) => p.reservado),
    liberado: soma((p) => p.liberado),
    saldo: tetoTotal === null ? null : tetoTotal - aprovado,
    pressaoDemanda: tetoTotal ? solicitado / tetoTotal : null,
  };
}

export async function orcamentoCiclo(ano: Ano): Promise<OrcamentoCiclo> {
  const [orcamentos, projetos] = await Promise.all([
    fetchOrcamentos(),
    projetosCiclo(ano),
  ]);
  return montarOrcamento(orcamentos, projetos, ano);
}

// ------------------------------------------------------- avaliacoes_ciclo

export function montarAvaliacoes(
  rows: AvaliacaoRow[],
  ano: Ano,
): AvaliacoesCiclo {
  const notas = (lista: AvaliacaoRow[]) =>
    lista.map((r) => r.final_score).filter((v): v is number => v !== null);

  const porCategoria = [...agrupar(rows, (r) => r.category).entries()]
    .map(([categoria, lista]) => ({
      categoria,
      ...estatisticaNota(notas(lista)),
    }))
    .sort((a, b) => b.n - a.n);

  const porConselheiro = [...agrupar(rows, (r) => r.voter_id).entries()]
    .map(([conselheiroId, lista]) => ({
      conselheiroId,
      conselheiro: lista[0]?.voter_name ?? "(sem nome no profiles)",
      ...estatisticaNota(notas(lista)),
    }))
    .sort((a, b) => b.n - a.n);

  return {
    ano,
    geral: estatisticaNota(notas(rows)),
    porCategoria,
    porConselheiro,
  };
}

export async function avaliacoesCiclo(ano: Ano): Promise<AvaliacoesCiclo> {
  return montarAvaliacoes(await fetchAvaliacoes(ano), ano);
}

export async function resumoCiclo(ano: Ano): Promise<ResumoCiclo> {
  return montarResumo(await projetosCiclo(ano), ano);
}

// ------------------------------------------------- conformidade (Fase 4)

/** Parte pura: monta a conformidade a partir das contagens da origem. */
export function montarConformidade(rows: DocumentoRow[]): Conformidade {
  const porInstituicao: Conformidade["porInstituicao"] = {};
  const tipos = new Map<string, { enviados: number; pendentes: number }>();

  for (const r of rows) {
    const enviado = r.status === "enviado";
    const inst = (porInstituicao[r.institution_id] ??= {
      enviados: 0,
      pendentes: 0,
      total: 0,
    });
    inst.total += r.n;
    if (enviado) inst.enviados += r.n;
    else inst.pendentes += r.n;

    const tipo = tipos.get(r.document_type) ?? { enviados: 0, pendentes: 0 };
    if (enviado) tipo.enviados += r.n;
    else tipo.pendentes += r.n;
    tipos.set(r.document_type, tipo);
  }

  return {
    porInstituicao,
    porTipo: [...tipos.entries()]
      .map(([tipo, t]) => ({ tipo, ...t, total: t.enviados + t.pendentes }))
      .sort((a, b) => b.pendentes - a.pendentes),
    tiposExigidos: tipos.size,
  };
}

export async function conformidade(): Promise<Conformidade> {
  return montarConformidade(await fetchDocumentos());
}

// ------------------------------------------ prestação de contas (Fase 4)

/**
 * Todos os relatórios (27 linhas hoje) — de todos os ciclos de uma vez. A
 * separação por remessa é do `montarCobertura`, no cliente, porque o mesmo
 * conjunto serve o ciclo ativo e o comparativo.
 */
export async function prestacaoContas(): Promise<RelatorioPrestacao[]> {
  const rows = await fetchPrestacaoContas();
  return rows.map((r) => ({
    projetoId: r.project_id,
    instituicaoId: r.institution_id,
    ano: r.year,
    trimestre: r.quarter,
    status: r.status,
    enviadoEm: r.submitted_at,
    cicloAno: r.cycle_year,
  }));
}
