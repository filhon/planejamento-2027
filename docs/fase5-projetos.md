# Fase 5 — Pasta do projeto, triagem novo × renovação e divisão das pastas

> Manual da feature. Para o resto do painel, ver [`fase3-analise.md`](fase3-analise.md)
> e [`fase4-reuniao.md`](fase4-reuniao.md).

## O problema

A reunião trata dois tipos de projeto de formas diferentes:

- **Renovação** (projeto que já existia na remessa anterior): só a equipe ASEEC
  analisa — prestação de contas, valor pedido — e dá o parecer de renovar ou não.
- **Projeto novo**: é dividido entre os **diretores e conselheiros**. Cada um
  avalia a fundo os seus, apresenta na reunião, e aí todos votam individualmente.

Para isso o painel precisa responder, **por projeto**: é novo? Se não é, quanto
recebeu no ano passado? E de quem é a pasta?

## O que não existia

Nada disso existia em lugar nenhum:

- `cycle_projects` **não tem** `previous_project_id` nem equivalente. A origem não
  liga um projeto de uma remessa ao da anterior.
- `data/institution_enrichment.csv` é chaveado por `institution_id`: "recorrente"
  e "recebido em 2025" eram **por instituição**, não por projeto.
- Não há tabela de atribuição de avaliador a projeto.

E instituição recorrente **não** implica projeto recorrente: das 266 submissões
de 2026, 226 vêm de instituição que já submeteu em 2025, mas só uma parte delas
é renovação. O resto é projeto novo de parceiro antigo.

## A solução: casamento automático + confirmação da equipe

Segue a doutrina do projeto ([`enriquecimento-dados.md`](enriquecimento-dados.md)):
**derivável → `SELECT`; curado → CSV**. A origem continua intocada.

### 1. Casamento de título ([`src/lib/recorrencia.ts`](../src/lib/recorrencia.ts))

Para cada projeto da remessa aberta, procura o candidato mais parecido **na mesma
instituição** dentro da remessa anterior:

1. **Normaliza** o título: sem acento, sem pontuação, sem ano solto (`Boa Semente
2026` = `Boa Semente 2025`) e sem palavra vazia — inclusive `"projeto"`, que
   abre metade dos títulos da base.
2. **Sørensen–Dice sobre bigramas de caractere.** Dice em vez de distância de
   edição porque o que muda entre remessas costuma ser acréscimo de palavra
   (`Curso de Introdução Bíblica` → `Projeto de continuidade e expansão — Curso
de Introdução Bíblica nas aldeias`), e Levenshtein pune acréscimo longo.

Faixas (`LIMIAR`):

| Nota          | Sugestão    | O que significa                                 |
| ------------- | ----------- | ----------------------------------------------- |
| **≥ 0,82**    | `renovacao` | casamento seguro                                |
| **0,50–0,82** | `revisar`   | plausível, não conclusivo — **a equipe decide** |
| **< 0,50**    | `novo`      | ruído; o candidato nem aparece no CSV           |

Na remessa 2026 isso dá **80 renovações · 132 novos · 54 a revisar**.

A faixa `revisar` existe porque a decisão é genuinamente humana. Exemplos reais
que o algoritmo não pode resolver sozinho:

- `Cresce Criança Caruaru` vs `Cresce Criança Mirandiba` — mesmo programa, cidade
  diferente: é projeto novo.
- `Auxílio de Sustento Ministerial - Dario e Artemiza` vs `… Elton e Lourdes` —
  mesmo modelo de título, casal diferente.
- `PROJETO DE CONTINUIDADE E EXPANSÃO — CURSO DE INTRODUÇÃO BÍBLICA…` vs
  `Curso de Introdução Bíblica Verbo da Vida nas Aldeias` — **é** renovação.

Enquanto não decidida, `revisar` **conta como novo** e vai para uma pasta: errar
para o lado de alguém ler o projeto é barato; deixar projeto novo sem dono na
reunião não é.

### 2. Divisão das pastas

Guloso pela menor carga, entre os **diretores e conselheiros ativos** (`profiles`
com `role in ('diretor','conselheiro')` e `is_active`, menos quem estiver marcado
`ativo = não` em `data/avaliadores.csv`).

#### Quem fica de fora

`avaliavel()` em [`agregar.ts`](../src/lib/agregar.ts) — regra de **status**,
separada da triagem, e vale inclusive para quem está em `revisar`:

| Status                         | Entra em pasta? | Por quê                                           |
| ------------------------------ | --------------- | ------------------------------------------------- |
| `em-validacao`, `submetido`, … | **sim**         | candidatura viva                                  |
| `devolvido-para-correcao`      | **sim**         | foi submetido; ainda pode voltar corrigido        |
| `rascunho`                     | não             | escrito e **nunca submetido** — não é candidatura |
| `rejeitado` / `reprovado`      | não             | já decidido                                       |
| `cancelado`                    | não             | retirado                                          |

Cada vaga de pasta é tempo de leitura de alguém. Na remessa 2026: 186 novos −
**24 fora** (17 rejeitados + 8 rascunhos, contando os que não são renovação) =
**162 projetos em pasta, 19 a 21 por avaliador** (8 pessoas).

#### Estabilidade

**Nada é reatribuído.** Projeto que já tem responsável fica com ele. Rodar de novo
quando chegarem submissões novas só distribui as que faltam — a pasta de quem já
se preparou não muda. É o requisito central, já que projeto continua chegando até
o fim do mês.

#### Depois de editar o CSV, o que rodar

| O que você quer                                  | O que rodar                                 |
| ------------------------------------------------ | ------------------------------------------- |
| que o **painel** reflita suas edições            | **nada** — só "Atualizar" no painel         |
| **nivelar as pastas** depois das mudanças        | `npm run avaliacao:regen -- --reequilibrar` |
| distribuir só os **projetos novos que chegaram** | `npm run avaliacao:regen`                   |

O painel lê os CSVs ao vivo (cache de 15 min, que o botão "Atualizar" derruba).
Marcar `tipo = renovacao` tira o projeto da pasta **na hora**, sem script.

**Garantia do regen:** as quatro colunas curadas (`tipo`, `projeto_anterior_id`,
`responsavel`, `observacoes`) são gravadas de volta **exatamente como você
digitou** — nunca o valor efetivo. Isso importa: se o script gravasse o efetivo,
preencher só `projeto_anterior_id` carimbaria a sugestão na coluna `tipo` e o
palpite do algoritmo viraria decisão da equipe sem ninguém ter decidido nada.

A única coluna curada que o script mexe é `responsavel`, e só em dois casos, sempre
reportados na saída:

1. o projeto **saiu da avaliação** depois de distribuído — você marcou
   `tipo = renovacao`, ou ele foi rejeitado/cancelado/voltou a rascunho;
2. o responsável foi **desativado** em `data/avaliadores.csv`.

Sem isso o projeto fica órfão: some das pastas (que só listam avaliador ativo) e
nunca é redistribuído. Um nome que **não está** em `avaliadores.csv` é atribuição
manual deliberada e não é tocado por regra nenhuma — nem devolve vaga (não ocupa
nenhuma), nem entra no `--reequilibrar`.

#### As pastas encolhem sozinhas — e a reposição é explícita

Devolver a vaga **não repõe**: a rodada normal só distribui projeto SEM dono, e
depois da primeira distribuição não sobra nenhum. Então a pasta simplesmente
encolhe. Dois caminhos levam a isso:

- **a equipe revisa e marca `tipo = renovacao`.** O projeto sai da pasta na hora,
  no painel, sem rodar script nenhum (o `tipo` curado vence a sugestão; basta
  "Atualizar"). Se calhar de vários caírem na mesma pasta, aquele avaliador fica
  com menos que os outros.
- **entra um diretor ou conselheiro novo.** Ele aparece sozinho em
  `data/avaliadores.csv` no próximo regen, mas começa com **zero** projetos.

Nos dois casos o script e o `npm run check` **avisam**:

```
AVISO: pastas desequilibradas (13 a 21)
  Rodar `npm run avaliacao:regen -- --reequilibrar` nivela movendo o mínimo:
  só quem está acima do teto solta projeto; as outras pastas não são tocadas.
```

`--reequilibrar` calcula a cota (`piso` ou `piso+1` por pessoa, a maior para quem
já tem mais), solta só o excedente e reparte. **Quem já está no ponto não é
tocado** — é a diferença para refazer tudo do zero, que embaralharia a preparação
de quem já começou a estudar.

Exemplo real, simulando 8 projetos do Josimar reclassificados como renovação:

|                                 | Josimar | demais | movimentos                    |
| ------------------------------- | ------- | ------ | ----------------------------- |
| antes                           | 21      | 19–21  | —                             |
| a equipe marca 8 como renovação | **13**  | 19–21  | 0 (automático no painel)      |
| `-- --reequilibrar`             | **19**  | 19–20  | **6 projetos mudam de pasta** |

Diferença de 1 ou 2 projetos entre pastas é só o arredondamento da divisão — o
aviso só dispara com alguém em zero ou com buraco maior que 2.

## Os arquivos

### `data/projetos_avaliacao.csv` — uma linha por projeto da remessa

| Colunas **derivadas** (regeradas a cada rodada)                                                                                                                                                                | Colunas **curadas** (nunca sobrescritas)                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `project_id` `ano` `titulo` `instituicao` `instituicao_id` `status` `solicitado` `sugestao_tipo` `similaridade` `sugestao_projeto_anterior_id` `sugestao_projeto_anterior_titulo` `sugestao_recebido_anterior` | `tipo` `projeto_anterior_id` `responsavel` `observacoes` |

Como a equipe usa:

- **Discordou da sugestão?** escreva `novo` ou `renovacao` na coluna `tipo`. Vale
  na hora no painel (basta "Atualizar"); se virar renovação, o projeto sai da
  pasta do responsável imediatamente.
- **O casamento errou de projeto?** cole o uuid certo em `projeto_anterior_id`.
- **Quer trocar o dono da pasta?** escreva outro nome em `responsavel`.
- **Contexto para a reunião?** `observacoes` aparece na pasta do projeto.

> `sugestao_recebido_anterior` é só referência para quem lê a planilha. **O valor
> que o painel mostra é lido da origem** pelo vínculo efetivo — corrigir
> `projeto_anterior_id` corrige o número na tela sem regerar nada.

### `data/avaliadores.csv` — quem divide as pastas

`user_id, nome, papel, ativo`. A coluna **`ativo`** é curada: escreva `não` para
tirar alguém da rodada (afastamento, conta de teste). Só um `não` explícito exclui.
Ao rodar o regen depois, os projetos que estavam com essa pessoa voltam para a
fila e são redistribuídos entre os que sobraram.

### Comandos

```bash
npm run avaliacao:regen                    # gera/atualiza os dois CSVs
npm run avaliacao:regen -- --dry           # só mostra o que mudaria
npm run avaliacao:regen -- --ano=2026
npm run avaliacao:regen -- --reequilibrar  # nivela as pastas (move o mínimo)
npm run check                              # seção "4b. Triagem da reunião"
```

`--dry` combina com os outros: `-- --dry --reequilibrar` mostra como ficariam as
pastas sem gravar nada.

O relatório do regen avisa quando **dois projetos casam com o mesmo projeto
anterior** — sinal de vínculo errado ou submissão duplicada (hoje: 9 casos, entre
eles dois `Projeto Timoteo` e dois `Missão Vida Internacional` idênticos em 2026).

## As páginas

### `/projetos` — Projetos & Pastas

- KPIs do recorte: novos, renovações, **recebido no ciclo anterior**, vínculos a decidir.
- **Cartões de pasta**: um por diretor/conselheiro, com contagem e valor solicitado.
  Clicar é "abrir a pasta do Fulano" — filtra a tabela para os projetos dele.
  Avaliador sem projeto continua na lista (com zero); a fila **sem responsável**
  vem por último, tracejada. Projeto fora da avaliação (rejeitado, rascunho,
  cancelado) não aparece em pasta nenhuma, nem se o CSV ainda tiver um nome na
  linha — a pasta mostra o que a pessoa vai apresentar.
- Tabela ordenável, com a coluna **"Recebeu &lt;ano anterior&gt;"** por projeto.
- Faixa de alerta quando há projeto fora da triagem (chegou depois do último regen).

Os filtros globais ganharam dois eixos, **Triagem** e **Responsável**, que cruzam
com continente/status/categoria como os demais e sobrevivem à troca de página.

#### Exportar (PDF e Excel)

No canto superior direito da tabela, dois botões levam **o recorte como está na
tela** — na mesma ordem em que ele está ordenado — para o diretor levar embora:

| Situação                   | O que sai                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **1 responsável** marcado  | capa com o **nome dele** e a lista da pasta abaixo                                      |
| **nenhum** responsável     | sem nome; a lista é o recorte dos filtros aplicados                                     |
| **2 ou mais** responsáveis | sem nome, com **aviso em destaque** de que a lista é a soma das pastas, não a de alguém |

Os dois formatos carregam os mesmos quatro campos: **título**, **instituição**,
**valor solicitado** e **recebido em &lt;ano&gt;** (o valor aprovado na janela do
ciclo anterior, pago no ciclo ativo — o `recebidoAnterior` da triagem). O
cabeçalho repete a linha de recorte da impressão (`resumoFiltros()` em
[`app/(painel)/formato.ts`](<../app/(painel)/formato.ts>), a mesma frase que sai
na ata), para o material do diretor e a ata nunca divergirem sobre quais números
estavam na mesa.

- **PDF** — uma janela nova com o documento montado e `window.print()`, a mesma
  escolha da Fase 4. Sem biblioteca de PDF: quem gera o arquivo é o navegador,
  em "Salvar como PDF". O desenho é de **documento de conselho**, não de painel
  fotografado:

  | Peça                     | Por quê                                                                                                      |
  | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
  | timbre + régua azul      | assina a folha; a régua vira cinza na fotocópia e continua separando                                         |
  | campos de identificação  | responsável, recorte, emissão, e os totais alinhados à direita                                               |
  | relação em `<table>`     | filete por linha, algarismo tabular, valores sem `R$` (a unidade vai no `th`)                                |
  | `thead` repetido         | a folha 3 continua dizendo o que é cada coluna                                                               |
  | linha de soma no `tbody` | totais no fim da relação, com régua grossa — e **não** num `tfoot`, que o navegador repetiria em toda página |

  Cor só no timbre e nas réguas: **o documento sai inteiro em preto e branco sem
  perder hierarquia nenhuma** (verificado em render com `grayscale(1)`). O título
  muda com o recorte — "Pasta de avaliação" com um responsável, "Relação de
  projetos" sem —, e o `<title>` carrega essa identificação porque o navegador o
  usa no cabeçalho corrente de cada página impressa e no nome sugerido do
  arquivo. As fontes vêm do Google Fonts e a impressão espera por elas
  (`document.fonts.ready`), senão a primeira página sairia em Times.

- **.xlsx** — quatro colunas, valores como **número** (para somar e filtrar no
  Excel), cabeçalho congelado. Escrito por
  [`src/lib/xlsx.ts`](../src/lib/xlsx.ts): um `.xlsx` é um zip de XMLs, e as
  entradas vão **sem compressão** — cabe em ~200 linhas puras e evita tanto uma
  dependência nova quanto o `CompressionStream`. Sem `styles.xml` de propósito:
  número formatado como moeda vira texto na hora de somar.

### `/projetos/[id]` — a pasta do projeto

Tudo o que a origem guarda, numa tela só, para abrir na TV enquanto o responsável
apresenta:

- cabeçalho com triagem, status, dono da pasta, área sensível, país, categoria;
- KPIs: solicitado, aprovado, **recebeu no ciclo anterior** (com a distinção
  explícita entre "deste mesmo projeto" e "projeto novo · a instituição recebeu X")
  e nota mediana;
- **vídeo tocando na página**, anexos, texto completo (descrição, justificativa,
  resultados, metodologia, natureza, parcerias, rede social), indicadores, equipe;
- **parecer da equipe ASEEC** (`parecer_aseec_texto`, `parecer_aseec_tags`,
  `reviewer_notes`);
- avaliações com nota **e comentário** de cada conselheiro, e votos por critério;
- na renovação, o **projeto anterior** com a **prestação de contas dele** — que é
  exatamente o que a equipe ASEEC analisa;
- instituição, histórico de status.

A barra de filtros some nesta rota: a pasta é tela de leitura.

## Vídeo e anexos — sem biblioteca nenhuma

Os três buckets do Storage da origem (`project-attachments`,
`accountability-documents`, `institution-documents`) são **públicos** e respondem
a `Range` (verificado: HTTP 206 num arquivo de 35 MB). Então:

- a URL é montada no servidor (`getStorageBaseUrl()` em [`src/lib/env.ts`](../src/lib/env.ts),
  que tira a referência do projeto do `IP_HOST` que já está no `.env.local`);
- o vídeo é um `<video controls preload="metadata">` apontando para ela.

Sem SDK do Supabase, sem rota de proxy, sem player. `preload="metadata"` importa:
uma pasta com vários vídeos não pode baixar dezenas de MB antes de alguém apertar
o play. Isso **não expõe nada de novo** — é a mesma URL que o sistema de submissão
já serve. Se um dia os buckets virarem privados, o ponto único de mudança é
`montarAnexo()` em [`src/lib/datasets.ts`](../src/lib/datasets.ts).

## Onde mora o quê

| Arquivo                                                       | Papel                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`src/lib/recorrencia.ts`](../src/lib/recorrencia.ts)         | casamento de título e distribuição — puro, sem I/O, testado        |
| [`src/lib/enrichment.ts`](../src/lib/enrichment.ts)           | leitura dos dois CSVs novos                                        |
| [`src/lib/datasets.ts`](../src/lib/datasets.ts)               | `projetoDetalhe()` e a junção da triagem em `ProjetoCiclo.revisao` |
| [`src/lib/agregar.ts`](../src/lib/agregar.ts)                 | filtros `tipo`/`responsavel` e `montarPastas()`                    |
| [`src/lib/xlsx.ts`](../src/lib/xlsx.ts)                       | escritor mínimo de `.xlsx` (zip + XML), puro e testado             |
| [`scripts/regen-avaliacao.ts`](../scripts/regen-avaliacao.ts) | o comando `avaliacao:regen`                                        |
| [`app/(painel)/projetos/`](<../app/(painel)/projetos/>)       | as duas páginas                                                    |

## Pendências para a equipe

1. **54 projetos na faixa `revisar`** — decidir novo × renovação na coluna `tipo`.
   Até lá, entram como novos e ocupam pasta.
2. **9 projetos de 2025 vinculados por mais de um projeto de 2026** — conferir.
   Dois deles são submissões duplicadas em 2026 (`Projeto Timoteo`,
   `Missão Vida Internacional`), que provavelmente devem ser resolvidas na origem.
3. **Só 32 dos 266 projetos de 2026 têm `parecer_aseec_texto`.** A seção do parecer
   fica vazia para os demais.

> `Ícaro (Diretor)` já foi marcado `ativo = não`; os 20 projetos dele voltaram
> para a fila e foram redistribuídos entre os 8 restantes.
