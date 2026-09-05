import {
  fetchAvaliacoes,
  fetchCiclos,
  fetchOrcamentos,
  fetchProjetos,
} from "./queries";
import type { AvaliacaoRow, OrcamentoRow, ProjetoRow } from "./queries";
import {
  agregarPorPais,
  agrupar,
  estatisticaNota,
  grupoDeStatus,
  montarResumo,
} from "./agregar";
import { carregarCountryMap, indexarEnrichment } from "./enrichment";
import { construirIndicePaises, normalizarLocal } from "./geo";
import type {
  Ano,
  AvaliacoesCiclo,
  Ciclo,
  OrcamentoCiclo,
  ProjetoCiclo,
  ProjetoLocal,
  ResumoCiclo,
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
  agregarPorPais,
  estatisticaNota,
  grupoDeStatus,
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

export function montarProjeto(
  row: ProjetoRow,
  anoReferencia: Ano,
): ProjetoCiclo {
  const indice = construirIndicePaises(carregarCountryMap());
  return montarProjetoCom(row, anoReferencia, indice, indexarEnrichment());
}

function montarProjetoCom(
  row: ProjetoRow,
  anoReferencia: Ano,
  indice: ReturnType<typeof construirIndicePaises>,
  enriquecimentoPorInstituicao: ReturnType<typeof indexarEnrichment>,
): ProjetoCiclo {
  const e = row.institution_id
    ? enriquecimentoPorInstituicao.get(row.institution_id)
    : undefined;

  return {
    id: row.id,
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
  };
}

/** 1 linha por projeto, país normalizado e enriquecimento já unidos. */
export async function projetosCiclo(ano: Ano): Promise<ProjetoCiclo[]> {
  const rows = await fetchProjetos(ano);
  const indice = construirIndicePaises(carregarCountryMap());
  const enriquecimento = indexarEnrichment();
  return rows.map((r) => montarProjetoCom(r, ano, indice, enriquecimento));
}

export async function projetoLocal(ano: Ano): Promise<ProjetoLocal[]> {
  return agregarPorPais(await projetosCiclo(ano));
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
