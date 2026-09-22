# Fase 12 — Resumo Executivo (`/`)

A tela de **entrada da reunião**, no nível de abstração do presidente: a
diretriz orçamentária de um lado, o que foi submetido do outro, e o desvio entre
os dois. A Visão Geral, que era esta rota, virou [`/visao-geral`](<../app/(painel)/visao-geral/>).

## A diretriz

Recebida pronta do presidente da associação: o teto da remessa se divide em

| Rúbrica               | Diretriz | Categorias da origem (`cycle_projects.category`) |
| --------------------- | -------- | ------------------------------------------------ |
| Missões               | 50%      | `missoes-transculturais` · `missoes-nacionais`   |
| Construção de igrejas | 25%      | `construcao-reforma`                             |
| Outros                | 20%      | `educacao` · `saude` · `outros`                  |
| Social                | 5%       | `projetos-sociais-cristaos`                      |

**Os percentuais são a diretriz; o de-para é leitura nossa.** A origem não tem o
conceito de rúbrica — tem sete categorias. As duas coisas moram em
[`src/lib/rubricas.ts`](../src/lib/rubricas.ts) e a tabela da tela mostra, sob o
nome de cada rúbrica, quais categorias entraram nela: é onde a mesa contesta o
de-para em voz alta, que é o único lugar onde isso se decide.

Ressalva que a tela carrega sozinha: `construcao-reforma` é **construção E
reforma**, então reforma de prédio que não é templo cai em "Construção de
igrejas". Se a mesa quiser separar, não dá pela categoria — precisa de curadoria
projeto a projeto (seria uma coluna nova em `data/`, no molde do
enriquecimento).

Categoria nova na origem não desaparece da conta: cai numa linha
**"Fora das rúbricas"** com alvo 0% (hoje não existe nenhuma).

## Como o desvio é medido

Duas leituras, porque a mesa usa as duas:

- **Envelope** = `teto × diretriz`. O desvio em reais (`pedido − envelope`) é o
  que se remaneja. Depende do teto do ciclo, então some quando não há linha de
  orçamento confiável.
- **Aderência em pontos** = `% do pedido − % da diretriz`. Não depende do teto e
  é o que a diretriz diz de fato.

O KPI **"A remanejar pela diretriz"** é a soma só dos excessos — o dinheiro que
teria de sair das rúbricas que passaram do envelope. O vão contra o teto é outra
conta e está no KPI ao lado.

**Base: projetos avaliáveis** (`avaliavel()`, a mesma regra das pastas):
rejeitado, rascunho e cancelado ficam fora porque não disputam o teto. Em 2026
isso são R$ 7,1 mi — com eles, o pedido "total" (R$ 21,2 mi) inflava toda a
aderência.

### Remessa 2026, sem recorte

250 projetos avaliáveis pedem **R$ 14,06 mi** contra um teto de R$ 14,5 mi — o
teto cobre o pedido inteiro, e o aperto está na **divisão**:

| Rúbrica               | Pedido     | % do pedido | Diretriz | Envelope   | Desvio          | Aprovado em 2025 |
| --------------------- | ---------- | ----------- | -------- | ---------- | --------------- | ---------------- |
| Missões               | R$ 6,55 mi | 46,6%       | 50%      | R$ 7,25 mi | −R$ 700 mil     | 50,0%            |
| Construção de igrejas | R$ 3,25 mi | 23,1%       | 25%      | R$ 3,63 mi | −R$ 377 mil     | 22,4%            |
| Outros                | R$ 2,94 mi | 20,9%       | 20%      | R$ 2,90 mi | +R$ 43 mil      | 16,1%            |
| Social                | R$ 1,32 mi | 9,4%        | 5%       | R$ 725 mil | **+R$ 591 mil** | 11,5%            |

**O achado:** a diretriz descreve bem a prática do conselho — em 2025 Missões
levou 50,0% do aprovado, exatamente o alvo — **menos em Social, que rodou 11,5%
e agora pede 9,4% para um alvo de 5%**. É a única rúbrica cujo desvio não é
ajuste fino: são R$ 591 mil, e a decisão é da mesa (cortar pedido ou rever o
percentual).

A coluna "Aprovado em {ano anterior}" é **régua histórica, não previsão** — só
aparece quando existe ciclo anterior com algo aprovado.

## Renovações e projetos novos

As duas relações que a diretriz pede com nome ("quantos, quais são"), na ordem
do dinheiro:

- **Renovações — 140 projetos**, pedem R$ 7,48 mi tendo recebido R$ 7,07 mi
  (+5,9%). Colunas: instituição, rúbrica, recebeu antes, pede agora, variação.
- **Projetos novos — 110 projetos**, pedem R$ 6,58 mi. Colunas: instituição,
  rúbrica, país, **pasta** (o diretor que apresenta) e valor.

O título de cada linha abre a pasta do projeto. O cabeçalho de cada bloco leva o
recorte para Projetos & Pastas com o filtro de Triagem aplicado (mesmo padrão do
"Ver N projetos" das Parcerias). A contagem de cada rúbrica leva para lá com o
filtro de Categoria.

O vínculo novo × renovação é derivado **fora da origem** (Fase 5) — a origem não
liga um ciclo ao outro. `revisar` (vínculo plausível, não decidido) conta como
**novo**, que é a régua já usada nas pastas; em 2026 a equipe zerou essa faixa.

Na Remessa 2025 não há renovação nenhuma: o vínculo de 2025 para trás não foi
derivado, e o bloco diz isso em vez de mostrar zero sem explicação.

## Recorte, TV e papel

- **Os filtros globais valem** aqui, como em todo o painel. Com recorte ativo, o
  rodapé da tabela avisa que a aderência é do recorte, não da remessa — um
  envelope calculado do teto do ciclo inteiro contra um pedido filtrado
  compararia coisas diferentes sem dizer.
- **A régua de desvio** é uma barra divergente com o zero no meio (`.regua`):
  direita/laranja acima do envelope, esquerda/azul abaixo. O mesmo dado sai
  codificado três vezes — lado, cor e a palavra na célula vizinha ("4,4 p.p.
  acima") — porque isto é lido a três metros na TV e sai em fotocópia.
- **O veredito** (a frase acima dos KPIs) é montado dos mesmos números da
  tabela; em modo apresentação ele cresce para 22px. É o que se lê em voz alta
  para abrir a reunião.
- **No papel** o documento sai inteiro: as duas relações desenrolam (as tabelas
  roladas já perdem o `max-height` na impressão) e o total volta a ser a última
  linha. São ~20 páginas em A4 paisagem com as 250 linhas — se a mesa quiser um
  documento de duas páginas, o corte é limitar a relação impressa aos N maiores.

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

| Arquivo                                                   | O que tem                                       |
| --------------------------------------------------------- | ----------------------------------------------- |
| [`src/lib/rubricas.ts`](../src/lib/rubricas.ts)           | a diretriz, o de-para e `montarDiretriz` (puro) |
| [`app/(painel)/resumo.tsx`](<../app/(painel)/resumo.tsx>) | a página (cliente, reagrega sob os filtros)     |
| [`app/(painel)/page.tsx`](<../app/(painel)/page.tsx>)     | a rota `/` — só busca ciclos e orçamentos       |
| `tests/unit.test.ts`                                      | envelope, desvio, remanejamento, linha "fora"   |

Mudar a diretriz (ou o de-para) é editar `RUBRICAS` em `rubricas.ts`. Os
percentuais **não** estão em CSV: é parâmetro de negócio de uma linha, não dado
curado projeto a projeto.
