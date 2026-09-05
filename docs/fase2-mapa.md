# Fase 2 — Esqueleto Next.js + página Mapa-múndi

App em [`app/`](../app/) sobre a fundação de dados da Fase 1 ([`src/lib/`](../src/lib/)).
A origem continua **somente leitura**: o app só chama a fachada `dados.*`, que só faz `SELECT`.

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
npm test         # inclui a checagem da geometria do mapa
```

## Como está montado

> Os caminhos abaixo já refletem a Fase 3, que moveu o mapa para `/mapa` e passou a
> camada de leitura e os filtros para o layout — ver [`fase3-analise.md`](fase3-analise.md).

| Arquivo                                                         | Papel                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`app/(painel)/layout.tsx`](<../app/(painel)/layout.tsx>)       | **A camada de leitura.** Server Component: `dados.ciclos()` + `dados.projetos(ano)` de cada ciclo. |
| [`app/(painel)/mapa/mapa.tsx`](<../app/(painel)/mapa/mapa.tsx>) | Mapa, KPIs e ranking — tudo no cliente. Os filtros vêm do `Shell`.                                 |
| [`app/actions.ts`](../app/actions.ts)                           | Botão "Atualizar" → `atualizar()` + `revalidatePath`.                                              |
| [`app/error.tsx`](../app/error.tsx)                             | Tela de erro se a base cair no dia da reunião.                                                     |
| [`src/lib/mapa.ts`](../src/lib/mapa.ts)                         | Geometria do mundo → `{ iso3, nome, d }` (path SVG já projetado).                                  |
| [`src/lib/agregar.ts`](../src/lib/agregar.ts)                   | Agregações puras, usadas pelo servidor **e** pelo cliente.                                         |

### Decisões que valem lembrar

- **Sem rotas REST.** O Server Component já é a API de leitura: chama `dados.*` no
  servidor e entrega os projetos prontos. Rota HTTP só quando algum cliente externo
  precisar dos dados.
- **Filtros no navegador.** Os projetos dos dois ciclos vão inteiros para o cliente
  (~260 por ano); continente/status/categoria/país reagregam na hora, sem ida ao banco.
  Por isso `agregar.ts` foi separado de `datasets.ts` — importar `datasets.ts` no
  cliente arrastaria o driver `pg` para o bundle. As regras seguem com **uma** implementação.
- **Mapa sem biblioteca de mapas.** `d3-geo` + `topojson-client` rodam **no servidor** e
  mandam só os paths SVG (~118 KB). O navegador recebe SVG puro — sem react-simple-maps,
  sem d3 no bundle. Sem zoom/pan; a projeção é fixa (Natural Earth, viewBox 980×500).
- **Choropleth** com `color-mix()` nativo do CSS sobre `--azul` (`#202C85`), escala em
  raiz quadrada do nº de projetos. Zero dependência de escala de cor.
- **Geometria:** Natural Earth 110m (npm `world-atlas`, domínio público), vendorizada em
  [`data/countries-110m.json`](../data/countries-110m.json) para não depender de
  `node_modules` em runtime. Os ids são ISO **numéricos** → `i18n-iso-countries` converte
  para ISO-3, que é a chave do [`data/country_map.csv`](../data/country_map.csv).
- **Nada some em silêncio.** O que os KPIs contam mas o mapa não pinta vira ficha visível:
  "Multi-país / sensível", "Sem de-para" (país fora do CSV) e "Fora do mapa"
  (hoje **Cabo Verde** e **São Tomé e Príncipe** — pequenos demais para o 110m; aparecem
  no ranking). O teste `geometria do mundo casa com o de-para` avisa se essa lista mudar.

## O que a Fase 2 **não** faz

Páginas Instituições e Prestação de contas (Fase 4); modo apresentação/TV;
exportar PDF/PNG; zoom no mapa. Visão Geral, Pipeline e Orçamento chegaram na
[Fase 3](fase3-analise.md).
