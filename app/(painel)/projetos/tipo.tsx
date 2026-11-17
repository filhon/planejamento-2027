import type { CSSProperties } from "react";
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

/** De onde veio a triagem. `null` = a equipe decidiu no CSV, não há o que ressalvar. */
export function procedencia(revisao: RevisaoProjeto): string | null {
  const { tipo, curado, similaridade } = revisao;
  if (curado || tipo === "novo") return null;
  return similaridade === null
    ? "sem candidato na remessa anterior"
    : `casamento automático de título: ${(similaridade * 100).toFixed(0)}%, a revisar`;
}

/**
 * `detalhado` escreve a procedência por extenso ao lado da pastilha, em vez do
 * `~` com tooltip: ninguém passa o mouse na TV da reunião e tooltip não existe
 * no papel. São 54 projetos de 2026 num casamento só plausível, e é na pasta
 * que o conselho decide — lá a ressalva vai escrita. Na tabela de 266 linhas
 * ela não cabe, e o `~` continua sendo a marca curta.
 */
export function Tipo({
  revisao,
  detalhado,
}: {
  revisao: RevisaoProjeto;
  detalhado?: boolean;
}) {
  const ressalva = procedencia(revisao);
  return (
    <>
      <span
        className="pastilha-tipo"
        style={{ "--cor": COR_TIPO[revisao.tipo] } as CSSProperties}
        title={ressalva ?? "Decidido pela equipe no CSV"}
      >
        {ROTULO_TIPO[revisao.tipo]}
        {ressalva && !detalhado ? " ~" : ""}
      </span>
      {ressalva && detalhado && (
        <span className="ficha ficha-clara">{ressalva}</span>
      )}
    </>
  );
}
