import { query } from "./db";
import type { Ano } from "./types";

/**
 * Consultas de LEITURA na origem. Todas são `SELECT` puros — nenhum objeto é
 * criado no banco de origem (nada de view, tabela ou função). Ver
 * docs/enriquecimento-dados.md.
 *
 * Higiene aplicada aqui (docs/banco-de-dados.md):
 *  - só tabelas `cycle_*` (as legadas `projects*` duplicam o ciclo 2025);
 *  - nomes de pessoas via `profiles.user_id` (nunca lendo o schema `auth`).
 */

// ------------------------------------------------------------------ ciclos

export interface CicloRow {
  id: string;
  year: number;
  name: string;
  status: string;
  annual_budget: number | null;
}

export function fetchCiclos(): Promise<CicloRow[]> {
  return query<CicloRow>(`
    select id, year, name, status, annual_budget
    from submission_cycles
    order by year
  `);
}

// ---------------------------------------------------------------- projetos

export interface ProjetoRow {
  id: string;
  cycle_id: string;
  year: number;
  title: string;
  category: string;
  status: string;
  country: string | null;
  city: string | null;
  state: string | null;
  area_sensivel: boolean | null;
  requested_amount: number | null;
  approved_amount: number | null;
  timeline_months: number | null;
  numero_parcelas: number | null;
  meses_parcelas: number[] | null;
  simulation_included: boolean | null;
  submitted_at: Date | null;
  institution_id: string | null;
  institution_name: string | null;
  is_conveniada: boolean | null;
  submitter_name: string | null;
  allocated_amount: number | null;
  monthly_amount: number | null;
  approved_installments: number | null;
  reservado: number | null;
  liberado: number | null;
  n_avaliacoes: number | null;
  nota_media: number | null;
  nota_mediana: number | null;
  nota_min: number | null;
  nota_max: number | null;
  votos_aprovacao: number | null;
}

/** 1 linha por projeto do ciclo, com os satélites já agregados. */
export function fetchProjetos(ano?: Ano): Promise<ProjetoRow[]> {
  return query<ProjetoRow>(
    `
    select
      cp.id,
      cp.cycle_id,
      sc.year,
      cp.title,
      cp.category::text          as category,
      cp.status::text            as status,
      cp.country,
      cp.city,
      cp.state,
      cp.area_sensivel,
      cp.requested_amount,
      cp.approved_amount,
      cp.timeline_months,
      cp.numero_parcelas,
      cp.meses_parcelas,
      cp.simulation_included,
      cp.submitted_at,
      cp.institution_id,
      i.name                     as institution_name,
      i.is_conveniada,
      p.name                     as submitter_name,
      ba.allocated_amount,
      ba.monthly_amount,
      ba.approved_installments,
      rv.reservado,
      rv.liberado,
      ev.n_avaliacoes,
      ev.nota_media,
      ev.nota_mediana,
      ev.nota_min,
      ev.nota_max,
      ev.votos_aprovacao
    from cycle_projects cp
    join submission_cycles sc on sc.id = cp.cycle_id
    left join institutions i  on i.id = cp.institution_id
    left join profiles p      on p.user_id = cp.submitter_id
    left join lateral (
      select
        sum(b.allocated_amount)      as allocated_amount,
        sum(b.monthly_amount)        as monthly_amount,
        max(b.approved_installments) as approved_installments
      from cycle_project_budget_allocations b
      where b.project_id = cp.id and b.cycle_id = cp.cycle_id
    ) ba on true
    left join lateral (
      select
        sum(r.amount)                                        as reservado,
        sum(r.amount) filter (where r.released_at is not null) as liberado
      from cycle_budget_reservations r
      where r.project_id = cp.id and r.cycle_id = cp.cycle_id
    ) rv on true
    left join lateral (
      select
        count(*)                                                        as n_avaliacoes,
        avg(e.final_score)                                              as nota_media,
        percentile_cont(0.5) within group (order by e.final_score)      as nota_mediana,
        min(e.final_score)                                              as nota_min,
        max(e.final_score)                                              as nota_max,
        count(*) filter (where e.is_approved)                           as votos_aprovacao
      from cycle_project_evaluations e
      where e.project_id = cp.id and e.cycle_id = cp.cycle_id
    ) ev on true
    where $1::int is null or sc.year = $1::int
    order by sc.year, cp.title
  `,
    [ano ?? null],
  );
}

// -------------------------------------------------------------- avaliações

export interface AvaliacaoRow {
  project_id: string;
  year: number;
  category: string;
  voter_id: string;
  voter_name: string | null;
  final_score: number | null;
  is_approved: boolean | null;
}

/** 1 linha por avaliação (nota de um conselheiro num projeto). */
export function fetchAvaliacoes(ano?: Ano): Promise<AvaliacaoRow[]> {
  return query<AvaliacaoRow>(
    `
    select
      e.project_id,
      sc.year,
      cp.category::text as category,
      e.voter_id,
      p.name            as voter_name,
      e.final_score,
      e.is_approved
    from cycle_project_evaluations e
    join submission_cycles sc on sc.id = e.cycle_id
    join cycle_projects cp    on cp.id = e.project_id
    left join profiles p      on p.user_id = e.voter_id
    where $1::int is null or sc.year = $1::int
  `,
    [ano ?? null],
  );
}

// --------------------------------------------------------------- orçamento

export interface OrcamentoRow {
  id: string;
  year: number;
  status: string | null;
  faturamento: number | null;
  porcentagem_doacao: number | null;
  margem_seguranca: number | null;
  custos_administrativos: number | null;
  ofertas_aprovadas: number | null;
  valor_ministerio_saude: number | null;
  total_conveniados: number | null;
  total_nao_conveniados: number | null;
  updated_at: Date | null;
}

/**
 * Todas as linhas de orçamento anual — inclusive as de teste.
 * A escolha da linha válida acontece na camada de datasets (ver
 * `escolherLinhaOrcamento`), porque em 2025 as linhas `confirmado`
 * são justamente as de teste.
 */
export function fetchOrcamentos(): Promise<OrcamentoRow[]> {
  return query<OrcamentoRow>(`
    select id, year, status, faturamento, porcentagem_doacao, margem_seguranca,
           custos_administrativos, ofertas_aprovadas, valor_ministerio_saude,
           total_conveniados, total_nao_conveniados, updated_at
    from resource_allocations
    order by year, status
  `);
}

// ------------------------------------------------- derivados por instituição

export interface InstituicaoDerivadaRow {
  institution_id: string;
  institution_name: string;
  is_conveniada: boolean | null;
  projetos_2025: number;
  projetos_2026: number;
  aprovados_2025: number;
  valor_aprovado_2025: number;
  situacao: string;
}

/**
 * Colunas *deriváveis* do enriquecimento (docs/enriquecimento-dados.md):
 * recebido em 2025 e novo/recorrente saem por SELECT — não se digita nada.
 */
export function fetchInstituicoesDerivadas(): Promise<
  InstituicaoDerivadaRow[]
> {
  return query<InstituicaoDerivadaRow>(`
    select
      i.id   as institution_id,
      i.name as institution_name,
      i.is_conveniada,
      coalesce(count(*) filter (where sc.year = 2025), 0)::int as projetos_2025,
      coalesce(count(*) filter (where sc.year = 2026), 0)::int as projetos_2026,
      coalesce(count(*) filter (where sc.year = 2025 and cp.status::text = 'aprovado'), 0)::int
        as aprovados_2025,
      coalesce(
        sum(cp.approved_amount) filter (where sc.year = 2025 and cp.status::text = 'aprovado'),
        0
      ) as valor_aprovado_2025,
      -- vocabulário mantido igual ao do CSV original ('recorrente' / 'novo (no
      -- sistema)'), com dois casos que faltavam distinguidos.
      case
        when count(*) filter (where sc.year = 2025) > 0
         and count(*) filter (where sc.year = 2026) > 0 then 'recorrente'
        when count(*) filter (where sc.year = 2026) > 0 then 'novo (no sistema)'
        when count(*) filter (where sc.year = 2025) > 0 then 'apenas 2025'
        else 'sem projetos'
      end as situacao
    from institutions i
    left join cycle_projects cp      on cp.institution_id = i.id
    left join submission_cycles sc   on sc.id = cp.cycle_id
    group by i.id, i.name, i.is_conveniada
    order by valor_aprovado_2025 desc, i.name
  `);
}

// ------------------------------------------------------ prestação de contas

export interface PrestacaoContasRow {
  project_id: string;
  institution_id: string | null;
  year: number;
  quarter: number;
  status: string | null;
  submitted_at: Date | null;
  cycle_year: number | null;
}

export function fetchPrestacaoContas(): Promise<PrestacaoContasRow[]> {
  return query<PrestacaoContasRow>(`
    select r.project_id, r.institution_id, r.year, r.quarter, r.status, r.submitted_at,
           sc.year as cycle_year
    from cycle_project_accountability_reports r
    left join submission_cycles sc on sc.id = r.cycle_id
    order by r.year, r.quarter
  `);
}
