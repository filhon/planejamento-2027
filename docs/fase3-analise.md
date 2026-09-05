# Fase 3 — Visão Geral, Pipeline & Avaliação, Orçamento

As páginas de análise sobre a mesma fundação da Fase 1 ([`src/lib/`](../src/lib/)) e o
mesmo esqueleto da Fase 2. A origem continua **somente leitura**.

```bash
npm run dev      # http://localhost:3000
npm test         # inclui a regra dos filtros globais
```

## Rotas

| Rota         | Página                   | Responde                                                                   |
| ------------ | ------------------------ | -------------------------------------------------------------------------- |
| `/`          | **Visão Geral**          | KPIs com delta, funil, orçamento vs. demanda, comparador, maiores pedidos. |
| `/mapa`      | **Mapa-múndi** (Fase 2)  | Para onde a Remessa vai no mundo.                                          |
| `/pipeline`  | **Pipeline & Avaliação** | Onde os projetos estão parados, notas e inflação de nota.                  |
| `/orcamento` | **Orçamento**            | Teto (conveniadas/não) × solicitado × reservado, semáforo de saldo.        |

## Como está montado

| Arquivo                                                       | Papel                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`app/(painel)/layout.tsx`](<../app/(painel)/layout.tsx>)     | **A camada de leitura.** Carrega os projetos de todos os ciclos, uma vez. |
| [`app/(painel)/shell.tsx`](<../app/(painel)/shell.tsx>)       | Marca, abas, toggle de ano, filtros globais e o contexto.                 |
| [`app/(painel)/contexto.tsx`](<../app/(painel)/contexto.tsx>) | `usePainel()` — o que cada página lê.                                     |
| [`app/(painel)/ui.tsx`](<../app/(painel)/ui.tsx>)             | `Kpi` (com delta), `Barras`, `Secao`.                                     |
| [`app/(painel)/formato.ts`](<../app/(painel)/formato.ts>)     | Moeda/nº em pt-BR, rótulos e a paleta semântica de status.                |
| `visao-geral.tsx` · `pipeline/` · `orcamento/` · `mapa/`      | Uma página cada, tudo reagregando no cliente.                             |

### Decisões que valem lembrar

- **O filtro mora no layout, não na página.** Como o estado do recorte vive no
  `Shell` (que o App Router não remonta ao navegar), clicar num país no Mapa e ir
  para o Orçamento **mantém o recorte**. Foi o motivo de usar rotas de verdade em
  vez de abas dentro de uma página só.
- **Um carregamento, quatro páginas.** O layout busca os projetos dos dois ciclos
  (~530 linhas) uma vez; trocar de página ou de filtro não vai ao banco. Só o que
  é específico da página (orçamento, avaliações) é buscado na própria página.
- **As regras do recorte estão em [`src/lib/agregar.ts`](../src/lib/agregar.ts)**
  (`filtrar`, `TODOS`, `ehConveniada`), não na UI — é código puro, testado em
  `npm test`, e a mesma função serve servidor e cliente.
  `is_conveniada` nulo **conta como não conveniada**: é quem disputa aquele teto.
- **Sem biblioteca de gráficos.** Barras são `<div>` com largura em `%` e tabelas
  são `<table>`; o único desenho é o SVG do mapa, que já vinha da Fase 2. Recharts/visx
  entram quando aparecer um gráfico que CSS não resolve (dispersão, série temporal).
- **Duas óticas de nota, ditas em voz alta.** Por **projeto** (nota mediana do
  projeto) segue os filtros; por **avaliação** (`dados.avaliacoes`) é o ciclo
  inteiro e está rotulada assim na tela — filtrar conselheiro por continente
  esconderia justamente a inflação de nota que se quer enxergar.
- **O que é do ciclo e o que é do recorte.** O teto do orçamento é sempre do ciclo
  inteiro (é uma linha só, não tem como recortar); solicitado, aprovado e reservado
  seguem os filtros. Cada bloco diz qual dos dois está mostrando.
- **Os alertas da Fase 1 viraram tela.** As pendências abertas com a equipe
  (linha `confirmado` de teste em 2025, teto de conveniadas = R$ 0 em 2026)
  aparecem no topo da página de Orçamento e no bloco de orçamento da Visão Geral —
  quem decide na reunião precisa ver a ressalva junto do número.

### Comparador 2026 × 2025

Não é um modo separado: **todo KPI carrega o delta** e as duas páginas de análise
têm uma tabela `2026 × 2025 × Δ`. Os dois ciclos usam **os mesmos filtros**, então o
comparativo continua válido depois de recortar por país ou categoria.

## O que a Fase 3 **não** faz

Páginas Instituições e Prestação de contas, modo apresentação/TV, exportar PDF/PNG
e zoom no mapa — tudo Fase 4. O painel também não escreve nada na origem, em
nenhum momento.
