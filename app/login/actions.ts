"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { conferirSenha } from "@/lib/auth";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  assinarSessao,
  destinoSeguro,
  segredoSessao,
} from "@/lib/sessao";

export interface EstadoLogin {
  erro?: string;
  /** Volta para o campo: o React 19 limpa o formulário ao fim da action. */
  email?: string;
}

/** O cookie dura mais que a sessão (o `exp` assinado continua mandando): é
 *  isso que deixa o proxy distinguir "venceu" de "nunca entrou". */
const VIDA_COOKIE_S = 7 * 24 * 60 * 60;

/** Toda falha leva o mesmo tempo: não dá para medir se o e-mail existe. */
const PISO_FALHA_MS = 1500;

export async function entrar(
  _estado: EstadoLogin,
  form: FormData,
): Promise<EstadoLogin> {
  const inicio = Date.now();
  const email = String(form.get("email") ?? "")
    .trim()
    .slice(0, 254);
  // bcrypt só lê 72 bytes; o teto é para não mandar megabytes ao banco.
  const senha = String(form.get("senha") ?? "").slice(0, 200);
  const destino = destinoSeguro(String(form.get("de") ?? "/"));

  let usuario: Awaited<ReturnType<typeof conferirSenha>> = null;
  let falhouBanco = false;
  if (email && senha) {
    try {
      usuario = await conferirSenha(email, senha);
    } catch (e) {
      falhouBanco = true;
      console.error("[login] conferência falhou:", (e as Error).message);
    }
  }

  if (!usuario) {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, inicio + PISO_FALHA_MS - Date.now())),
    );
    return {
      erro: falhouBanco
        ? "Não foi possível conferir agora. Tente de novo em instantes."
        : "E-mail ou senha não conferem.",
      email,
    };
  }

  (await cookies()).set(
    COOKIE_SESSAO,
    assinarSessao(
      {
        uid: usuario.uid,
        nome: usuario.nome,
        exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_S,
      },
      segredoSessao(),
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: VIDA_COOKIE_S,
    },
  );
  redirect(destino);
}

export async function sair(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
