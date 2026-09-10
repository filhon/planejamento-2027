"use client";

import { useActionState } from "react";
import { salvarLinkPrestacao, type EstadoLink } from "../../../actions";

/**
 * Colar o link do Drive com a prestação de contas do ciclo anterior.
 *
 * Quem usa isto é a secretaria/o diretor, não o parceiro: o painel é a tela da
 * reunião. O caso real é o relatório que chegou por e-mail ou WhatsApp e nunca
 * entrou no sistema de submissão — em 2025, 198 dos 223 projetos aprovados
 * ficaram assim. O link vai para `data/prestacao_links.csv` (FORA da origem) e
 * o arquivo passa a abrir no mesmo visor dos anexos do projeto.
 */
export default function LinkPrestacao({
  alvo,
}: {
  alvo: { id: string; ano: number; titulo: string };
}) {
  const [estado, acao, enviando] = useActionState<EstadoLink, FormData>(
    salvarLinkPrestacao.bind(null, alvo),
    {},
  );

  return (
    <form className="form-link" action={acao}>
      <input
        type="url"
        name="link"
        required
        placeholder={`Link do Drive com a prestação de ${alvo.ano}`}
        aria-label={`Link do Drive com a prestação de contas de ${alvo.ano}`}
      />
      <input
        type="text"
        name="rotulo"
        placeholder="Nome (opcional)"
        aria-label="Nome do documento"
      />
      <button type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : "Anexar link"}
      </button>
      <span className="sub" aria-live="polite">
        {estado.erro ??
          "O arquivo precisa estar compartilhado como “qualquer pessoa com o link”."}
      </span>
    </form>
  );
}
