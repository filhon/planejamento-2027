# Banco de dados — diagnóstico e modelo

Versão apresentável (artefato): https://claude.ai/code/artifact/ef01dc43-ce25-4998-98ab-1589ec5c5caa
Snapshot: 2026-09-04 · PostgreSQL 17.4 (Supabase).

## Conexão

Ver [`../CLAUDE.md`](../CLAUDE.md#acesso-ao-banco-somente-leitura-por-acordo). Resumo:

- Pooler IPv4: `aws-1-us-east-1.pooler.supabase.com:5432` (host direto é IPv6-only).
- user `postgres.yhauleemahxvbrdkdwju`, db `postgres`, `sslmode=require`, senha em `.env.local`.
- ⚠️ Papel `postgres` = escrita total. Só rodar `SELECT`. Recomendar `bi_readonly` à equipe.
- A camada de dados da Fase 1 já cuida disso: [`fase1-fundacao-dados.md`](fase1-fundacao-dados.md).

### RLS (descoberto na Fase 1)

As **39 tabelas** de `public` têm Row Level Security ligada, e as políticas
existentes são todas para o papel `authenticated` (o app). O papel `postgres`
enxerga tudo porque tem `BYPASSRLS` — não porque as tabelas estejam abertas.
Consequência prática: um papel `bi_readonly` criado sem `BYPASSRLS` conecta
normalmente e recebe **zero linha**. O script [`bi_readonly.sql`](bi_readonly.sql)
(para a equipe rodar) já trata disso.

## Duas gerações (importante)

- **`cycle_*`** (com `cycle_id → submission_cycles`) = **fonte de verdade** (2025 + 2026).
- **`projects`, `project_votes`, `project_evaluations`, …** = legado; **duplicam o ciclo 2025**
  (contagens de votos/avaliações idênticas). Ignorar nas métricas.

## Núcleo por ciclo (usar estas)

| Tabela                                    | Linhas | Conteúdo                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submission_cycles`                       | 2      | A remessa/ano: `year`, `name`, `status`, `voting_model`, `annual_budget`, janelas.                                                                                                                                                                                                             |
| `cycle_projects`                          | 526    | Projeto: `title`, `description`, `category`, `country`/`city`/`state`, `requested_amount`, `approved_amount`, `status`, `institution_id`, `submitter_id`, `timeline_months`, `natureza`, `metodologia`, `indicadores`(jsonb), `equipe`(jsonb), `area_sensivel`, `parecer_aseec_*`, `cycle_id`. |
| `cycle_project_evaluations`               | 1.742  | `is_approved`, `final_score` numeric(3,1), `general_comments`. Único (project, voter).                                                                                                                                                                                                         |
| `cycle_project_votes`                     | 6.968  | `vote_type` (eliminatório/ranking), `criterion_key/name`, `vote_value` (sim/não), `score_value`.                                                                                                                                                                                               |
| `cycle_project_status_history`            | 1.325  | `old_status` → `new_status`, `changed_by`, `changed_at`.                                                                                                                                                                                                                                       |
| `cycle_project_budget_allocations`        | 223    | `allocated_amount`, `monthly_amount`, `approved_installments`, `source_type`.                                                                                                                                                                                                                  |
| `cycle_budget_reservations`               | 232    | `amount`, `reserved_at`, `released_at`.                                                                                                                                                                                                                                                        |
| `cycle_project_attachments`               | 1.792  | anexos (metadados).                                                                                                                                                                                                                                                                            |
| `cycle_project_accountability_reports`    | 27     | prestação de contas trimestral: `quarter`, `year`, `status`.                                                                                                                                                                                                                                   |
| `cycle_accountability_report_attachments` | 124    | anexos das prestações.                                                                                                                                                                                                                                                                         |
| `cycle_revenue_forecasts`                 | 0      | previsão de receita mensal (sem uso).                                                                                                                                                                                                                                                          |
| `cycle_results_publications`              | 1      | publicação do resultado do ciclo.                                                                                                                                                                                                                                                              |

## Instituições, pessoas, acesso

| Tabela                         | Linhas | Conteúdo                                                                                                                             |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `institutions`                 | 146    | `name`, `cnpj` (único), contato, dados bancários/PIX, `is_conveniada` (29 sim / 117 não).                                            |
| `profiles`                     | 172    | `user_id`(→auth.users), `name`, `role`, `institution_id`, `is_active`. Papéis: 161 instituicao, 6 conselheiro, 3 diretor, 2 gerente. |
| `institution_documents`        | 735    | tipo, `status` (438 enviado / 297 pendente), aprovação.                                                                              |
| `institution_activity_history` | 4.036  | auditoria por instituição.                                                                                                           |
| `institution_allocations`      | 29     | valor alocado por instituição.                                                                                                       |
| `invitation_codes`             | 184    | códigos de convite.                                                                                                                  |
| `invitation_code_logs`         | 723    | tentativas de validação.                                                                                                             |
| `team_invitations`             | 0      | convites por token (sem uso).                                                                                                        |

## Orçamento / recursos (anual)

| Tabela                 | Linhas | Conteúdo                                                                                                                                                                                                                  |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resource_allocations` | 5      | base do orçamento: `faturamento`, `%doacao`, `margem_seguranca`, `custos_administrativos`, `ofertas_aprovadas`, `valor_ministerio_saude`, `total_conveniados/nao`. ⚠️ contém linhas de teste — **ver a correção abaixo**. |

> ⚠️ **Correção (2026-09-04, Fase 1):** `status='confirmado'` **não** basta para
> separar o joio. Em 2025 as três linhas `confirmado` são as de teste (faturamento
> R$ 10 mil, tetos de 5/94/94) e a linha real do ano está como `rascunho`
> (faturamento R$ 510 mi, teto R$ 16,8 mi). Em 2026 a `confirmado` é a boa
> (teto R$ 14,5 mi), mas com `total_conveniados = 0`. A camada de dados escolhe
> a linha `confirmado` **com teto plausível** e, se não houver, a de maior teto,
> sempre com alerta — ver [`fase1-fundacao-dados.md`](fase1-fundacao-dados.md).
> | `project_allocations` | 2 | fechamento anual. |
> | `project_budget_allocations` | 223 | alocação por projeto (versão legada). |

Config ASEEC: `aseec_priority_areas` (10), `aseec_strategic_objectives` (9),
`aseec_values` (7), `aseec_tags` (44), `aseec_system_settings` (1) — norteiam a avaliação.

Hospedagem/flat (subsistema novo, pouco uso): `accommodation_availability` (135),
`accommodation_reservations` (0), `reservation_companions` (0).
Operacional: `client_error_logs` (10.766, erros de front-end — saúde do sistema, não gestão).

## Enums principais

- **`project_status`** (14): rascunho · submetido · em-analise · em-validacao ·
  devolvido-para-correcao · classificado · para-votacao · em-votacao · aprovado ·
  em-andamento · concluido · rejeitado · reprovado · cancelado.
- **`project_category`** (7): construcao-reforma · projetos-sociais-cristaos ·
  missoes-transculturais · missoes-nacionais · saude · educacao · outros.
- **`vote_type`**: eliminatório · ranking · **`vote_value`**: sim · não.
- **`reservation_status`**: pendente · aprovada · rejeitada · cancelada · concluida.
- **`invitation_status`**: pending · accepted · expired · cancelled.

## Distribuições-chave (snapshot)

- **2026 por status:** em-validacao 237 · rejeitado 10 · rascunho 9 · devolvido 6 (total 262).
- **2025 por status:** aprovado 223 · rejeitado 21 · rascunho 11 · em-validacao 6 · classificado 3.
- **Categoria (2025+2026), solicitado→aprovado:** missões-transculturais R$9,2mi→3,7mi ·
  missões-nacionais 4,5→2,0 · construção-reforma 16,6→2,6 · educação 3,2→0,9 ·
  sociais-cristãos 3,3→1,3 · outros 2,3→0,7 · saúde 0,56→0,17.
- **Notas 2025:** 984/1.742 = exatamente 10,0 (inflação — usar mediana/dispersão).
