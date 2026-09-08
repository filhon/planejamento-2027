import { query, queryOne } from "./db";
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

/** Chave mínima de todo projeto de todas as remessas — resolve o vínculo entre ciclos. */
export interface ProjetoChaveRow {
  id: string;
  year: number;
  title: string;
  status: string;
  institution_id: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  liberado: number | null;
}

/**
 * Todos os projetos, de todos os ciclos, em 8 colunas.
 *
 * Existe separado de `fetchProjetos` porque o vínculo novo × renovação
 * (docs/fase5-projetos.md) precisa olhar a remessa ANTERIOR enquanto monta a
 * atual — e puxar `fetchProjetos()` inteiro só para ler `approved_amount` do
 * ano passado sairia caro (laterais de avaliação, orçamento e reserva).
 */
export function fetchProjetosChave(): Promise<ProjetoChaveRow[]> {
  return query<ProjetoChaveRow>(`
    select cp.id, sc.year, cp.title, cp.status::text as status, cp.institution_id,
           cp.requested_amount, cp.approved_amount,
           (select sum(r.amount) filter (where r.released_at is not null)
              from cycle_budget_reservations r where r.project_id = cp.id) as liberado
    from cycle_projects cp
    join submission_cycles sc on sc.id = cp.cycle_id
    order by sc.year, cp.title
  `);
}

// ------------------------------------------------------------- avaliadores

export interface AvaliadorRow {
  user_id: string;
  name: string | null;
  role: string;
}

/**
 * Quem divide as pastas dos projetos novos: diretores e conselheiros ativos.
 * A equipe ASEEC (papel `gerente`) fica de fora — ela cuida das renovações.
 */
export function fetchAvaliadores(): Promise<AvaliadorRow[]> {
  return query<AvaliadorRow>(`
    select user_id, name, role
    from profiles
    where is_active and role in ('diretor', 'conselheiro')
    order by role, name
  `);
}

// -------------------------------------------------- detalhe de um projeto

export interface ProjetoDetalheRow {
  description: string | null;
  justification: string | null;
  expected_results: string | null;
  natureza: string | null;
  metodologia: string | null;
  parcerias: string | null;
  rede_social: string | null;
  indicadores: unknown;
  equipe: unknown;
  parecer_aseec_texto: string | null;
  parecer_aseec_tags: string[] | null;
  reviewer_notes: string | null;
  start_date: Date | null;
  end_date: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
  reviewed_at: Date | null;
  inst_id: string | null;
  inst_nome: string | null;
  inst_cnpj: string | null;
  inst_conveniada: boolean | null;
  inst_responsavel: string | null;
  inst_email: string | null;
  inst_telefone: string | null;
}

/** Os campos longos do projeto — só a página de detalhe os carrega. */
export function fetchProjetoDetalhe(
  id: string,
): Promise<ProjetoDetalheRow | null> {
  return queryOne<ProjetoDetalheRow>(
    `
    select cp.description, cp.justification, cp.expected_results, cp.natureza,
           cp.metodologia, cp.parcerias, cp.rede_social, cp.indicadores, cp.equipe,
           cp.parecer_aseec_texto, cp.parecer_aseec_tags, cp.reviewer_notes,
           cp.start_date, cp.end_date, cp.created_at, cp.updated_at, cp.reviewed_at,
           i.id as inst_id, i.name as inst_nome, i.cnpj as inst_cnpj,
           i.is_conveniada as inst_conveniada, i.responsavel_legal as inst_responsavel,
           i.email as inst_email, i.telefone as inst_telefone
    from cycle_projects cp
    left join institutions i on i.id = cp.institution_id
    where cp.id = $1
  `,
    [id],
  );
}

export interface AnexoRow {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string;
  uploaded_at: Date | null;
  uploader_name: string | null;
}

/** Anexos do projeto (e do projeto anterior, quando houver vínculo). */
export function fetchAnexos(projetoIds: string[]): Promise<AnexoRow[]> {
  return query<AnexoRow>(
    `
    select a.id, a.project_id, a.file_name, a.file_path, a.file_size,
           a.file_type, a.uploaded_at, p.name as uploader_name
    from cycle_project_attachments a
    left join profiles p on p.user_id = a.uploaded_by
    where a.project_id = any($1::uuid[])
    order by a.file_type, a.uploaded_at
  `,
    [projetoIds],
  );
}

export interface AvaliacaoProjetoRow {
  voter_name: string | null;
  voter_role: string | null;
  is_approved: boolean | null;
  final_score: number | null;
  general_comments: string | null;
  submitted_at: Date | null;
}

/** O parecer de cada conselheiro neste projeto, com o comentário aberto. */
export function fetchAvaliacoesDoProjeto(
  id: string,
): Promise<AvaliacaoProjetoRow[]> {
  return query<AvaliacaoProjetoRow>(
    `
    select p.name as voter_name, p.role as voter_role, e.is_approved,
           e.final_score, e.general_comments, e.submitted_at
    from cycle_project_evaluations e
    left join profiles p on p.user_id = e.voter_id
    where e.project_id = $1
    order by e.final_score desc nulls last, p.name
  `,
    [id],
  );
}

export interface VotoProjetoRow {
  voter_name: string | null;
  vote_type: string;
  criterion_key: string | null;
  criterion_name: string | null;
  vote_value: string | null;
  score_value: number | null;
  comments: string | null;
}

export function fetchVotosDoProjeto(id: string): Promise<VotoProjetoRow[]> {
  return query<VotoProjetoRow>(
    `
    select p.name as voter_name, v.vote_type::text as vote_type, v.criterion_key,
           v.criterion_name, v.vote_value::text as vote_value, v.score_value, v.comments
    from cycle_project_votes v
    left join profiles p on p.user_id = v.voter_id
    where v.project_id = $1
    order by v.vote_type, v.criterion_name, p.name
  `,
    [id],
  );
}

export interface HistoricoRow {
  old_status: string | null;
  new_status: string;
  changed_at: Date | null;
  changed_by_name: string | null;
}

export function fetchHistoricoDoProjeto(id: string): Promise<HistoricoRow[]> {
  return query<HistoricoRow>(
    `
    select h.old_status::text as old_status, h.new_status::text as new_status,
           h.changed_at, p.name as changed_by_name
    from cycle_project_status_history h
    left join profiles p on p.user_id = h.changed_by
    where h.project_id = $1
    order by h.changed_at
  `,
    [id],
  );
}

export interface RelatorioDetalheRow {
  id: string;
  project_id: string;
  quarter: number;
  year: number;
  status: string | null;
  project_progress: string | null;
  objectives_achieved: string | null;
  changes_or_delays: string | null;
  submitted_at: Date | null;
  reviewer_notes: string | null;
}

/** Prestação de contas, texto completo — é o que a equipe lê na renovação. */
export function fetchRelatoriosDosProjetos(
  projetoIds: string[],
): Promise<RelatorioDetalheRow[]> {
  return query<RelatorioDetalheRow>(
    `
    select r.id, r.project_id, r.quarter, r.year, r.status, r.project_progress,
           r.objectives_achieved, r.changes_or_delays, r.submitted_at, r.reviewer_notes
    from cycle_project_accountability_reports r
    where r.project_id = any($1::uuid[])
    order by r.year, r.quarter
  `,
    [projetoIds],
  );
}

export interface AnexoRelatorioRow {
  id: string;
  report_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string;
  uploaded_at: Date | null;
}

export function fetchAnexosDeRelatorios(
  relatorioIds: string[],
): Promise<AnexoRelatorioRow[]> {
  if (relatorioIds.length === 0) return Promise.resolve([]);
  return query<AnexoRelatorioRow>(
    `
    select id, report_id, file_name, file_path, file_size, file_type, uploaded_at
    from cycle_accountability_report_attachments
    where report_id = any($1::uuid[])
    order by uploaded_at
  `,
    [relatorioIds],
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

// ---------------------------------------------- documentos por instituição

export interface DocumentoRow {
  institution_id: string;
  document_type: string;
  status: string;
  n: number;
}

/**
 * Conformidade documental: já vem contada por instituição × tipo × status
 * (735 linhas viram ~730 contagens). Instituição sem nenhum documento
 * simplesmente não aparece — quem soma o universo é a camada de datasets.
 */
export function fetchDocumentos(): Promise<DocumentoRow[]> {
  return query<DocumentoRow>(`
    select d.institution_id, d.document_type, d.status, count(*)::int as n
    from institution_documents d
    group by 1, 2, 3
    order by 2, 3
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
