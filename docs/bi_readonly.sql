-- ============================================================
-- Papel bi_readonly — PARA A EQUIPE DA HEBRON RODAR NA ORIGEM.
--
-- ⚠️ O time do painel NÃO roda este arquivo. A regra do projeto é: da nossa
-- parte, só `SELECT` na origem. Este script existe porque hoje a credencial
-- disponível é o papel `postgres` (escrita total) e "somente leitura" é apenas
-- um acordo — com bi_readonly vira restrição técnica de verdade.
--
-- Ele NÃO altera nenhum dado: só cria um papel e concede SELECT.
-- Rodar no SQL Editor do Supabase (Dashboard → SQL), como `postgres`.
-- ============================================================

-- 1. Papel de leitura -----------------------------------------------------
--    Troque a senha antes de rodar e guarde-a no gerenciador de senhas.
create role bi_readonly with login password 'TROQUE-ESTA-SENHA';

grant connect on database postgres to bi_readonly;
grant usage   on schema public     to bi_readonly;

grant select on all tables    in schema public to bi_readonly;
grant select on all sequences in schema public to bi_readonly;

-- Tabelas criadas depois também nascem legíveis para o painel:
alter default privileges in schema public grant select on tables to bi_readonly;

-- 2. RLS — o passo que costuma ser esquecido ------------------------------
--    Todas as 39 tabelas de `public` têm Row Level Security ligada e as
--    políticas existentes são para o papel `authenticated` (o app). O papel
--    `postgres` só enxerga tudo porque tem BYPASSRLS; um papel novo, sem isso,
--    conecta normalmente e recebe ZERO linha em todo SELECT.
--
--    Opção A (recomendada, 1 linha): dar BYPASSRLS ao papel de leitura.
--    Ele continua sem poder escrever — BYPASSRLS não concede INSERT/UPDATE.
alter role bi_readonly with bypassrls;

--    Opção B (sem BYPASSRLS): criar uma política de leitura por tabela.
--    Mais verboso e precisa ser repetido a cada tabela nova. Exemplo:
--
--    create policy bi_readonly_select on public.cycle_projects
--      for select to bi_readonly using (true);

-- 3. Conferência ----------------------------------------------------------
--    Depois de rodar, conectar COM bi_readonly (mesmo pooler IPv4:
--    aws-1-us-east-1.pooler.supabase.com:5432, user `bi_readonly.<project-ref>`)
--    e verificar:
--
--      select count(*) from cycle_projects;              -- ~528 (2025 + 2026)
--      select count(*) from submission_cycles;           -- deve dar 2
--      insert into cycle_projects (id) values (gen_random_uuid());
--                                                        -- DEVE falhar: permission denied
--
--    Se os counts derem 0, o passo 2 (RLS) não foi aplicado.

-- 4. Depois -------------------------------------------------------------
--    Entregar a senha do bi_readonly ao time do painel para substituir a
--    credencial `postgres` no .env.local. Nada mais muda: a camada de dados
--    (src/lib/) já é somente leitura por construção.
