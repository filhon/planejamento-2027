# Planejamento 2027 — Painel Consultivo Hebron ASEEC

> Contexto para qualquer sessão futura do Claude Code retomar o trabalho.
> **Leia também os docs em [`docs/`](docs/) antes de implementar.**

## O que é este projeto

Construir um **dashboard consultivo interativo** (BI) para o planejamento de
**remessas** (ciclos anuais) de projetos missionários da **Hebron ASEEC**.
O painel será usado **ao vivo, na reunião de planejamento**, para decidir a
aprovação e a alocação de recursos dos projetos.

- **Foco atual:** Remessa **2026** (em avaliação). Ciclo **2025** entra como comparativo.
- **Não usar Looker** — o cliente quer personalização total. Construir app próprio.
- **Peça central:** uma página de **mapa-múndi** com países pintados (choropleth) por
  volume de projetos, filtros de continente/status/categoria e KPIs.
- **REGRA ABSOLUTA:** o banco de origem é **SOMENTE LEITURA** (só `SELECT`). Nunca
  escrever, criar tabelas/views ou alterar nada nele — deve ser preservado. Toda
  normalização e todo dado novo vivem FORA, em `data/*.csv` (ver enriquecimento abaixo).

## Estado atual (2026-09-04)

**Fase 1 (fundação de dados) implementada** — camada TypeScript em [`src/lib/`](src/lib/)
que lê a origem só com `SELECT` e junta com `data/*.csv` em memória. Nada foi criado
na origem. Manual da camada: [`docs/fase1-fundacao-dados.md`](docs/fase1-fundacao-dados.md).

```bash
npm install
npm run check          # relatório de sanidade contra os dados vivos (só SELECT)
npm test               # regras puras (país, guarda de leitura, orçamento, notas)
npm run enrich:regen   # regenera as colunas derivadas do CSV (preserva as curadas)
```

Datasets prontos para a UI (fachada com cache em `src/lib/cache.ts`):
`dados.ciclos()` · `dados.projetos(ano)` · `dados.locais(ano)` (choropleth) ·
`dados.resumo(ano)` (KPIs) · `dados.orcamento(ano)` · `dados.avaliacoes(ano)`;
`atualizar()` é o botão "Atualizar" da reunião.

**Próximo passo:** Fase 2 — app Next.js com a marca, API de leitura sobre `src/lib/`
e a página do Mapa-múndi.

### Planejamento (entregue antes)

- Diagnóstico completo do banco → [`docs/banco-de-dados.md`](docs/banco-de-dados.md)
- Plano do dashboard → [`docs/plano-dashboard.md`](docs/plano-dashboard.md)
- Normalização de país (de-para ISO) → [`docs/normalizacao-paises.md`](docs/normalizacao-paises.md)
- **Enriquecimento sem tocar na origem** → [`docs/enriquecimento-dados.md`](docs/enriquecimento-dados.md)
- Dados do enriquecimento (fonte de verdade): [`data/country_map.csv`](data/country_map.csv), [`data/institution_enrichment.csv`](data/institution_enrichment.csv)
- Esquema opcional de banco próprio do dashboard → [`docs/country_map.sql`](docs/country_map.sql) (NUNCA na origem)
- Script do papel de leitura, **para a equipe rodar** → [`docs/bi_readonly.sql`](docs/bi_readonly.sql)
- Manual de marca (fornecido pelo cliente) → [`.docs/Identidade Visual da Hebron Aseec.md`](.docs/Identidade%20Visual%20da%20Hebron%20Aseec.md)

Artefatos visuais publicados (versão apresentação, claude.ai):

- Diagnóstico do banco: https://claude.ai/code/artifact/ef01dc43-ce25-4998-98ab-1589ec5c5caa
- Plano do dashboard: https://claude.ai/code/artifact/10441c8c-fcb9-463c-834c-5bab2313a047

### Pendências abertas com a equipe (levantadas na Fase 1)

1. **Orçamento 2025:** as linhas `confirmado` de `resource_allocations` são de teste;
   a linha real está como `rascunho`. Qual vale?
2. **Teto de conveniadas em 2026 = R$ 0** na linha confirmada — ainda não definido?
3. **Colunas curadas** do enriquecimento (anos de parceria, tipo, observações) seguem
   vazias nas 146 instituições — preenchimento é da equipe, no CSV.
4. Trocar a credencial `postgres` por `bi_readonly` ([`docs/bi_readonly.sql`](docs/bi_readonly.sql));
   atenção ao RLS (39 tabelas com RLS; sem `BYPASSRLS` o papel lê zero linha).

## Acesso ao banco (somente leitura, por acordo)

- Supabase / **PostgreSQL 17.4**. Credenciais em [`.env.local`](.env.local) (NÃO commitar).
- ⚠️ O host direto (`db.*.supabase.co`) é **IPv6-only**; esta máquina não tem IPv6.
  **Use sempre o pooler (IPv4):**
  - host `aws-1-us-east-1.pooler.supabase.com`, porta `5432` (session pooler)
  - user `postgres.yhauleemahxvbrdkdwju`, db `postgres`, `sslmode=require`
- ⚠️ **A credencial é o papel `postgres` (dono, escrita total)** — "read only" é só acordo,
  não restrição técnica. **Só executar `SELECT`/introspecção — nada de escrita/DDL na origem.**
  Recomendado à equipe: criar papel `bi_readonly` com `GRANT SELECT` nas tabelas existentes
  (isso não altera dados). O dashboard nunca escreve na origem.
- Ferramenta de acesso: Python + `psycopg` (v3). A senha contém `£` (UTF-8), então
  leia com encoding UTF-8. Exemplos de scripts na pasta scratchpad da sessão original.

```python
import psycopg
conn = psycopg.connect(host="aws-1-us-east-1.pooler.supabase.com", port=5432,
    dbname="postgres", user="postgres.yhauleemahxvbrdkdwju",
    password="<de .env.local>", sslmode="require", autocommit=True)
```

## Modelo de dados — o essencial

Duas gerações convivem: **usar só as tabelas `cycle_*`** (as legadas `projects…`
duplicam o ciclo 2025). Tudo gira em `submission_cycles` (a remessa/ano) → `cycle_projects`.

- `submission_cycles` — a remessa (2025 fechado, 2026 aberto).
- `cycle_projects` — o projeto: título, categoria, `country`/`city`/`state`,
  `requested_amount`/`approved_amount`, `status`, `institution_id`, `area_sensivel`.
- Satélites por `project_id`+`cycle_id`: `cycle_project_evaluations` (nota),
  `cycle_project_votes`, `cycle_project_status_history`, `cycle_project_budget_allocations`,
  `cycle_budget_reservations`, `cycle_project_accountability_reports`.
- `institutions` (146, campo `is_conveniada`), `profiles` (→ `auth.users`).
- Nomes de pessoas: juntar via `profiles.user_id` (nunca ler schema `auth` direto).

## Regras de negócio / higiene de dados

> Todas já implementadas em `src/lib/` e cobertas por `npm run check`.

1. Fonte única = `cycle_*` (ignorar tabelas legadas nas métricas).
2. `resource_allocations` tem linhas de teste, e **`status='confirmado'` não basta**:
   em 2025 as `confirmado` são justamente as de teste e a linha real é `rascunho`.
   Regra: `confirmado` **com teto plausível** (≥ R$ 100 mil); senão, maior teto + alerta.
3. **Local = país** (descartar cidade/estado como dimensão). `state` é texto livre e sujo.
   Normalizar `country` (PT) → ISO-3 + continente via `data/country_map.csv` (join no app).
4. `country='Outro'` (17 registros) = projetos de **área sensível**; 9 têm o país real
   em `state`/`city` (só se o texto apontar um único país e não citar região multi-país);
   os outros 8 viram "Multi-país / sensível" (contam nos KPIs, não pintam no mapa).
5. Notas infladas (984/1742 avaliações = 10,0): mostrar mediana + dispersão, não só média.

## Enriquecimento (dados que não existem na origem)

Campos novos para a avaliação (ex.: **anos de parceria**, **novo/recorrente**,
**valor recebido em 2025**) vivem FORA da origem — ver [`docs/enriquecimento-dados.md`](docs/enriquecimento-dados.md).
Regra: **derivável** (recebido 2025, recorrência) → calcular por `SELECT` na origem;
**curado** (anos de parceria, observações) → `data/institution_enrichment.csv`.
Junção com a origem sempre pelos uuids (`institutions.id`, `cycle_projects.id`), no app.

## Identidade visual (Hebron ASEEC)

- Cores: **Azul `#202C85`** (base), **Laranja `#EA5A06`** (ação), **Verde `#A1C520`**
  e **Azul-claro `#07B4E7`** (destaques).
- Fontes: **Parkinsans** (títulos) + **Titillium Web** (corpo) — ambas no Google Fonts.
- Motivo gráfico: **círculos** (pessoas/comunhão). Assinaturas sobre branco ou azul.
- Tagline: "Instrumentos de Deus na transformação de vidas."
- Choropleth = ramp azul único (claro→`#202C85`); categorias = barras ordenadas;
  status = paleta semântica (verde/laranja/azul-claro/vermelho/neutro).

## Stack

**Já em uso (Fase 1):** TypeScript ESM · `pg` (driver, só SELECT) · `csv-parse`/`csv-stringify`
(enriquecimento) · `tsx` para os scripts. Camada de dados em `src/lib/`, com cache de
15 min e `atualizar()`.

**Fase 2 em diante:** Next.js + React sobre `src/lib/` · Recharts/visx (gráficos) ·
react-simple-maps + TopoJSON mundial (mapa, casando por **ISO-3**) · rotas de API que
apenas chamam a fachada `dados.*` · botão "Atualizar" → `atualizar()`.
Nenhuma escrita na origem em nenhum momento.
