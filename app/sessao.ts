import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, sessaoValida, type Sessao } from "@/lib/sessao";

/**
 * Guarda de toda Server Action. O `proxy.ts` barra as páginas, mas uma Server
 * Action é um POST que o Next atende na rota onde ela é usada — mudar o matcher
 * ou a rota tira a cobertura do proxy em silêncio. Por isso cada ação confere
 * a sessão de novo, aqui.
 */
export async function exigirSessao(): Promise<Sessao> {
  const s = sessaoValida((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!s) redirect("/login");
  return s;
}
