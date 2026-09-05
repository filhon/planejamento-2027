# Fase 1 — Fundação de dados (implementada)

Camada de dados do painel: lê a origem **só com `SELECT`**, junta em memória com
os CSVs de [`data/`](../data/) e entrega os datasets que a Fase 2 (esqueleto +
mapa) vai consumir. **Nenhum objeto foi criado no banco de origem.**

## Como rodar

```bash
npm install
npm run check              # relatório de sanidade contra os dados vivos (todos os ciclos)
npm run check -- 2026      # só um ciclo
npm test                   # regras puras (país, guarda, orçamento, estatística) — sem banco
npm run enrich:regen -- --dry   # o que mudaria no CSV de enriquecimento
npm run enrich:regen            # regenera as colunas derivadas
npm run typecheck
```

Credenciais em `.env.local` (não commitado) — modelo em [`.env.example`](../.env.example).
O host direto `db.*.supabase.co` é IPv6-only; a camada detecta esse formato e
reescreve sozinha para o pooler IPv4 (`aws-1-us-east-1.pooler.supabase.com`,
user `postgres.<project-ref>`). Não é preciso editar o `.env.local`.

## Arquivos

| Arquivo                                                         | Papel                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/lib/env.ts`](../src/lib/env.ts)                           | lê `.env.local` em UTF-8 (a senha tem `£`) e resolve host/usuário do pooler |
| [`src/lib/db.ts`](../src/lib/db.ts)                             | pool `pg` + **guarda de somente-leitura**                                   |
| [`src/lib/queries.ts`](../src/lib/queries.ts)                   | as consultas `SELECT` da origem, uma por assunto                            |
| [`src/lib/enrichment.ts`](../src/lib/enrichment.ts)             | leitura dos CSVs de `data/`                                                 |
| [`src/lib/geo.ts`](../src/lib/geo.ts)                           | normalização de país (inclui o resgate dos `'Outro'`)                       |
| [`src/lib/datasets.ts`](../src/lib/datasets.ts)                 | a junção: origem + CSVs → datasets                                          |
| [`src/lib/cache.ts`](../src/lib/cache.ts)                       | cache de 15 min + `atualizar()` (botão "Atualizar")                         |
| [`src/lib/index.ts`](../src/lib/index.ts)                       | ponto de entrada — é daqui que a API/UI importa                             |
| [`scripts/check-fase1.ts`](../scripts/check-fase1.ts)           | relatório de sanidade contra os dados vivos                                 |
| [`scripts/regen-enrichment.ts`](../scripts/regen-enrichment.ts) | regenera as colunas derivadas do CSV, preservando as curadas                |
| [`tests/unit.test.ts`](../tests/unit.test.ts)                   | 12 testes das regras puras (não tocam no banco)                             |

## Como a origem fica protegida

Três camadas, porque a credencial de hoje é o papel `postgres` (escrita total):

1. **Sessão travada no servidor** — toda conexão nova roda
   `SET default_transaction_read_only = on` no primeiro checkout. (A opção de
   startup `-c default_transaction_read_only=on` é ignorada em silêncio pelo
   pooler do Supabase; o `SET` funciona.)
2. **Guarda de SQL** — `assertReadOnly()` recusa qualquer coisa que não comece
   com `select`/`with`, bloqueia palavras de escrita e múltiplos comandos numa
   string só. O `npm run check` testa isso com 8 comandos proibidos.
3. **Superfície mínima** — o módulo `db.ts` não exporta nenhuma função de escrita.

O passo definitivo é técnico e depende da equipe: rodar
[`docs/bi_readonly.sql`](bi_readonly.sql) e trocar a credencial. Atenção ao RLS —
as 39 tabelas de `public` têm RLS ligada com políticas só para `authenticated`;
o papel `postgres` enxerga tudo porque tem `BYPASSRLS`. Um `bi_readonly` sem esse
atributo conecta e lê **zero linha**. O script trata disso.

## Datasets entregues

Fachada com cache em `dados.*` ([`src/lib/cache.ts`](../src/lib/cache.ts)):

| Dataset                 | O que é                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `dados.ciclos()`        | as remessas (2025 fechada, 2026 aberta)                                                                                         |
| `dados.projetos(ano)`   | **1 linha por projeto**, com país normalizado, satélites agregados (alocação, reserva, notas) e o enriquecimento da instituição |
| `dados.locais(ano)`     | 1 linha por país — insumo direto do choropleth e do "Top países"                                                                |
| `dados.resumo(ano)`     | KPIs do ciclo: projetos, países, % internacionais, solicitado/aprovado, quebras por status/categoria/continente                 |
| `dados.orcamento(ano)`  | teto (conveniadas / não) × solicitado × aprovado × reservado, com saldo e pressão da demanda                                    |
| `dados.avaliacoes(ano)` | nota por categoria e por conselheiro — **mediana, quartis e desvio**, não só média                                              |

`atualizar()` limpa o cache e os CSVs em memória: é o que o botão "Atualizar" da
reunião deve chamar.

## Regras de negócio implementadas

- **Só `cycle_*`.** As tabelas legadas `projects*` não são lidas em lugar nenhum.
- **Local = país.** `country` casa com [`data/country_map.csv`](../data/country_map.csv)
  por `lower(trim())` sem acento. Cidade e estado não são dimensão.
- **`'Outro'` (17 projetos, área sensível):** tenta-se o país real em `state`/`city`.
  O texto só é aceito quando aponta para **um único** país e **não** cita região
  multi-país ("Oriente Médio", "África Subsaariana", "Ásia"…). Resultado hoje:
  **9 resgatados** (Bangladesh, Camboja, Iêmen, Madagascar, Níger, Tadjiquistão,
  Zimbábue) e **8 em "Multi-país / sensível"** — que contam nos KPIs e não pintam
  o mapa. O casamento com o TopoJSON é por **ISO-3**, nunca por nome.
- **Nomes de pessoas** sempre por `profiles.user_id`; o schema `auth` não é lido.
- **Notas infladas:** `estatisticaNota()` devolve mediana, p25–p75, desvio e a
  fração de notas 10,0 (56,5% em 2025) — a média sozinha não deve ser exibida.
- **Orçamento:** ver a correção abaixo.

## Correção de higiene: `resource_allocations` em 2025

O diagnóstico dizia "filtrar `status='confirmado'`". Nos dados vivos isso se
inverte em 2025: as **três** linhas `confirmado` de 2025 são de teste
(faturamento R$ 10 mil, tetos de 5, 94 e 94 reais) e a linha real do ano está
como **`rascunho`** (faturamento R$ 510 mi, teto R$ 16,8 mi).

Regra implementada em `escolherLinhaOrcamento()`: usar a linha `confirmado`
**com teto plausível** (≥ R$ 100 mil); não havendo, usar a linha plausível de
maior teto e **registrar o alerta** em `orcamento.fonteOrcamento.alertas`. O
painel deve exibir esses alertas — a decisão de qual linha vale é da equipe.

## Números conferidos (execução de 2026-09-04)

|                    | 2025                                     | 2026                                     |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| Projetos           | 264                                      | **264 → 265** (docs traziam 262)         |
| Solicitado         | R$ 16,0 mi                               | **R$ 23,71 → 23,77 mi** (docs: ~23,6 mi) |
| Aprovado           | R$ 11,42 mi ✓                            | — (ciclo aberto)                         |
| Países alcançados  | 55                                       | 43                                       |
| Internacionais     | 35,6%                                    | 26,1%                                    |
| Teto de orçamento  | R$ 16,82 mi (linha `rascunho`)           | R$ 14,5 mi (`confirmado`)                |
| Pressão da demanda | 95%                                      | **164%**                                 |
| Avaliações         | 1.742 · mediana 10 · 56,5% de notas 10,0 | nenhuma ainda                            |

Avisos abertos que o `npm run check` repete a cada execução:

1. 2026 passou de 262 (snapshot dos docs) para 265 projetos — subiu de 264 para 265
   entre duas execuções do `check` na mesma tarde. O ciclo está **aberto e recebendo
   submissões**: nenhum número de 2026 pode ser tratado como fixo, e é por isso que o
   painel precisa do botão "Atualizar".
2. Em 2026 o **teto de conveniadas está zerado** (R$ 0) na linha confirmada —
   confirmar com a equipe se é "ainda não definido".
3. Em 2025 nenhuma linha `confirmado` é utilizável (ver acima).
4. As colunas **curadas** do enriquecimento (`parceria_desde_ano`,
   `tipo_parceria`, `observacoes_avaliacao`) seguem vazias nas 146 instituições —
   preenchimento é da equipe, no CSV.

## Sobre `data/institution_enrichment.csv`

`npm run enrich:regen` regravou as colunas derivadas a partir da origem e
preservou as curadas. Mudanças em relação à versão anterior do arquivo:

- corrigido `recoSrrente` → `recorrente` (Junta de Missões Mundiais);
- o vocabulário ganhou dois casos que faltavam: 25 instituições marcadas como
  `recorrente` não têm projeto em 2026 (→ `apenas 2025`) e 18 marcadas como
  `novo (no sistema)` não têm projeto nenhum (→ `sem projetos`). A distribuição
  final — `recorrente` 71 · `novo (no sistema)` 32 · `apenas 2025` 25 ·
  `sem projetos` 18 — bate com os 71/32 de
  [`enriquecimento-dados.md`](enriquecimento-dados.md);
- `projetos_2026` do Seminário Presbiteriano do Norte: 1 → 2 (dado vivo mudou).
