# Fase 15 — Envelopes da diretriz (`/envelopes`)

A tela em que a mesa confere se a remessa respeita a divisão do teto definida na
reunião (sugerida pelo presidente, corroborada pela diretoria) e ajusta, projeto
a projeto e mês a mês, até caber.

| Envelope                        | Diretriz | O que entra                                                                                                              |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Missões                         | 50%      | Missões transculturais e nacionais, plantação de igrejas, sustento/cuidado de missionários, **saúde**                    |
| Construção e reforma de igrejas | 25%      | Obra: construção, reforma, terreno, estrutura física                                                                     |
| Educação                        | 6,8%     | Bolsas, formação teológica, capacitação de líderes                                                                       |
| Projetos sociais cristãos       | 6,8%     | Ação social com propósito cristão                                                                                        |
| Social (oferta de misericórdia) | 2%       | Projetos/ofertas para **não cristãos**, sem evangelização como fim ou pano de fundo. **Nunca atribuído automaticamente** |
| Custos administrativos          | 9,4%     | Digitado mês a mês na própria tela; não recebe projeto                                                                   |

Tudo em [`src/lib/envelopes.ts`](../src/lib/envelopes.ts) (puro, testado).

## De onde vem cada número

- **Envelope do projeto:** mesa (Firestore `envelopes`) › avaliação do conteúdo
  (`AVALIACAO`, 15 projetos de 2026 em que o conteúdo discorda da categoria,
  com o motivo em uma linha, visível na tela) › categoria (`PADRAO_CATEGORIA`;
  saúde e "outros" vão para Missões). Escolher na tela o mesmo envelope da
  sugestão grava `null` (volta a seguir a sugestão).
- **Pedido mês a mês:** `requested_amount` dividido igualmente nos meses de
  `meses_parcelas` (em centavos, a soma fecha). 34 projetos de 2026 não
  informam os meses: o pedido é dividido em 12 e a linha diz isso.
- **Proposta** (o que soma contra o limite), nesta ordem:
  1. decisão da pasta **reprovado / adiado / devolvido** → zera (linha cinza);
  2. mês a mês **ajustado na mesa**;
  3. **valor aprovado da decisão** na pasta, distribuído nos meses do pedido;
  4. **aprovado no sistema** (`status = aprovado` com `approved_amount`);
  5. o **pedido**.
- **Limite** = teto da remessa × diretriz (o mesmo teto do Resumo).
- **Custos administrativos** ainda não digitados (ou doze zeros) **reservam o
  próprio limite**, aqui e no Resumo: sem isso o teto parecia "cobrir tudo"
  esquecendo um custo que vai existir.

## A tela

1. **Veredito** em uma frase (quais envelopes passam do limite, onde há folga).
2. **Quadro dos envelopes** — sempre a remessa inteira (avaliáveis), sem o
   recorte global, pelo mesmo motivo do Resumo. Limite, pedido, proposta,
   saldo, régua divergente e as 12 colunas do mês (R$ mil). A linha de custos
   administrativos é editável. Clicar no nome do envelope filtra a lista.
3. **Lista de projetos** — segue o recorte global **e** o filtro por envelope
   (fichas acima da tabela; `?envelope=missoes` na URL, que é como o Resumo
   linka). **Votados primeiro** (aprovado no sistema ou com nota de diretor),
   da maior nota média para a menor (mediana e nº de notas desempatam); o resto
   do maior pedido para o menor. Cabeçalho, coluna do projeto e soma grudados.

O filtro por envelope ficou **na tela**, não na barra global: a barra está no
teto de oito eixos (CLAUDE.md), e o envelope só tem sentido aqui e no Resumo.

### Edição

- Clicar numa célula abre o campo. **Enter** grava e desce, **Tab / Shift+Tab**
  grava e anda para o lado, **Esc** desiste. Sair sem mudar não grava nada.
- Digitar a **Proposta** (total) redistribui igualmente nos meses do pedido.
- Mês ajustado fica em azul, negrito e **sublinhado pontilhado** (o que
  sobrevive à fotocópia); o pedido original aparece ao passar o mouse.
  "Desfazer ajuste" apaga o mês a mês da mesa.
- Cada gravação é otimista: a tela muda na hora e desfaz se o servidor recusar
  ("Gravando…" / "Gravado: …" / o erro, numa região `aria-live`).
- Sem `FIREBASE_SERVICE_ACCOUNT` a tela é só leitura, com aviso.

### Uma fonte só para o valor aprovado (pasta do projeto)

Havendo mês a mês ajustado, o valor da **Decisão registrada no painel** é a
soma dele: o campo fica só leitura na pasta, o servidor grava a soma, e a
linha aponta para Envelopes.

## Banco do painel (Firestore)

- `envelopes/{projectId}` `{ ano, titulo, envelope, meses[12], atualizadoEm, atualizadoPor }` + `historico`
- `envelopes_admin/{ano}` `{ ano, meses[12], atualizadoEm, atualizadoPor }` + `historico`

Nada vai para a origem. Depois da consolidação com a diretoria, é daqui que
sai o que segue para o banco de projetos (exibição a parceiros e submissores);
essa exportação **não** faz parte desta fase.

## Impressão

As duas tabelas saem em folha **A4 paisagem** (página nomeada `@page paisagem`,
corpo de 7,5 pt); o veredito fica em retrato. O select vira texto e as fichas
de filtro somem.

## O que mudou junto

- **Resumo Executivo** usa os envelopes (mesma atribuição projeto a projeto) e
  a linha de custos administrativos; "N projetos pedem" passou a ser só dos
  projetos, e a conta contra o teto inclui o administrativo. `montarDiretriz`
  (`src/lib/rubricas.ts`) recebe o envelope do chamador (`chaveDe`).
- Aba **Envelopes** no topo; **Parcerias** desceu para "Mais".
- `Regua` saiu do Resumo para `ui.tsx` (as duas telas usam).
- Bug corrigido no caminho: abrir uma célula do administrativo e sair sem
  digitar gravava doze zeros.

## Fase 15b — caixa, receita e parcelas (depois da crítica de 18/11)

A crítica (nota 23/40) achou dois problemas de conta e vários de uso; todos
entraram.

- **A base dos percentuais é a RECEITA.** A origem monta o teto assim:
  faturamento × % de doação × margem = **receita** (R$ 17.325.000 em 2026);
  menos custos administrativos (R$ 1,75 mi) = teto (R$ 15.575.000). Aplicar a
  diretriz sobre o teto descontava o administrativo duas vezes. Agora
  `limite = receita × diretriz` e o teto vira resultado, numa linha de
  conferência contra o do sistema (`receitaDoSistema`, `montarCaixaAno`).
- **Caixa mês a mês** (primeiro bloco da tela): saldo inicial (editável, pode
  ser negativo) · **receita prevista** (editável por mês; sem digitar, receita
  do sistema ÷ 12, em itálico) · (−) custos administrativos (editável; sem
  digitar, 9,4% da receita do mês) · (−) projetos, aberto por envelope · saldo
  do mês · saldo acumulado (mês negativo em negrito, com "−" e "falta").
  Apagar um valor digitado volta ao padrão. `envelopes_caixa/{ano}` guarda
  receita e saldo inicial; `null` = não digitado (`fluxo`, testado).
- **A reserva do administrativo não some mais**: digitar um mês só muda aquele
  mês (`null` por mês, `versao: 2`; docs antigos têm o zero lido como null).
- **Baixar a parcela de um mês pergunta para onde vai a diferença**, dentro da
  célula, sem janela: 1 passar para o mês seguinte · 2 redistribuir nos outros
  meses com parcela · 3 cortar. Enter repete a última escolha; Esc desiste
  (`tirarDoMes`). Subir um mês soma direto.
- **Espalhar:** "12 meses" na célula da Proposta espalha o total de jan a dez;
  digitar um total espalha nos meses que já têm parcela (`mesesParaTotal`).
- **Mês com caixa negativo** oferece, abaixo do caixa, "adiar para o mês
  seguinte as parcelas dos projetos sem nota", com confirmação mostrando
  quantos projetos e quanto; grava em lote, com histórico por projeto.
- **Quadro de envelopes** ficou anual (7 colunas): os meses moram no caixa.
- **Lista:** setas andam entre as células (uma parada só no Tab), Enter ou um
  número abre a célula, o foco volta para a célula ao fechar; o campo ocupa a
  célula; célula editável tem um traço discreto em repouso; título em até 2
  linhas, nota e mediana numa linha, origem do envelope só quando é mesa ou
  avaliação (11 linhas por tela, antes 9); **empate dito como empate**
  ("1º=", e o subtítulo conta quantos empatam no topo).
- **Veredito** ganhou a frase do caixa e deixou de chamar de "folga" a
  misericórdia; meses na TV em corpo de interface; impressão com campos de
  documento (responsável, data, versão) e caixa e lista em folha paisagem.
- O **Resumo Executivo** usa a mesma receita e o mesmo administrativo do caixa.

Nos testes de interação, o navegador de teste recusa todo POST (nada grava).
Um teste anterior gravou por engano R$ 1.000 em jun de "Reforma da Igreja
Tiryó"; o doc e o histórico (só daquela sessão) foram apagados.

## Fase 15c — classificação, ordenação e envelope sob o nome

- **Envelope embaixo do projeto**, no começo da linha da instituição, com
  rótulo curto (`Envelope.curto`: Missões, Construção, Educação, Sociais,
  Misericórdia). A coluna própria saiu; os 12 meses cabem a 1600 px. O motivo
  da avaliação aparece numa linha em itálico só nos projetos que têm motivo;
  "mesa" marca o que a mesa escolheu.
- **Classificação** (`grupoNaLista`, `compararNaLista`, testadas):
  aprovados (no sistema, ou "Aprovado"/"Aprovado com ressalvas" na pasta) ›
  votados sem decisão › sem voto › **fora da proposta** (pasta reprovou, adiou
  ou devolveu) no fim. Dentro do grupo, nota média (mediana e nº de notas
  desempatam); sem nota, o pedido. Coluna **Clas.** com a colocação dos
  aprovados e votados ("1º=" no empate, que só vale dentro do mesmo grupo).
  Separador com o nome e a contagem de cada grupo.
- **Ordenar por coluna**: Clas., Projeto (A–Z), Pedido, Proposta e cada mês;
  clicar de novo inverte (`aria-sort`). Ordenando por um mês aparece "Só com
  parcela em [mês]"; "Voltar à classificação" restaura. Fora da classificação
  os separadores somem e a colocação continua na coluna Clas.

### Banco do painel indisponível (cota do Firestore)

Em 18/11 a cota diária de leituras do Firestore acabou
(`RESOURCE_EXHAUSTED`), em parte pelos testes no navegador e pelas recargas do
`npm run dev`. Como o layout lê a triagem no Firestore, **o painel inteiro
caía**. Agora toda leitura de `painel-db.ts` é tolerante (`tolerante`,
`falhaDoBanco`): devolve vazio, registra a falha, o layout mostra um aviso e a
tela de Envelopes fica só leitura. A origem continua normal. Limite conhecido:
a triagem lida durante a falha fica no cache de 15 min; "Atualizar" relê.

## Fase 15e — diretriz editável e a planilha .xlsx

- **Percentual por envelope editável** na coluna Diretriz do quadro "Envelopes
  no ano" (clicar, digitar em pontos: "6,8" ou "6,8%"; vazio volta ao da
  reunião; Enter desce para o envelope seguinte). Diferente da reunião fica
  marcado; "Voltar à diretriz da reunião" no rodapé apaga tudo. Grava em
  `envelopes_caixa/{ano}.alvos` (null = diretriz da reunião), com histórico,
  sem leitura nova no Firestore. Vale para o limite, para a **reserva do
  administrativo** e para o **Resumo Executivo** (`montarDiretriz` recebe os
  alvos).
- **Soma ≠ 100% avisa, não bloqueia**: mudar 50/25 para 45/30 passa por 95%.
  O total do quadro fica laranja e uma linha diz quanto da receita ficou fora
  de envelope (ou quanto os limites passam dela).
- **Exportar .xlsx** (canto da seção Projetos): `src/lib/envelopes-xlsx.ts`
  (puro, testado), sobre o escritor `xlsx.ts`, que agora escreve várias abas,
  estilos, fórmulas, validação, formatação condicional, mesclagem e impressão
  — ainda sem biblioteca. Quatro abas:
  - **Leia-me**: situação ao vivo (receita, proposta, saldo, envelopes acima
    do limite, meses negativos, soma da diretriz), legenda, como usar, regras.
  - **Caixa**: receita do sistema, saldo inicial, receita e administrativo
    digitados (em branco = padrão, itálico no fluxo), fluxo mês a mês com os
    envelopes, saldo do mês e acumulado (negativo em alerta), conferência.
  - **Envelopes**: Diretriz editável × Diretriz da reunião, limite, projetos,
    pedido, proposta, % da receita, saldo e situação.
  - **Projetos**: todos os avaliáveis na classificação da tela (sem o recorte
    nem o filtro por envelope, porque Caixa e Envelopes somam a remessa
    inteira), com **Envelope em lista suspensa** e **parcelas jan–dez**
    editáveis; o pedido mês a mês fica em colunas recolhidas; soma no topo
    com SUBTOTAL (segue o filtro).
  - Projetos é a única fonte: Caixa e Envelopes somam por SOMASES na coluna
    Envelope. Editável = fundo azul-claro, borda e fonte azul (destravada:
    "Proteger planilha" deixa só as entradas). Fórmulas levam o valor da tela
    em cache e o Excel recalcula ao abrir. Arial (as fontes da marca faltariam
    em quem recebe); a marca entra pelas cores.
  - Validado no Excel (COM): abre sem reparo, e trocar um percentual ou o
    envelope de um projeto recalcula limite, envelope e caixa.
  - Nada da planilha volta ao painel: é simulação.

## Números de 2026 (18/11/2026)

Teto R$ 15,58 mi. Proposta R$ 13,61 mi. **Educação passa R$ 659 mil** do
limite (pede R$ 1,72 mi para R$ 1,06 mi) e **Projetos sociais cristãos R$ 413
mil**; Missões tem R$ 503 mil de folga e Construção R$ 897 mil. Nenhum projeto
em misericórdia. **110 projetos já têm nota** (escala 0–5), não zero como na
Fase 6.
