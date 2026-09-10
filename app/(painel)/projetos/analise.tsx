import type { CSSProperties } from "react";
import type { AnalisePrevia } from "@/lib/types";

/**
 * Pastilha da **análise prévia** (Fase 10) — o trabalho da equipe ASEEC antes
 * da reunião, que quase nunca aparece no `status` do projeto.
 *
 * Diz **o que já foi registrado**, não "quem" nem "quando analisou": a origem
 * não tem coluna de autor, e `updated_at` também se mexe quando o proponente
 * edita o projeto. Por isso a data sai como "alterado em", em cinza.
 */

export function rotuloAnalise(a: AnalisePrevia): string {
  if (a.temParecer && a.tags.length > 0) return "Parecer + tags";
  if (a.temParecer) return "Parecer";
  if (a.tags.length > 0) return `${a.tags.length} tags`;
  return a.temDevolutiva ? "Devolutiva" : "Não analisado";
}

const dia = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

export function Analise({ a, data }: { a: AnalisePrevia; data?: boolean }) {
  const cor = a.analisado
    ? "var(--verde)"
    : a.temDevolutiva
      ? "var(--azul-claro)"
      : "var(--neutro-forte)";
  return (
    <>
      <span
        className="pastilha-tipo"
        style={{ "--cor": cor } as CSSProperties}
        title={
          a.tags.length > 0
            ? a.tags.join(" · ")
            : a.temDevolutiva
              ? "A equipe pediu ajuste ao proponente (notas do revisor)"
              : "Nenhum parecer ou tag registrado pela equipe"
        }
      >
        {rotuloAnalise(a)}
      </span>
      {data && a.atualizadoEm && (
        /* `new Date` porque a data chega serializada do servidor. */
        <span className="sub">
          {" "}
          alterado {dia.format(new Date(a.atualizadoEm))}
        </span>
      )}
    </>
  );
}
