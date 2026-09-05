# Enriquecimento e normalização — SEM tocar no banco de origem

> **Regra absoluta:** o banco de origem (Supabase da aplicação) é **somente leitura**.
> Nunca `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER` — nem views, nem tabelas.
> Só `SELECT`. Toda normalização e todo dado novo vivem **fora**, numa camada nossa,
> e são unidos aos dados de origem **na hora da consulta** (no app/API).

## O problema

Precisamos de informações que **não existem** no banco original e são importantes para a
avaliação — por exemplo:

- o projeto/instituição é **novo ou antigo**?
- **quantos anos de parceria** com a Hebron?
- **quanto foi recebido em 2025**?
- notas/observações de avaliação da equipe.

Como o banco é intocável, esses dados moram numa **camada de enriquecimento** separada.

## Princípio: derivável vs. curado

Antes de "inventar" um campo, checar se ele já sai da origem por cálculo.

| Informação                                      | Origem                       | Como obter                                                                                                                         |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Valor recebido em 2025**                      | ✅ **Derivável**             | `approved_amount` dos aprovados 2025, ou reservas liberadas (`cycle_budget_reservations.released_at`). Totais batem: ~R$ 11,42 mi. |
| **Novo vs. recorrente (no sistema)**            | ✅ **Derivável** (2025–2026) | Instituição teve projeto em 2025? 71 em ambos, 32 novas em 2026.                                                                   |
| **Anos de parceria (histórico real)**           | ✋ **Curado**                | Não está no banco (`institutions.created_at` = 2025, é a criação do registro). Dado externo.                                       |
| **Tipo de parceria / observações de avaliação** | ✋ **Curado**                | Digitado pela equipe.                                                                                                              |

> Regra: **derivável → calcular na nossa camada** (SELECT read-only). **Curado → planilha/loja
> nossa.** Nunca gravar nada disso na origem.

## Onde os dados novos moram

Dois arquivos versionados no repositório, em [`../data/`](../data/) — a fonte de verdade
do enriquecimento (sem banco nenhum para administrar):

- [`data/country_map.csv`](../data/country_map.csv) — normalização de país → ISO-3 + continente.
- [`data/institution_enrichment.csv`](../data/institution_enrichment.csv) — uma linha por
  instituição. Colunas **derivadas já preenchidas** (geradas da origem) + colunas **curadas em
  branco** para a equipe preencher:
  - derivadas: `projetos_2025`, `projetos_2026`, `aprovados_2025`,
    `valor_aprovado_2025_derivado`, `situacao_no_sistema_derivada`.
  - curadas: `parceria_desde_ano`, `tipo_parceria`, `observacoes_avaliacao`.
  - chave de junção: `institution_id` (uuid **da origem**, estável).

Editáveis no Excel/Google Sheets, revisáveis por git. Para regerar as colunas derivadas,
rodar o script que lê a origem (só SELECT) e reescreve o CSV.

## Como se juntam (no app/API)

```
Origem (Supabase, SOMENTE SELECT) ─┐
                                   ├─▶ API do dashboard faz o JOIN pelos uuids ─▶ UI
data/*.csv (enriquecimento nosso) ─┘   (país normalizado, anos de parceria,
                                        recebido 2025, novo/recorrente...)
```

- `cycle_projects.country` → casa com `country_map.csv` por `lower(trim(country))` → ISO-3 + continente.
- `institutions.id` → casa com `institution_enrichment.csv` por `institution_id`.
- `anos_de_parceria = ano_atual − parceria_desde_ano` (do CSV).
- `recebido_2025` = derivado da origem (ver SELECT abaixo) — não precisa digitar.

## Consultas de leitura para os campos deriváveis (SOMENTE SELECT)

```sql
-- Valor "recebido" em 2025 por instituição (proxy = aprovado dos aprovados)
select i.id, i.name, sum(cp.approved_amount) filter (where cp.status='aprovado') as recebido_2025
from cycle_projects cp
join submission_cycles sc on sc.id = cp.cycle_id
join institutions i on i.id = cp.institution_id
where sc.year = 2025
group by i.id, i.name;

-- Alternativa mais próxima de "efetivamente liberado" (reservas liberadas)
select cp.institution_id, sum(r.amount) as liberado_2025
from cycle_budget_reservations r
join submission_cycles sc on sc.id = r.cycle_id
join cycle_projects cp on cp.id = r.project_id
where sc.year = 2025 and r.released_at is not null
group by cp.institution_id;

-- Novo vs. recorrente (dentro dos ciclos existentes)
select cp.institution_id,
       bool_or(sc.year = 2025) as teve_2025,
       bool_or(sc.year = 2026) as teve_2026
from cycle_projects cp
join submission_cycles sc on sc.id = cp.cycle_id
group by cp.institution_id;
```

## Evolução futura (opcional)

Se a equipe precisar **editar ao vivo, em conjunto** (ex.: observações durante a reunião),
trocar os CSVs por um **banco próprio do dashboard** (um novo projeto Supabase/Neon, nosso,
read-write) + uma tela de admin simples. O esquema desse banco está em
[`country_map.sql`](country_map.sql) — que roda **no banco do dashboard, NUNCA na origem**.
A lógica de junção não muda: sempre pelos uuids da origem.
