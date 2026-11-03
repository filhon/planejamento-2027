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

## Estado atual (2026-09-08) — Fases 1 a 5 entregues

**Fase 1 (fundação de dados)** — camada TypeScript em [`src/lib/`](src/lib/) que lê a
origem só com `SELECT` e junta com `data/*.csv` em memória. Nada foi criado na origem.
Manual: [`docs/fase1-fundacao-dados.md`](docs/fase1-fundacao-dados.md).

**Fase 2 (app + Mapa-múndi)** — app Next.js em [`app/`](app/) com a marca, filtros
globais e a página do mapa. Manual: [`docs/fase2-mapa.md`](docs/fase2-mapa.md).

**Fase 3 (análise)** — as páginas **Visão Geral** (`/`), **Pipeline & Avaliação**
(`/pipeline`) e **Orçamento** (`/orcamento`), com o comparador 2026 × 2025 em todo KPI.
Os filtros globais e o ano ativo moram no layout `app/(painel)/`, então **o recorte
sobrevive à troca de página**. Manual: [`docs/fase3-analise.md`](docs/fase3-analise.md).

**Fase 4 (reunião-ready)** — **Instituições** (`/instituicoes`) e **Prestação de contas**
(`/prestacao`), **modo apresentação/TV** (botão Apresentar: fontes maiores, tela cheia,
←/→ trocam de página, Esc sai) e **Exportar PDF** (`window.print()` + folha `@media print`,
sem biblioteca). Manual: [`docs/fase4-reuniao.md`](docs/fase4-reuniao.md).

**Fase 5 (pasta do projeto + triagem)** — **Projetos & Pastas** (`/projetos`) e a
**pasta do projeto** (`/projetos/[id]`: texto completo, anexos, **vídeo tocando na
página**, parecer ASEEC, avaliações com comentário, votos, e — nas renovações — o
projeto anterior com a prestação de contas dele). Traz a triagem **novo ×
renovação POR PROJETO** (a origem não liga um ciclo ao outro), o **quanto recebeu
no ciclo anterior** por projeto, e a **divisão automática dos projetos novos**
(rejeitado, rascunho e cancelado não entram em pasta) entre diretores/conselheiros;
`-- --reequilibrar` nivela as pastas quando elas encolhem (projeto reclassificado)
ou quando entra um avaliador novo. Traz também a **exportação do recorte** no
canto da tabela — **PDF** (janela nova + `window.print()`, desenhado como
documento de conselho: timbre, campos de identificação, relação em tabela com
`thead` repetido, e legível em preto e branco) e **.xlsx** (quatro colunas,
números crus), com o **nome do diretor** no campo Responsável quando há
exatamente um marcado e uma **nota** quando há dois ou mais.
Manual: [`docs/fase5-projetos.md`](docs/fase5-projetos.md).

```bash
npm install
npm run dev            # painel em http://localhost:3000
npm run build && npm start
npm run check          # relatório de sanidade contra os dados vivos (só SELECT)
npm test               # regras puras (país, guarda, orçamento, notas, mapa, triagem)
npm run enrich:regen   # regenera as colunas derivadas do CSV (preserva as curadas)
npm run avaliacao:regen  # triagem novo×renovação + divisão das pastas (idem)
npm run municipios:regen # centróides dos municípios (IBGE) — só se a malha mudar
```

Datasets prontos para a UI (fachada com cache em `src/lib/cache.ts`):
`dados.ciclos()` · `dados.projetos(ano)` · `dados.locais(ano)` (choropleth) ·
`dados.resumo(ano)` (KPIs) · `dados.orcamento(ano)` · `dados.avaliacoes(ano)` ·
`dados.conformidade()` e `dados.prestacao()` (sem eixo de ano — são pequenos e
servem todos os ciclos); `dados.detalhe(id)` (a pasta de um projeto) e
`dados.avaliadores()`; `atualizar()` é o botão "Atualizar" da reunião.

Agregações puras **e as regras do recorte** (`filtrar`, `alternar`, `ehConveniada`,
`ehFinanciado`, `agregarPorInstituicao`, `montarCobertura`, `montarPastas`) ficam em
`src/lib/agregar.ts` (sem `pg`/`fs`) porque o cliente as usa para reagregar os filtros —
`datasets.ts` reexporta tudo. O casamento de título entre remessas mora em
`src/lib/recorrencia.ts` (também puro). **Não** importar `datasets.ts` num componente
cliente: arrasta o driver do banco para o bundle.

Os filtros globais são Continente · Status · Categoria · **Instituição** (por
nome, com busca por nome ou iniciais) · Triagem · Responsável · **Análise
prévia** · **Tags**, mais o país clicado no mapa. Cabem numa linha só — é o
teto: entrando um nono eixo, algum sai. O **Convênio** saiu por isso (o de
Instituição faz o mesmo recorte melhor); `ehConveniada` continua valendo no
Orçamento, que é onde as duas fatias importam.

O filtro de **Status** é pelo status **da origem** (os 14 do enum, na ordem do
fluxo, com a contagem do ciclo ao lado — `STATUS_ORIGEM` em `formato.ts`), não
pelo grupo da paleta: o grupo "Rascunho / outros" juntava rascunho (nunca
enviado) com devolvido para correção e cancelado. O grupo (`statusGrupo`) só
decide a cor; funis e tabelas também mostram o status da origem.

**Fase 6 (gráficos da Visão Geral)** — a tela de abertura ganhou as leituras que
nenhum ranking dava:

- **Concentração do pedido** (`Concentracao` em `app/(painel)/visao-geral.tsx`):
  curva do pedido acumulado, do maior projeto ao menor, com a remessa anterior
  tracejada e a linha do teto. Responde a pergunta da reunião — _o teto corta uma
  cauda, não uma fatia de cada projeto_: em 2026, metade dos R$ 21,2 mi está em
  **21 projetos** e os **60 maiores já esgotam o teto de R$ 14,5 mi**. SVG na mão
  (~90 linhas), sem biblioteca de gráfico.
- **Categorias em bullet**: a pista clara é o pedido, o trecho sólido é a régua de
  aprovação — deste ciclo se ele já decidiu, senão o que a mesma categoria levou no
  anterior. Nunca projeção: os dois números vêm da origem. Expõe que
  `construcao-reforma` pede R$ 8,7 mi tendo levado R$ 2,6 mi em 2025.
- **Renovações: quanto pedem a mais** — as 154 com vínculo pedem R$ 9,37 mi tendo
  recebido R$ 7,90 mi (**+18,6%**), com 11 que mais que dobram.
- KPI "Pressão da demanda" agora diz o vão em reais, não só a razão.

Regras puras novas em `src/lib/agregar.ts` (`curvaAcumulada`, `projetosAte`,
`montarRenovacoes`), cobertas por `npm test`.

⚠️ **Bug de CSS corrigido junto:** `.barra` é um `<span>` e não declarava
`display`, então era **inline** — `height`/`overflow` não se aplicam a inline
não-substituído e a pista de 6px nunca era desenhada. **Todas as barras do painel
estavam colapsadas** (Visão Geral, Pipeline, Instituições, Prestação, Projetos e o
ranking do Mapa). Uma linha (`display: block`) devolveu o gráfico de barras ao app
inteiro. `.barra-inline` já tinha `inline-block` e segue valendo.

**Não** vira gráfico (verificado nos dados, não por reflexo): **dispersão nota ×
valor** (2026 tem zero avaliação), **calendário de desembolso** (`mensal` e
`alocado` 0% preenchidos em 2026 — só existem após a aprovação) e **série temporal
de submissões** (mostra o corre do prazo, não decide nada).

**Fase 7 (a pasta do projeto em ordem de reunião)** — `/projetos/[id]` foi
reordenada pela sequência das perguntas da mesa, não pela das tabelas da origem:

- **Barra grudada no topo** (`[id]/barra.tsx`): volta, ‹ › pelos projetos do
  **recorte** (as mesmas setas que o modo apresentação já tinha, agora visíveis
  e fora dele), posição "12 de 47", nome e **quanto pede**. A pergunta que voltava
  a cada minuto ficava três telas acima do parágrafo lido em voz alta.
- **Ordem:** valores → renovação (o que fez com o dinheiro do ano passado) →
  parecer da ASEEC → mérito → vídeo → prestação → avaliações → votos → uma faixa
  final **"Registro e cadastro"** (indicadores, equipe, cadastro, histórico), que
  não decide nada. Antes a grade abria por **Anexos**; agora os arquivos moram na
  coluna de consulta do "O projeto", ao lado dos prazos — um cartão a menos.
- **Ausência não vira cartão.** Medido na origem: o parecer da ASEEC existe em
  **32 dos 266** projetos de 2026 e **não há uma única avaliação registrada** —
  os dois blocos eram cartões dizendo "ainda não registrado" em quase todo
  projeto. Só aparecem com conteúdo; a ausência do parecer virou uma linha na
  ficha de valores (a da avaliação já estava lá).
- **A renovação passou a fazer a conta:** "recebeu R$ 60.000 — deste mesmo
  projeto, pede 63,3% a menos" (`variacaoPedido` em `formato.ts`, testada). E
  renovação de projeto que recebeu verba e **não prestou contas** ganhou aviso em
  filete com o valor em aberto — é a pendência 5, que saía em cinza de rodapé
  justo na tela onde se decide dar mais dinheiro.

**Fase 8 (o anexo abre dentro da página)** — todo anexo era um link para outra
guia; planilha então virava download e Excel por cima da reunião. Agora o nome do
arquivo abre um `<dialog>` nativo sobre o painel (`[id]/visor.tsx`): **PDF** no
leitor do próprio navegador (`<iframe>` — os buckets servem `application/pdf` sem
`Content-Disposition`), **imagem** em `<img>`, e **.xlsx desenhado como tabela**,
lido no cliente por `src/lib/xlsx-ler.ts`. No cabeçalho ficam "Abrir original ↗" e
"Baixar" (`?download=<nome>`, que o Storage honra com `attachment`).

- **Por que valeu:** dos anexos de 2026, **372 são PDF, 220 .xlsx** (quase sempre
  o orçamento detalhado), 28 .docx e 12 imagens. Metade da dor era a planilha.
- `xlsx-ler.ts` é o irmão de leitura de `xlsx.ts`: zip pelo diretório central,
  `DecompressionStream("deflate-raw")` para inflar (nativo), e regex sobre
  `sharedStrings`/`styles`/`sheetN.xml`. **Sem biblioteca** — SheetJS traria
  ~800 kB para desenhar tabela de texto. Formata o que a planilha mandou formatar
  (R$, %, data), e só isso: agrupar por reflexo viraria o ano "2026" em "2.026".
  Traz abas (uma planilha da origem tem 15), teto de 400 linhas × 40 colunas por
  aba e o aviso do corte. **Não** traz mesclagem, fórmula nem imagem colada na
  aba — para isso existe o "abrir original". Coberto por `npm test` (round-trip
  com o escritor, e um zip comprimido de propósito).
- O `fetch` da planilha sai do navegador porque os buckets respondem
  `Access-Control-Allow-Origin: *` — sem rota de proxy, e **nada sai para
  serviço de terceiro** (nem Google/Office viewer): documento de projeto
  missionário, com `area_sensivel` na origem, não vai para fora por conveniência.
- .docx/.xls/.ods (41 anexos em 2026) mostram a mensagem e o link do original.
- Com o visor aberto o teclado é dele: `shell.tsx` ignora ←/→/Esc enquanto houver
  `dialog[open]`, senão Esc fechava a apresentação e a seta trocava de projeto
  por baixo do documento.

**Fase 9 (a prestação que só existe no Drive)** — na renovação, o painel mostrava
"sem prestação de contas" mesmo quando a secretaria tinha o relatório: o parceiro
não conseguiu subir no sistema de submissão e mandou por e-mail/WhatsApp (só 25
dos 223 projetos aprovados em 2025 prestaram contas pelo sistema — pendência 5).

- **Colar o link do Drive na própria seção da renovação** (`[id]/link-prestacao.tsx`):
  o link vai para `data/prestacao_links.csv` — **FORA da origem**, pela mesma regra
  do enriquecimento — e o arquivo passa a abrir no **mesmo visor** dos anexos do
  projeto. Quem usa é a secretaria/o diretor: o parceiro não abre o painel.
- **`src/lib/drive.ts`** (~40 linhas, puro) converte o link colado na URL
  embutível do Google: `/view` → `/preview`, documento do Workspace → `/preview`,
  e **pasta** → `embeddedfolderview` (a lista dos arquivos dentro do visor, para
  quem guarda uma pasta por projeto). Quem renderiza é o Drive, então **PDF,
  planilha, .docx, imagem e pasta inteira** abrem — inclusive o que o visor
  próprio não lê. Sem API do Google, sem credencial, sem nada saindo daqui: só
  regex sobre a URL, e o `<iframe>` recebe uma URL **reconstruída** a partir do
  id, nunca a string colada. Coberto por `npm test`.
- **A ausência continua dita.** Link colado não vira prestação registrada: o aviso
  em filete muda de redação ("nada registrado no sistema — o que há é o documento
  abaixo, recebido por fora") e os links ficam numa lista própria, "Recebido fora
  do sistema". No papel o link sai por extenso, para ser digitável.
- **Era a única escrita do painel** (a Fase 11 trouxe a segunda, no mesmo molde), e é num CSV local: exige disco gravável (é como
  o painel roda hoje, `npm start` na máquina da reunião). Corrigir link errado é
  editar o CSV no Excel — não há botão de remover.
- ⚠️ O arquivo precisa estar compartilhado como "qualquer pessoa com o link pode
  ver"; sem isso o quadro mostra a tela de permissão do Google.

**Fase 10 (a análise prévia fica visível)** — a equipe ASEEC analisa os projetos
nas semanas ANTES da reunião, para só levar à mesa o que está alinhado aos
objetivos. Esse trabalho é feito **um pouco por dia e a várias mãos** (um põe o
parecer, outro põe as tags, e só no fim o diretor gestor decide rejeitar ou
mandar para votação) e **quase nunca mexe no `status`** — 232 dos 267 projetos
de 2026 seguem em `em-validacao`. Resultado: não havia como saber onde a equipe
parou.

- **Nada de campo novo: o sinal já estava na origem** — `parecer_aseec_texto` e
  `parecer_aseec_tags` em `cycle_projects`, que só a página de detalhe lia.
  `fetchProjetos` passou a trazer os dois (o texto como booleano — 267 blocos de
  HTML não precisam ir para o cliente), mais `reviewer_notes` e `updated_at`, e
  `ProjetoCiclo.analise` (`AnalisePrevia`) os carrega para toda a UI.
- **A definição é a da equipe:** analisado = tem parecer **ou** tags. Hoje em
  2026: **39 de 242** na fila (rejeitado/rascunho/cancelado fora), 34 com
  parecer, 36 com tags. Em 2025, ciclo fechado, foram 225 de 233 — é a régua.
- `reviewer_notes` (44 em 2026) **não** conta como análise: é a devolutiva
  pedindo ajuste ao proponente ("Favor reduzir os custos"). Vira uma pastilha
  própria, porque 31 projetos têm só isso — a equipe já olhou, mas não opinou.
- **Onde aparece:** pastilha na coluna "Análise prévia" de `/projetos` (com a
  data da última alteração), a mesma pastilha no cabeçalho da pasta do projeto,
  KPI "39 de 242 · 203 sem parecer nem tags", e **dois filtros globais** —
  Análise prévia (analisados/não) e **Tags**, que responde a pergunta
  que motiva a triagem: quais projetos batem com cada objetivo ("Janela 10/40",
  "Povos Não Alcançados", e o "Projetos Validados" que a equipe usa como visto).
- **Sobre datas e autoria: a origem não tem.** Não há coluna de quem escreveu o
  parecer nem de quando. `updated_at` é "última alteração do registro" (o
  proponente também edita) — serve para ordenar a fila de trabalho, e está
  escrito "alterado", nunca "analisado em". Ordenar pela coluna põe os **não
  analisados primeiro**, do mexido mais recentemente para o mais antigo.
- ⚠️ Junto: parecer com HTML vazio (`<p></p>`, 5 casos em 2025) deixou de contar
  como parecer — uma regra só (`TEM_PARECER`, em `queries.ts`), que também tirou
  o cartão "Parecer" em branco da pasta do projeto.
- **O parecer é HTML de editor, e agora é desenhado como tal** (`src/lib/html.ts`).
  A mesa lia `<p>Projeto bem estruturado</p><strong>Score: 70/100</strong>` na
  tela. Não é só o parecer: dos campos longos da origem, **97 pareceres + 5
  justificativas/resultados** vêm com marcação (o resto é texto puro), então
  quem decide é o `Campo` da pasta — `ehHtmlRico` manda para o `innerHTML`, o
  resto continua no caminho de texto do React (jogar texto puro no `innerHTML`
  comeria "R$ 5 < 10" e "M&M"). `sanitizarHtml` é **lista de permissão** (p, br,
  strong, b, em, i, u, s, ul, ol, li, blockquote) e **derruba todo atributo** —
  é o que mata `onerror=`, `style=` e `href="javascript:"`; `<script>`/`<style>`
  saem com corpo e tudo, e `<p><br></p>` (a linha em branco do editor) colapsa.
  Sem biblioteca de sanitização: 40 linhas puras, cobertas por `npm test` com os
  vetores de XSS. **Fronteira de confiança de verdade** — o parecer é escrito
  num formulário de outro sistema, não aqui.

**Fase 11 (parcerias proativas)** — `/parcerias`: onde as agências parceiras
(APMT, JMM, Pioneiros, JMN/IPB, JMN/CBB — relações em `data/db-*.csv`; a JMM
manda também uma lista só de países, `db-jmm-paises.csv`, que pinta sem somar gente) têm missionário e
a Hebron ainda não chegou. **Mundo:** país laranja = agência lá e nenhum projeto
avaliável nesta remessa (49 em 2026), verde = tinha aprovado no ciclo anterior
e sumiu (16, "retomar"). **Brasil:** UF laranja = zero projetos (7 em 2026,
todas com missionário JMN); ponto = cidade com missionário, verde se está no
**top 100 de demanda por produtos Hebron** (`data/ranking-dd.csv`); cada UF
mostra o melhor candidato (missionário na cidade de maior demanda). Mapa do
Brasil = GeoJSON oficial IBGE vendorizado (`data/brasil-uf.json`) + centróides
municipais gerados por `npm run municipios:regen`; zoom/pan é `viewBox` na mão.
UF selecionada no mapa → "Ver N projetos submetidos em Projetos & Pastas"
(filtro global `uf`, ficha na barra, como o país clicado; tabela de UF em
`src/lib/uf.ts`, pura). Aqui só **Status** e **Continente** valem — os outros
filtros encolheriam os pedidos e pintariam de "sem pedido" país com projeto;
são ignorados com aviso na tela.
A ★ na tabela **marca candidato** → `data/parcerias_candidatos.csv` (segunda
escrita do painel, fora da origem, mesmo padrão do link do Drive). Regras puras
em `src/lib/parcerias.ts` (testadas); leitura em `parcerias-dados.ts`;
`npm run check` 4c lista o que não casou. Manual:
[`docs/fase11-parcerias.md`](docs/fase11-parcerias.md).

**Fase 12 (a diretriz orçamentária na entrada)** — `/` passou a ser o **Resumo
Executivo**, a tela de abertura da reunião (a Visão Geral virou `/visao-geral`).
O presidente da associação fixou a divisão do teto — **Missões 50% · Construção
de igrejas 25% · Outros 20% · Social 5%** — e a pergunta que abre a mesa é se o
que foi submetido cabe nessa divisão.

- **Os percentuais são a diretriz; o de-para rubrica → categoria é leitura
  nossa** (a origem tem sete categorias, não rubricas). Os dois em
  `src/lib/rubricas.ts` (puro, testado), e a tabela mostra sob cada rubrica
  quais categorias entraram — é onde a mesa contesta o de-para em voz alta.
- **Base = projetos avaliáveis** (a mesma regra das pastas). Rejeitado, rascunho
  e cancelado ficam fora porque não disputam o teto: em 2026 são **R$ 7,1 mi**
  que inflavam toda a aderência (pedido "total" de R$ 21,2 mi → R$ 14,06 mi).
- **O achado:** o teto (R$ 14,5 mi) cobre o pedido inteiro; o aperto é na
  divisão. Missões pede 46,6% (alvo 50%), Construção 23,1% (25%), Outros 20,9%
  (20%) — e **Social pede 9,4% para um alvo de 5%, R$ 591 mil acima do seu
  envelope**. Em 2025 o conselho aprovou Missões em 50,0% exatos e Social em
  11,5%: a diretriz descreve a prática, **menos em Social**.
- **O recorte global não vale aqui** (o veredito é lido em voz alta e um atalho
  para as renovações o tornava falso); o aviso laranja diz quando há filtro
  ligado. A tela traz o veredito como `<h1>`, a tabela de rubricas, uma matriz
  renovação × novo por rubrica e duas listas curtas com nome (renovações que
  pedem mais que o dobro; os 10 maiores novos). A relação inteira mora em
  Projetos & Pastas. **A cortar** (pedido − teto) e **A remanejar** (excesso que
  cabe na folga das outras rubricas) são duas contas, e o desvio em reais e a
  régua saem da mesma (`desvio / teto`).
- **Régua de desvio** (`.regua`): barra divergente com zero no meio, laranja à
  direita (acima do envelope), azul à esquerda. Lado + cor + a palavra na célula
  — três codificações, porque é TV a três metros e fotocópia.
- Pipeline & Avaliação desceu para o menu "Mais": a fileira do topo tem o mesmo
  teto dos filtros, e é a página com menos a dizer nesta remessa (zero
  avaliações em 2026).
- ⚠️ **Dois defeitos de impressão da casa corrigidos junto:** o `href` impresso
  ao lado de cada título virava parede de uuid dentro de tabela (250 linhas em
  `/projetos`) — agora só imprime fora de tabela; e `tfoot` (`table-footer-group`)
  repetia o total final no pé de cada página da relação.

Manual: [`docs/fase12-resumo.md`](docs/fase12-resumo.md).

**Fase 13 (login e publicação na Vercel)** — só 3 pessoas entram (Filipe,
Wendel, Guilherme Pereira; `user_id` em `PAINEL_USUARIOS`), com a **mesma senha
do sistema de submissão**: `extensions.crypt` (pgcrypto) confere o bcrypt de
`auth.users` num `SELECT` — hash não sai do banco, nada gravado na origem (é a
única leitura do schema `auth`). Sessão = cookie HMAC de 12 h
(`src/lib/sessao.ts`), portão em `proxy.ts` **e** `exigirSessao()` em toda
Server Action. CSP/HSTS/noindex em `next.config.ts`. Variáveis da Vercel,
rate limit e o que segue aberto: [`docs/publicacao.md`](docs/publicacao.md).

**Próximo passo:** nada obrigatório. Em aberto, só se a equipe pedir: exportar PNG
(hoje é PDF pela impressão), zoom/pan no mapa e ler .docx no visor (o
descompactador já está lá; falta extrair o texto de `word/document.xml`).

### Planejamento (entregue antes)

- Diagnóstico completo do banco → [`docs/banco-de-dados.md`](docs/banco-de-dados.md)
- Plano do dashboard → [`docs/plano-dashboard.md`](docs/plano-dashboard.md)
- Normalização de país (de-para ISO) → [`docs/normalizacao-paises.md`](docs/normalizacao-paises.md)
- **Enriquecimento sem tocar na origem** → [`docs/enriquecimento-dados.md`](docs/enriquecimento-dados.md)
- Dados do enriquecimento (fonte de verdade): [`data/country_map.csv`](data/country_map.csv), [`data/institution_enrichment.csv`](data/institution_enrichment.csv), [`data/projetos_avaliacao.csv`](data/projetos_avaliacao.csv), [`data/avaliadores.csv`](data/avaliadores.csv), [`data/prestacao_links.csv`](data/prestacao_links.csv), [`data/parcerias_candidatos.csv`](data/parcerias_candidatos.csv)
- Esquema opcional de banco próprio do dashboard → [`docs/country_map.sql`](docs/country_map.sql) (NUNCA na origem)
- Script do papel de leitura, **para a equipe rodar** → [`docs/bi_readonly.sql`](docs/bi_readonly.sql)
- Manual de marca (fornecido pelo cliente) → [`.docs/Identidade Visual da Hebron Aseec.md`](.docs/Identidade%20Visual%20da%20Hebron%20Aseec.md)
- **Quem usa, com que tom, e o que NÃO fazer** → [`PRODUCT.md`](PRODUCT.md)
  (contexto estratégico; os princípios de design saem dali, não de reflexo)

Artefatos visuais publicados (versão apresentação, claude.ai):

- Diagnóstico do banco: https://claude.ai/code/artifact/ef01dc43-ce25-4998-98ab-1589ec5c5caa
- Plano do dashboard: https://claude.ai/code/artifact/10441c8c-fcb9-463c-834c-5bab2313a047

### Pendências abertas com a equipe

Levantadas na Fase 1:

1. **Orçamento 2025:** as linhas `confirmado` de `resource_allocations` são de teste;
   a linha real está como `rascunho`. Qual vale?
2. **Teto de conveniadas em 2026 = R$ 0** na linha confirmada — ainda não definido?
3. **Colunas curadas** do enriquecimento (anos de parceria, tipo, observações) seguem
   vazias nas 146 instituições — preenchimento é da equipe, no CSV.
4. Trocar a credencial `postgres` por `bi_readonly` ([`docs/bi_readonly.sql`](docs/bi_readonly.sql));
   atenção ao RLS (39 tabelas com RLS; sem `BYPASSRLS` o papel lê zero linha).

Levantadas na Fase 4:

5. **Prestação de contas em 11,2%:** só 25 dos 223 projetos aprovados em 2025 têm
   relatório — **R$ 10,24 mi aprovados sem prestação**. É subuso do módulo ou cobrança
   em aberto? (A Fase 9 dá a saída de emergência — colar o link do Drive —, mas o
   sistema de submissão continua sem o relatório: a pendência é com a equipe.)
6. **2 relatórios com `cycle_id` da remessa errada** (carimbados 2026, projetos de 2025).
   O painel casa pelo projeto e sinaliza; a origem é que precisa do acerto.
7. **43 das 146 instituições sem nenhum documento enviado** (5 tipos exigidos), e
   **1 conjunto de documentos órfão** (`institution_id` sem instituição).

Levantadas na Fase 5 (ver [`docs/fase5-projetos.md`](docs/fase5-projetos.md)):

8. **54 projetos de 2026 na faixa "a revisar":** o casamento com 2025 é plausível
   mas não conclusivo. A equipe decide na coluna `tipo` de
   `data/projetos_avaliacao.csv`; até lá contam como novos e ocupam pasta.
9. **9 projetos de 2025 vinculados por mais de um de 2026** — inclui duas
   submissões duplicadas em 2026 (`Projeto Timoteo`, `Missão Vida Internacional`).

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
- Satélites por `project_id`+`cycle_id`: `cycle_project_evaluations` (nota +
  `general_comments`), `cycle_project_votes`, `cycle_project_status_history`,
  `cycle_project_budget_allocations`, `cycle_budget_reservations`,
  `cycle_project_accountability_reports`, `cycle_project_attachments` (1.792 anexos:
  vídeo, orçamento, cronograma, portfólio…).
- ⚠️ **Não existe vínculo entre remessas:** nenhuma coluna liga o projeto de 2026 ao
  de 2025. Novo × renovação por projeto é derivado fora da origem (Fase 5).
- Os três buckets do Storage são **públicos** — `file_path` vira URL direta em
  `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<file_path>`.
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

**Fase 2 (em uso):** Next.js 16 (App Router) + React 19 sobre `src/lib/`. Server Components
chamam a fachada `dados.*` — é essa a "API de leitura", sem rotas REST. Mapa sem biblioteca
de mapas: `d3-geo` + `topojson-client` projetam **no servidor** e mandam paths SVG prontos
(TopoJSON vendorizado em `data/countries-110m.json`, casando por **ISO-3** via
`i18n-iso-countries`). Botão "Atualizar" = Server Action → `atualizar()`.

**Fase 5 (em uso):** nenhuma biblioteca nova — nem para a exportação: `.xlsx` é um
zip de XMLs, e `src/lib/xlsx.ts` escreve um (sem compressão, sem estilos) em ~200
linhas puras; o PDF continua sendo `window.print()`. O casamento de título entre remessas
é Sørensen–Dice sobre bigramas, ~30 linhas em `src/lib/recorrencia.ts` (o Postgres
da origem **não** tem `pg_trgm`, e instalar extensão lá está fora de questão).
Vídeo e anexos vêm direto dos **buckets públicos do Storage** (`<video>` nativo com
Range — HTTP 206 confirmado), sem SDK do Supabase e sem rota de proxy.

**Fases 3 e 4 (em uso):** nenhuma biblioteca nova. Gráficos são barras em CSS e
`<table>`; apresentação/TV é uma classe no `<body>` + `requestFullscreen()`; exportar
PDF é `window.print()` com folha `@media print`. Recharts/visx entram quando aparecer
um gráfico que CSS não resolve (dispersão, série temporal).
Nenhuma escrita na origem em nenhum momento.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
