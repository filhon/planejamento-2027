"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePainel } from "../contexto";

/** Endereço do projeto no sistema de votação (o id é o mesmo `cycle_projects.id`). */
export const urlVotacao = (id: string) =>
  `https://sistema.hebronaseec.com.br/avaliacao-projeto/${encodeURIComponent(id)}`;

/**
 * "Projeto 42" dito na mesa → a pasta dele. Procura na remessa INTEIRA, não no
 * recorte: o número é do projeto, e um filtro ligado não pode fazê-lo sumir.
 */
export default function IrPara() {
  const { todos } = usePainel();
  const router = useRouter();
  const [n, setN] = useState("");
  const alvo = todos.find((p) => p.numero === Number(n));

  return (
    <form
      className="ir-para"
      onSubmit={(e) => {
        e.preventDefault();
        if (alvo) {
          setN("");
          router.push(`/projetos/${alvo.id}`);
        }
      }}
    >
      <label>
        Ir para nº
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          size={4}
          value={n}
          onChange={(e) => setN(e.target.value.replace(/\D/g, ""))}
          aria-invalid={n !== "" && !alvo}
          title={
            n && !alvo
              ? "Nenhum projeto com esse número nesta remessa"
              : undefined
          }
        />
      </label>
    </form>
  );
}
