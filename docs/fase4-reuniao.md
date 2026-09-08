# Fase 4 — Instituições, Prestação de contas, apresentação e PDF

Fecha o painel para a reunião: as duas páginas que faltavam, o modo apresentação/TV
e a exportação da visão atual. Mesma fundação da Fase 1, mesmo esqueleto da Fase 2.
A origem continua **somente leitura**.

```bash
npm run dev      # http://localhost:3000
npm test         # inclui instituições, conformidade e cobertura da prestação
npm run check    # agora também confere os dois datasets novos contra os dados vivos
```

## Rotas novas

| Rota            | Página                  | Responde                                                                    |
| --------------- | ----------------------- | --------------------------------------------------------------------------- |
| `/instituicoes` | **Instituições**        | Quem recebe a verba, quanto concentra e quem está em dia com os documentos. |
| `/prestacao`    | **Prestação de contas** | Cobertura por trimestre, pendências e execução do aprovado.                 |

## Como está montado

| Arquivo                                                  | Papel                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [`src/lib/queries.ts`](../src/lib/queries.ts)            | `fetchDocumentos()` (novo) e `fetchPrestacaoContas()` — só SELECT.  |
| [`src/lib/agregar.ts`](../src/lib/agregar.ts)            | `agregarPorInstituicao`, `montarCobertura`, `ehFinanciado` (puros). |
| [`src/lib/datasets.ts`](../src/lib/datasets.ts)          | `montarConformidade`, `conformidade()`, `prestacaoContas()`.        |
| [`src/lib/cache.ts`](../src/lib/cache.ts)                | `dados.conformidade()` e `dados.prestacao()` — sem eixo de ano.     |
| `app/(painel)/instituicoes/` · `app/(painel)/prestacao/` | Uma página cada, reagregando no cliente sob os filtros globais.     |
| [`app/(painel)/shell.tsx`](<../app/(painel)/shell.tsx>)  | Abas novas, modo apresentação (teclado) e o botão Exportar PDF.     |
| [`app/globals.css`](../app/globals.css)                  | `body.apresentacao`, `@media print` e `.rolagem`.                   |

### Decisões que valem lembrar

- **A remessa de um relatório vem do PROJETO, não do `cycle_id` do relatório.**
  Na origem há 2 relatórios carimbados com o ciclo 2026 que prestam contas de
  projetos aprovados na **Remessa 2025** — o ciclo que estava aberto na hora do
  envio. Casar pelo `cycle_id` sumia com eles (a cobertura de 2025 caía de 25 para
  23 projetos). `montarCobertura` casa pelo projeto e **sinaliza** o desencontro
  (`relatoriosDeOutroCiclo`), na tela e no `npm run check`.
- **Dois datasets sem eixo de ano.** Conformidade documental é da instituição e
  prestação de contas são 27 linhas ao todo: buscar tudo uma vez e recortar no
  cliente é mais barato que uma consulta por ciclo — e faz o comparador
  2026 × 2025 funcionar sem segunda ida ao banco.
- **A conformidade não tem recorte, e a tela diz isso.** Documento é da
  instituição, não do ciclo; o bloco "Documentos pendentes por tipo" é sempre do
  cadastro inteiro e está rotulado assim. O que segue os filtros é o ranking.
- **Toda instituição já tem as 5 linhas de documento** (735 = 147 × 5, cada uma
  com exatamente 5); o que falta é o **envio**. Por isso o KPI conta "sem nada
  enviado" (43 hoje), não "sem documento" — que seria sempre zero. São 147
  `institution_id` para 146 instituições: um conjunto é órfão, e o `npm run check`
  passou a avisar.
- **Sem filtro por instituição** (na Fase 4; entregue depois — ver
  [`fase5-projetos.md`](fase5-projetos.md)). Aqui os filtros globais ainda eram
  os quatro do plano: continente, status, categoria, conveniada.
- **Ainda sem biblioteca de gráficos.** As duas páginas são `Barras` + `<table>`,
  como as da Fase 3.

### Modo apresentação/TV

Botão **Apresentar** no cabeçalho. Liga a classe `apresentacao` no `<body>`
(fontes maiores, blocos mais largos, nada de lista rolando dentro do bloco) e pede
tela cheia — daí o `requestFullscreen()` sair do clique, que é o gesto que o
navegador exige.

| Tecla          | Faz                                       |
| -------------- | ----------------------------------------- |
| `→` `PageDown` | Próxima página (as páginas são os slides) |
| `←` `PageUp`   | Página anterior                           |
| `Esc`          | Sai da apresentação e da tela cheia       |

As setas são ignoradas enquanto o foco está num `<select>` dos filtros — senão
mudar o recorte com o teclado viraria troca de página.

A escala é **CSS explícito**, não `zoom`/`transform`: a dica do mapa é posicionada
em pixels a partir de `getBoundingClientRect()`, e um fator de escala no ancestral
desalinharia o tooltip do país.

### Exportar a decisão (PDF)

Botão **Exportar PDF** → `window.print()` → "Salvar como PDF" do navegador.
Nenhuma biblioteca: a folha `@media print` é que faz o trabalho.

- Some o que é controle (abas, filtros, botões) e entra a linha `.so-impressao`
  com **página, remessa, filtros ativos e nº de projetos** — é o que registra na
  ata qual recorte gerou aqueles números. Data e URL o navegador carimba sozinho.
- `print-color-adjust: exact` porque as barras e as pastilhas de status **são** o
  dado; em branco não dizem nada.
- Listas que rolam na tela saem inteiras no papel; `break-inside: avoid` mantém
  cada bloco em uma página só. Padrão A4 paisagem.

## O que a Fase 4 **não** faz

- **PNG.** A exportação é PDF pela impressão do navegador. PNG exigiria
  `html2canvas`/`dom-to-image` — dependência nova para algo que a tecla
  <kbd>PrtScr</kbd> (ou Win+Shift+S) resolve. Entra se a equipe pedir imagem para
  colar em slide.
- **Zoom/pan no mapa** e **filtro por instituição** seguem fora.
- Nenhuma escrita na origem, em nenhum momento.

## O que apareceu nos dados vivos (2026-09-05)

| Achado                                                                      | Onde ver                         |
| --------------------------------------------------------------------------- | -------------------------------- |
| **11,2% de cobertura** da prestação em 2025: 25 de 223 projetos aprovados.  | `/prestacao` na Remessa 2025     |
| **R$ 10,24 mi aprovados sem nenhum relatório.**                             | KPI "Aprovado sem prestação"     |
| 2 relatórios com `cycle_id` de outra remessa.                               | ressalva no topo de `/prestacao` |
| **43 das 146 instituições sem nenhum documento enviado**; 5 tipos exigidos. | `/instituicoes`                  |
| 1 conjunto de documentos órfão (institution_id sem instituição).            | `npm run check`                  |
| Os 5 maiores concentram **41,3%** do solicitado em 2026.                    | KPI "Concentração (5 maiores)"   |

Os quatro primeiros são pendências a levar para a equipe, junto das que a Fase 1
já tinha levantado (ver [`CLAUDE.md`](../CLAUDE.md)).
