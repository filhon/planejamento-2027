-- ============================================================
-- OPCIONAL — esquema do BANCO PRÓPRIO DO DASHBOARD (nosso), read-write.
--
-- ⚠️ NÃO RODAR NO BANCO DE ORIGEM. A origem é SOMENTE LEITURA (só SELECT).
-- Use este arquivo apenas se, no futuro, a equipe quiser editar o
-- enriquecimento ao vivo/em conjunto e trocar os CSVs de data/ por um
-- banco próprio (um novo projeto Supabase/Neon, separado da origem).
--
-- A fonte de verdade ATUAL do enriquecimento são os CSVs em data/.
-- O join com a origem é feito no app/API pelos uuids — nunca por FK
-- entre bancos.  Ver docs/enriquecimento-dados.md.
-- ============================================================

-- Normalização de país (espelha data/country_map.csv)
create table if not exists country_map (
  raw_country text primary key,   -- lower(trim(country)) da origem
  iso3        char(3),
  name_pt     text,
  continent   text
);
-- popular a partir de data/country_map.csv (\copy country_map from '...' csv header)

-- Enriquecimento por instituição (curado + snapshot dos derivados)
create table if not exists institution_enrichment (
  institution_id  uuid primary key,   -- = institutions.id na ORIGEM (sem FK)
  parceria_desde_ano   int,           -- CURADO
  tipo_parceria        text,          -- CURADO
  observacoes_avaliacao text,         -- CURADO
  atualizado_em   timestamptz default now()
);

-- Enriquecimento por projeto (campos extras de avaliação, curados)
create table if not exists project_enrichment (
  project_id      uuid primary key,   -- = cycle_projects.id na ORIGEM (sem FK)
  observacoes     text,
  destaque        boolean default false,
  atualizado_em   timestamptz default now()
);

-- ============================================================
-- Consultas de LEITURA na ORIGEM (somente SELECT) para os deriváveis.
-- Rodam contra o banco de origem; o app une com as tabelas acima.
-- ============================================================
-- recebido_2025 (proxy = aprovado dos aprovados de 2025):
--   select i.id, sum(cp.approved_amount) filter (where cp.status='aprovado')
--   from cycle_projects cp
--   join submission_cycles sc on sc.id=cp.cycle_id
--   join institutions i on i.id=cp.institution_id
--   where sc.year=2025 group by i.id;
