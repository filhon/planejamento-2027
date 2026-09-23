import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão do painel: um cookie assinado (HMAC-SHA256), sem tabela e sem nada
 * gravado na origem. Só `node:crypto` — roda igual no `proxy.ts` e nas Server
 * Actions, e não puxa o driver do banco (quem confere a senha é `auth.ts`).
 *
 * Quem entra é uma lista fechada de `user_id` (PAINEL_USUARIOS), relida a cada
 * requisição: tirar alguém da lista derruba a sessão dele na hora, sem esperar
 * o cookie vencer.
 */

export const COOKIE_SESSAO = "painel_sessao";
export const DURACAO_SESSAO_S = 12 * 60 * 60; // um dia de reunião

export interface Sessao {
  uid: string;
  nome: string;
  /** Vencimento, em segundos desde a época. */
  exp: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Falha fechado: sem segredo decente, ninguém entra. */
export function segredoSessao(): string {
  const s = process.env.SESSAO_SEGREDO ?? "";
  if (s.length < 32)
    throw new Error(
      "SESSAO_SEGREDO ausente ou curto (mínimo 32 caracteres) — ver docs/publicacao.md.",
    );
  return s;
}

export function usuariosPermitidos(): string[] {
  return (process.env.PAINEL_USUARIOS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID.test(s));
}

const hmac = (corpo: string, segredo: string) =>
  createHmac("sha256", segredo).update(corpo).digest("base64url");

export function assinarSessao(s: Sessao, segredo: string): string {
  const corpo = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${corpo}.${hmac(corpo, segredo)}`;
}

/** Devolve a sessão só se a assinatura confere e ela não venceu. */
export function lerSessao(
  token: string | undefined,
  segredo: string,
  agora = Date.now(),
): Sessao | null {
  const [corpo, assinatura, ...resto] = (token ?? "").split(".");
  if (!corpo || !assinatura || resto.length) return null;
  const esperada = Buffer.from(hmac(corpo, segredo));
  const recebida = Buffer.from(assinatura);
  if (
    esperada.length !== recebida.length ||
    !timingSafeEqual(esperada, recebida)
  )
    return null;
  try {
    const s = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    return typeof s?.uid === "string" &&
      typeof s.nome === "string" &&
      typeof s.exp === "number" &&
      s.exp * 1000 > agora
      ? s
      : null;
  } catch {
    return null;
  }
}

/** Assinatura válida, dentro do prazo E o usuário ainda está na lista. */
export function sessaoValida(token: string | undefined): Sessao | null {
  const s = lerSessao(token, segredoSessao());
  return s && usuariosPermitidos().includes(s.uid.toLowerCase()) ? s : null;
}

/**
 * Para onde voltar depois do login. Só caminho do próprio painel: `//site` e
 * `/\site` o navegador lê como outro domínio (open redirect) — e `/<TAB>/site`
 * também, porque o parser de URL apaga TAB e quebra de linha. Quem decide é o
 * próprio parser, e sai o caminho que ele montou, não a string recebida.
 */
export function destinoSeguro(de: string): string {
  const base = "http://painel.invalid";
  try {
    const u = new URL(de, base);
    return de.startsWith("/") && u.origin === base
      ? u.pathname + u.search + u.hash
      : "/";
  } catch {
    return "/";
  }
}
