"use client";

import { useActionState } from "react";
import { entrar } from "./actions";

export default function Formulario({ de }: { de: string }) {
  const [estado, acao, enviando] = useActionState(entrar, {});
  return (
    <form action={acao} className="login-form">
      <input type="hidden" name="de" value={de} />
      <label>
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </label>
      <label>
        Senha
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {estado.erro && (
        <p className="login-erro" role="alert">
          {estado.erro}
        </p>
      )}
      <button className="botao-atualizar" disabled={enviando}>
        {enviando ? "Conferindo…" : "Entrar"}
      </button>
    </form>
  );
}
