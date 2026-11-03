# Fase 12 — Resumo Executivo (`/`)

A tela de **entrada da reunião**, no nível de abstração do presidente: a
diretriz orçamentária de um lado, o que foi submetido do outro, e o desvio entre
os dois. A Visão Geral, que era esta rota, virou [`/visao-geral`](<../app/(painel)/visao-geral/>).

## A diretriz

Recebida pronta do presidente da associação: o teto da remessa se divide em

| Rubrica               | Diretriz | Categorias da origem (`cycle_projects.category`) |
| --------------------- | -------- | ------------------------------------------------ |
| Missões               | 50%      | `missoes-transculturais` · `missoes-nacionais`   |
| Construção de igrejas | 25%      | `construcao-reforma`                             |
| Outros                | 20%      | `educacao` · `saude` · `outros`                  |
| Social                | 5%       | `projetos-sociais-cristaos`                      |

**Os percentuais são a diretriz; o de-para é leitura nossa.** A origem não tem o
conceito de rubrica — tem sete categorias. As duas coisas moram em
[`src/lib/rubricas.ts`](../src/lib/rubricas.ts) e a tabela da tela mostra, sob o
nome de cada rubrica, quais categorias entraram nela: é onde a mesa contesta o
de-para em voz alta, que é o único lugar onde isso se decide.

Ressalva que a tela carrega sozinha: `construcao-reforma` é **construção E
reforma**, então reforma de prédio que não é templo cai em "Construção de
igrejas". Se a mesa quiser separar, não dá pela categoria — precisa de curadoria
projeto a projeto (seria uma coluna nova em `data/`, no molde do
enriquecimento).

Categoria nova na origem não desaparece da conta: cai numa linha
**"Fora das rubricas"** com alvo 0% (hoje não existe nenhuma).

## Como o desvio é medido

- **Envelope** = `teto × diretriz`. O desvio em reais é `pedido − envelope`.
  Depende do teto do ciclo, então some quando não há linha de orçamento
  confiável.
- **A régua e a linha "p.p." sob o desvio são a MESMA conta** em pontos do teto
  (`desvio / teto`; sem teto cai para `% do pedido − % da diretriz`). Antes eram
  duas contas (pedido ÷ teto contra pedido ÷ pedido) e, como o pedido passa do
  teto, uma rubrica podia sair "+R$ 50 mil" na coluna e "abaixo" na régua.
- **A cortar** = quanto o pedido passa do teto (0 se cabe). É dinheiro que não
  existe.
- **A remanejar** = quanto do excesso das rubricas acima do envelope cabe na
  folga das que ficaram abaixo (`min(excesso, folga)`). Excesso = remanejar +
  cortar. O KPI antigo "A remanejar" somava os dois e chamava tudo de remanejar.

**Base: projetos avaliáveis** (`avaliavel()`, a mesma regra das pastas):
rejeitado, rascunho e cancelado ficam fora porque não disputam o teto. Em 2026
isso são R$ 7,1 mi — com eles, o pedido "total" (R$ 21,2 mi) inflava toda a
aderência.

### Remessa 2026, sem recorte

250 projetos avaliáveis pedem **R$ 14,06 mi** contra um teto de R$ 14,5 mi — o
teto cobre o pedido inteiro, e o aperto está na **divisão**:

| Rubrica               | Pedido     | % do pedido | Diretriz | Envelope   | Desvio          | Aprovado em 2025 |
| --------------------- | ---------- | ----------- | -------- | ---------- | --------------- | ---------------- |
| Missões               | R$ 6,55 mi | 46,6%       | 50%      | R$ 7,25 mi | −R$ 700 mil     | 50,0%            |
| Construção de igrejas | R$ 3,25 mi | 23,1%       | 25%      | R$ 3,63 mi | −R$ 377 mil     | 22,4%            |
| Outros                | R$ 2,94 mi | 20,9%       | 20%      | R$ 2,90 mi | +R$ 43 mil      | 16,1%            |
| Social                | R$ 1,32 mi | 9,4%        | 5%       | R$ 725 mil | **+R$ 591 mil** | 11,5%            |

**O achado:** a diretriz descreve bem a prática do conselho — em 2025 Missões
levou 50,0% do aprovado, exatamente o alvo — **menos em Social, que rodou 11,5%
e agora pede 9,4% para um alvo de 5%**. É a única rubrica cujo desvio não é
ajuste fino: são R$ 591 mil, e a decisão é da mesa (cortar pedido ou rever o
percentual).

A coluna "Aprovado em {ano anterior}" é **régua histórica, não previsão** — só
aparece quando existe ciclo anterior com algo aprovado.

## Renovações e projetos novos

A tela não repete a relação inteira (264 linhas já moram, com filtro, ordenação
e exportação, em Projetos & Pastas). Ela traz:

- **Uma matriz por rubrica**: renovações (quantas, pedem, receberam antes,
  variação) e novos (quantos, pedem). A variação compara só as renovações com
  base anterior.
- **Renovações que pedem mais que o dobro** do que receberam, com nome (até 10,
  pela maior diferença em reais).
- **Os 10 maiores projetos novos**, com instituição, rubrica, país e pasta.

O título de cada linha abre a pasta do projeto. Os botões "Abrir as renovações" e
"Abrir os novos" levam o recorte para Projetos & Pastas com o filtro de Triagem
aplicado. A contagem de cada rubrica leva para lá com o filtro de Categoria.

O vínculo novo × renovação é derivado **fora da origem** (Fase 5). `revisar`
conta como **novo**, a régua já usada nas pastas.

## Recorte, TV e papel

- **Os filtros globais NÃO valem aqui.** O veredito é lido em voz alta; depois de
  um atalho para "renovações", ele dizia "149 projetos pedem R$ 7,5 mi, abaixo do
  teto", falso para a remessa. A tela mostra sempre a remessa inteira e, com
  recorte ligado, avisa em laranja logo abaixo do veredito.
- **O veredito** é o `<h1>`: a primeira frase em 26px (34px na TV), e o detalhe
  (renovações e novos, divisão, "a mesa fecha: cortar R$ X e remanejar R$ Y") em
  22px. Não há mais faixa de KPIs; o que ela tinha de novo (delta sobre o ano
  anterior) está no rodapé da coluna Pedido.
- **A régua de desvio** (`.regua`) é uma barra divergente com o zero no meio:
  direita/laranja acima do envelope, esquerda/azul abaixo, com a palavra na
  célula vizinha. Dimensiona em `em` do token de texto, então cresce na TV.
- **No papel** a página sai em poucas folhas: veredito, tabela de rubricas, a
  matriz e as duas listas curtas.

## Junto vieram (dois defeitos de impressão da casa)

1. **Endereço atrás de cada título.** A regra que imprime o `href` ao lado do
   link existe para o anexo e para o projeto do ciclo anterior não virarem beco
   sem saída. Dentro de uma **tabela** ela transformava a relação em parede de
   uuid — 250 linhas em `/projetos`, 140 aqui. Agora `.tabela .link-projeto`
   não imprime endereço; fora de tabela o comportamento é o mesmo de antes.
2. **Total repetido no meio da relação.** `tfoot` é `table-footer-group`, que o
   navegador repete em cada página: o total final aparecia no pé da página 1
   como se fosse o total dela. Na impressão o `tfoot` virou `table-row-group`.

## Navegação

O Resumo entrou na fileira do topo e **Pipeline & Avaliação desceu para o menu
"Mais"** — a linha do topo tem o mesmo teto dos filtros (entra um, sai um), e o
Pipeline é a página com menos a dizer nesta remessa: 2026 não tem uma única
avaliação registrada. A ordem da fileira também é a ordem dos slides no modo
apresentação, então a reunião agora abre no Resumo.

## Onde está o quê

| Arquivo                                                   | O que tem                                          |
| --------------------------------------------------------- | -------------------------------------------------- |
| [`src/lib/rubricas.ts`](../src/lib/rubricas.ts)           | a diretriz, o de-para e `montarDiretriz` (puro)    |
| [`app/(painel)/resumo.tsx`](<../app/(painel)/resumo.tsx>) | a página (cliente, reagrega sob os filtros)        |
| [`app/(painel)/page.tsx`](<../app/(painel)/page.tsx>)     | a rota `/` — só busca ciclos e orçamentos          |
| `tests/unit.test.ts`                                      | envelope, desvio, cortar × remanejar, linha "fora" |

Mudar a diretriz (ou o de-para) é editar `RUBRICAS` em `rubricas.ts`. Os
percentuais **não** estão em CSV: é parâmetro de negócio de uma linha, não dado
curado projeto a projeto.
