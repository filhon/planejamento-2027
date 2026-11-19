import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

/**
 * Portão do painel: sem sessão válida, toda rota vai para /login. Só passam os
 * arquivos estáticos (o CSS/JS do Next e os dois símbolos da marca que a tela
 * de login mostra). As Server Actions conferem de novo por conta própria
 * (app/sessao.ts) — o proxy não é a única linha.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const logado = sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value);

  if (pathname === "/login")
    return logado
      ? NextResponse.redirect(new URL("/", req.url))
      : NextResponse.next();
  if (logado) return NextResponse.next();

  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("de", pathname + search);
  // Cookie presente mas recusado = a sessão venceu (o cookie vive mais que o
  // `exp` de propósito, ver actions.ts) ou a pessoa saiu da lista. A tela diz.
  const vencido = req.cookies.has(COOKIE_SESSAO);
  if (vencido) url.searchParams.set("expirou", "1");
  const res = NextResponse.redirect(url);
  if (vencido) res.cookies.delete(COOKIE_SESSAO);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|simbolo\\.png$|simbolo-branco\\.png$).*)",
  ],
};
