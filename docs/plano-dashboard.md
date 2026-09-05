# Plano do Dashboard Consultivo — Hebron ASEEC

Versão apresentável (artefato): https://claude.ai/code/artifact/10441c8c-fcb9-463c-834c-5bab2313a047

Objetivo: painel de BI **interativo**, na identidade da Hebron ASEEC, usado **ao vivo na
reunião de planejamento** para decidir a Remessa 2026. Foco 2026, comparativo 2025.

---

## 1. Por que app próprio (não Looker)

| Necessidade                                 | Looker Studio          | App próprio (escolhido)         |
| ------------------------------------------- | ---------------------- | ------------------------------- |
| Mapa-múndi país pintado + filtros cruzados  | limitado, geo genérico | total, choropleth sob medida    |
| Identidade Hebron (fontes, cores, círculos) | parcial                | 100% fiel ao manual             |
| Comparador 2026 × 2025                      | trabalhoso             | nativo, um toggle               |
| Atualização instantânea na reunião          | cache/refresh lento    | botão "Atualizar" → re-consulta |
| Modo apresentação/TV                        | limitado               | layout dedicado                 |

### Arquitetura (3 camadas)

```
Origem: Supabase 17           API de leitura                Dashboard (React)
SOMENTE SELECT (read-only) ─▶  SELECT na origem +       ──▶  Choropleth + filtros
cycle_* como fonte única       une data/*.csv + deriva       KPIs · 2026 vs 2025
                               cache 15 min · /refresh       Marca Hebron ASEEC
        ▲    data/*.csv ──────────▶ (enriquecimento nosso)          │
        └──────────── clique "Atualizar" → re-consulta ao vivo ─────┘
```

- **Stack:** Next.js + React + TypeScript. Gráficos: Recharts ou visx.
  Mapa: react-simple-maps (D3-geo) sobre TopoJSON mundial (ex.: world-atlas 110m).
- **Origem intocável:** só `SELECT` — nunca escrever, criar views ou tabelas nela.
  Normalização e enriquecimento vivem fora (ver seção 3). A senha `postgres` nunca
  entra no app; segredos no servidor (env). Recomendar à equipe um `bi_readonly` (SELECT).
- **Atualização:** cache curto (15 min) + endpoint `/refresh` que refaz as consultas.
  Dados úteis somam poucos MB → consulta direta, sem ETL.

---

## 2. Estratégia de dados: 2026 no centro, 2025 como espelho

- Todos os painéis abrem em **2026** (`submission_cycles.year = 2026`).
- Cada KPI mostra **delta vs. 2025**. Toggle de ano troca o ciclo ativo; modo "lado a lado".
- Números de referência (releitura da Fase 1, 2026-09-04):
  - 2026: **264 projetos**, **R$ 23,71 mi** solicitados, 234 em validação.
  - 2025: 264 submetidos → 223 aprovados (R$ 11,4 mi), nota média 8,95 (mediana 10,0), 95,8% aprovação.
  - Os dados são vivos: `npm run check` reconfere e aponta a deriva a cada execução.

### Higiene na camada de views

1. Só `cycle_*` (legadas `projects…` duplicam 2025).
2. `resource_allocations`: filtrar `status='confirmado'` (há linhas de teste).
3. Nomes via `profiles.user_id` (não ler `auth`).

---

## 3. Normalização de local + enriquecimento — FORA da origem

O banco de origem é intocável (só `SELECT`). Normalização (país) e dados novos vivem em
`data/*.csv` e são unidos no app. Detalhe: [`enriquecimento-dados.md`](enriquecimento-dados.md)
e [`normalizacao-paises.md`](normalizacao-paises.md).

- **Local = país.** Cidade/estado descartados. `country` (PT, ~60 países limpos) casa com
  [`data/country_map.csv`](../data/country_map.csv) → ISO-3 + continente.
- **"Outro"** (17 registros) = área sensível. Fallback: país real em `state`/`city`;
  o resto vira grupo **"Multi-país / sensível"** — conta em KPIs, aparece hachurado no mapa.
- **Enriquecimento** ([`data/institution_enrichment.csv`](../data/institution_enrichment.csv)):
  **derivável** (recebido 2025, novo/recorrente) = calculado por `SELECT` na origem;
  **curado** (anos de parceria, tipo, observações) = preenchido pela equipe no CSV.
- Continentes viram o filtro da página do mapa: África, Ásia, Europa, América do Sul,
  América do Norte, Oceania (+ "Sensível").

---

## 4. Páginas do painel

| #   | Página                   | Pergunta que responde                                               |
| --- | ------------------------ | ------------------------------------------------------------------- |
| 01  | **Visão Geral**          | Como está o ciclo? KPIs, funil, orçamento vs. demanda, destaques.   |
| 02  | **Mapa-múndi** ⭐        | Para onde a Remessa vai no mundo? (detalhe na seção 5)              |
| 03  | **Pipeline & Avaliação** | Funil detalhado, notas por conselheiro/categoria, inflação de nota. |
| 04  | **Orçamento**            | Teto (conveniadas/não) × solicitado × reservado, semáforo de saldo. |
| 05  | **Instituições**         | Ranking por verba, conveniada vs. não, documentos/conformidade.     |
| 06  | **Prestação de contas**  | Cobertura por trimestre; pendências; execução do aprovado.          |

Todas herdam ano ativo + filtros globais (continente, status, categoria, conveniada).

---

## 5. Página Mapa-múndi (o coração)

Layout (de cima para baixo):

1. **Cabeçalho** + toggle de ano (Remessa 2026 / 2025).
2. **Barra de filtros:** Continente · Status · Categoria · limpar.
3. **Corpo:** mapa (choropleth) à esquerda + **Top países** (ranking com barras) à direita.
4. **KPI rail:** Projetos · Países alcançados · % Internacionais · Solicitado — cada um com
   delta vs. 2025.
5. **Legenda do ramp** + marcador "Multi-país / área sensível".

Regras:

- **País pintado** por volume: ramp sequencial azul (claro → `#202C85`); zero = cinza neutro.
- **Filtros cruzados:** continente/status/categoria filtram mapa + KPIs + ranking juntos.
- **Clique no país** filtra as demais páginas.
- **Tooltip rico:** país, nº projetos, valor solicitado/aprovado, principais categorias.
- Geometria real via TopoJSON (o esquema do artefato é só ilustrativo).

---

## 6. Interatividade para a reunião

- **BI instantâneo:** filtros globais + botão "Atualizar" (re-consulta sem recarregar).
- **Comparar 2026 × 2025:** toggle + modo lado a lado; deltas em todo KPI.
- **Modo apresentação/TV:** fontes maiores, um painel por vez, navegação por teclado.
- **Exportar decisão:** visão atual (com filtros) em PDF/PNG para anexar à ata.

---

## 7. Identidade visual aplicada

- **Cores:** Azul `#202C85` (base/estrutura), Laranja `#EA5A06` (ação/alerta),
  Verde `#A1C520` (positivo/destaque), Azul-claro `#07B4E7` (info/destaque).
- **Fontes:** Parkinsans (títulos/KPIs) + Titillium Web (corpo). Google Fonts.
- **Círculos** da marca como assinatura discreta (cabeçalhos, fundos azuis, pins do mapa).
- **Gráficos:** magnitude/choropleth = 1 cor (azul); categorias = barras ordenadas (sem
  salada de cores); status = paleta semântica fixa:
  - aprovado → verde · em validação → laranja · classificado → azul-claro ·
    rejeitado → vermelho (semântico) · rascunho/devolvido → neutro.

---

## 8. Roadmap

| Fase                         | Entrega                                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Fundação de dados** ✅ | consultas de leitura (SELECT) na origem, `data/country_map.csv`, `data/institution_enrichment.csv`, camada de junção no app. **Nada foi criado na origem.** Implementada em `src/lib/` — ver [`fase1-fundacao-dados.md`](fase1-fundacao-dados.md). |
| **2 — Esqueleto + Mapa** ✅  | app Next.js com a marca, leitura via Server Components + cache, **página Mapa-múndi**, filtros globais. Implementada em `app/` — ver [`fase2-mapa.md`](fase2-mapa.md).                                                                             |
| **3 — Análise** ✅           | Visão Geral + KPIs, Pipeline & Avaliação, Orçamento, comparador 2026×2025. Filtros globais no layout — o recorte atravessa as páginas. Ver [`fase3-analise.md`](fase3-analise.md).                                                                 |
| **4 — Reunião-ready** ✅     | Instituições + prestação de contas, modo apresentação/TV (teclado + tela cheia) e exportar a visão atual em PDF (impressão do navegador; PNG ficou de fora). Ver [`fase4-reuniao.md`](fase4-reuniao.md).                                           |

### "Datasets" servidos pela API (montados em memória, não são views na origem)

- `projetos_ciclo` — 1 linha por projeto (ano, categoria, status, país normalizado via CSV,
  solicitado, aprovado, instituição, conveniada, alocação mensal/parcelas + enriquecimento).
- `projeto_local` — país/continente por projeto (join com `data/country_map.csv`).
- `orcamento_ciclo` — teto vs. solicitado vs. reservado por ano.
- `avaliacoes_ciclo` — nota média/mediana/dispersão por categoria e conselheiro.

Cada um é uma consulta `SELECT` na origem + junção com os CSVs no app — **sem criar objetos
no banco de origem**.
