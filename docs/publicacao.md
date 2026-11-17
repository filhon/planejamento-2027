# Publicação na Vercel e login

## Quem entra

Só três pessoas: **Filipe Honório, Wendel Nascimento e Guilherme Pereira**.
Elas entram com o **mesmo e-mail e a mesma senha do sistema de submissão**. Não
há cadastro novo. A lista é de `user_id`, guardada na variável
`PAINEL_USUARIOS`. Não depende do papel: outro diretor, gerente ou parceiro
com senha válida não entra.

- **Conferência da senha** ([src/lib/auth.ts](../src/lib/auth.ts)): um `SELECT`
  com `extensions.crypt` (pgcrypto, já instalado na origem). O bcrypt é
  refeito dentro do Postgres. O hash nunca sai do banco e **nada é gravado na
  origem**: sem sessão no `auth`, sem `last_sign_in_at`.
- **Banido, apagado ou com e-mail não confirmado no outro sistema**: fica
  barrado aqui também. Quem troca a senha lá passa a usar a senha nova aqui
  na hora.
- **Sessão** ([src/lib/sessao.ts](../src/lib/sessao.ts)): um cookie
  `painel_sessao` assinado com HMAC-SHA256, válido por 12 h, `httpOnly`,
  `Secure` na Vercel e `SameSite=Lax`. Tirar um id de `PAINEL_USUARIOS` derruba
  a sessão dessa pessoa na próxima requisição. Trocar `SESSAO_SEGREDO` derruba
  a sessão de todo mundo.
- **Portões**: o [proxy.ts](../proxy.ts) manda qualquer rota sem sessão para
  `/login`, e **cada Server Action confere a sessão de novo**
  ([app/sessao.ts](../app/sessao.ts)). Uma Server Action é um POST que o proxy
  pode deixar de cobrir se o matcher ou a rota mudar.
- **Tentativas**: toda falha leva 1,5 s, então não dá para medir se o e-mail
  existe. O bcrypt de custo 10 é caro por natureza.
- **Cabeçalhos** ([next.config.ts](../next.config.ts)):
  - CSP, `frame-ancestors 'none'` e HSTS (só no build);
  - `nosniff`;
  - `noindex` (cabeçalho e `<meta>`).

  A CSP libera só os buckets do Supabase, o Drive e as fontes do Google.

Para incluir ou tirar alguém, edite `PAINEL_USUARIOS`. O id está em
`profiles.user_id`.

## Variáveis na Vercel (Settings → Environment Variables)

Use os nomes `DB_*`. Na Vercel, `USER` pode vir preenchido pelo sistema
operacional e ganharia do `.env.local`.

| Variável          | Valor                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`         | `aws-1-us-east-1.pooler.supabase.com`                                                                                     |
| `DB_PORT`         | `5432` (modo sessão; na 6543 a trava `default_transaction_read_only` não se sustenta)                                     |
| `DB_NAME`         | `postgres`                                                                                                                |
| `DB_USER`         | `postgres.yhauleemahxvbrdkdwju` (e `bi_readonly.yhauleemahxvbrdkdwju` quando existir)                                     |
| `DB_PASSWORD`     | a senha                                                                                                                   |
| `PAINEL_USUARIOS` | os 3 ids, separados por vírgula (os mesmos do `.env.local`)                                                               |
| `FIREBASE_SERVICE_ACCOUNT` | o JSON da conta de serviço do Firebase (cru ou em base64) — ver “Banco do painel” abaixo |
| `SESSAO_SEGREDO`  | **um segredo novo**, diferente do local: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

Na Vercel, faça também estes três ajustes:

- **Região da função**: `iad1` (Washington), a mesma do banco (us-east-1).
  É o padrão, mas confira em Settings → Functions.
- **Firewall → Rate Limiting**: crie uma regra para `POST /login`, por exemplo
  10 requisições por minuto por IP.
- **Deployment Protection**: deixe as prévias protegidas. É o padrão.

## O que continua em aberto

1. **A credencial é `postgres`, com escrita total.** Na Vercel ela fica num
   servidor na internet, e é o maior risco que resta. O
   [bi_readonly.sql](bi_readonly.sql) já traz o que o login precisa (item 2b).
   A equipe roda o script e troca `DB_USER`/`DB_PASSWORD`.
2. **Os anexos são públicos nos buckets**: quem tem a URL abre, com ou sem
   login. Fechar isso é mexer no outro sistema.
3. **Avaliações e votos ficam recolhidos** na pasta do projeto, mas quem
   abre o `<details>` vê. É proteção contra o relance na TV, não controle de
   acesso: os três usuários do painel enxergam tudo.

## Banco do painel (Firestore)

Tudo o que o painel **grava** fica no Firestore, nunca na origem:

| Coleção                  | Documento                       | Campos                                                                                  |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------- |
| `prestacao_links`        | automático                      | `projectId`, `ano`, `titulo`, `rotulo`, `link`, `adicionadoEm`, `adicionadoPor`       |
| `parcerias_candidatos`   | `encodeURIComponent(chave)`     | `chave`, `rotulo`, `nota`, `marcadoEm`, `marcadoPor`                                    |
| `decisoes`               | `projectId` (uuid da origem)    | `ano`, `titulo`, `situacao`, `valorAprovado`, `observacao`, `atualizadoEm`, `atualizadoPor` |
| `decisoes/{id}/historico` | automático                     | cópia de cada gravação (inclusive a que apaga a decisão)                                 |

A **decisão de contingência** (situação + valor aprovado, na pasta do projeto)
não volta para o sistema de submissão nem entra nos KPIs/Orçamento: é um
registro da mesa para quando o sistema não dá conta no dia.

Para criar:

1. Console do Firebase → criar projeto → **Firestore Database** → modo
   produção, região `nam5` (ou `us-east1`, perto da Vercel `iad1`).
2. `firebase deploy --only firestore:rules --project <id>` — publica
   [firestore.rules](../firestore.rules), que nega todo acesso de navegador
   (o painel só fala com o Firestore pelo servidor, com o Admin SDK).
3. Configurações do projeto → Contas de serviço → **Gerar nova chave
   privada**. Cole o JSON (ou ele em base64:
   `node -e "console.log(Buffer.from(require(fs).readFileSync(chave.json)).toString(base64))"`)
   em `FIREBASE_SERVICE_ACCOUNT`, na Vercel e no `.env.local`. Apague o
   arquivo `chave.json` depois.

Sem a variável, o painel abre normalmente: links, candidatos e decisões
aparecem vazios e o botão de salvar devolve erro.
