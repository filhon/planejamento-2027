"use client";

import { useActionState, useEffect, useRef } from "react";
import { entrar } from "./actions";

export default function Formulario({ de }: { de: string }) {
  const [estado, acao, enviando] = useActionState(entrar, {});
  const senha = useRef<HTMLInputElement>(null);
  // Depois de um erro o e-mail volta (defaultValue) e a senha, a provável
  // culpada, fica vazia e com o foco.
  useEffect(() => {
    if (estado.erro) senha.current?.focus();
  }, [estado]);
  const invalido = estado.erro ? true : undefined;
  const descricao = estado.erro ? "login-erro" : undefined;
  return (
    <form action={acao} className="login-form">
      <input type="hidden" name="de" value={de} />
      <label>
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={estado.email}
          aria-invalid={invalido}
          aria-describedby={descricao}
          required
          autoFocus
        />
      </label>
      <label>
        Senha
        <input
          ref={senha}
          name="senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={invalido}
          aria-describedby={descricao}
          required
        />
      </label>
      {estado.erro && (
        <p id="login-erro" className="login-erro" role="alert">
          {estado.erro}
        </p>
      )}
      <button className="botao-atualizar" disabled={enviando}>
        {enviando ? "Conferindo…" : "Entrar"}
      </button>
    </form>
  );
}
