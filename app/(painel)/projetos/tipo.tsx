import type { RevisaoProjeto, TipoRevisao } from "@/lib/types";

/** Vocabulário e pastilha da triagem novo × renovação (Fase 5). */

export const ROTULO_TIPO: Record<TipoRevisao, string> = {
  novo: "Novo",
  renovacao: "Renovação",
  revisar: "A revisar",
};

export const COR_TIPO: Record<TipoRevisao, string> = {
  novo: "var(--laranja)",
  renovacao: "var(--verde)",
  revisar: "var(--azul-claro)",
};

export function Tipo({ revisao }: { revisao: RevisaoProjeto }) {
  const { tipo, curado, similaridade } = revisao;
  return (
    <span
      className="pastilha-tipo"
      style={{ background: COR_TIPO[tipo] }}
      title={
        curado
          ? "Decidido pela equipe no CSV"
          : similaridade === null
            ? "Sem candidato na remessa anterior"
            : `Casamento automático de título: ${(similaridade * 100).toFixed(0)}%`
      }
    >
      {ROTULO_TIPO[tipo]}
      {!curado && tipo !== "novo" ? " ~" : ""}
    </span>
  );
}
