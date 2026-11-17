"use client";

import { useActionState } from "react";
import type { RevisaoProjeto } from "@/lib/types";
import { salvarTriagem, type EstadoLink } from "../../../actions";
import { ROTULO_TIPO } from "../tipo";

/**
 * Edita a triagem do projeto (antes, a planilha data/projetos_avaliacao.csv).
 * Vazio = seguir a sugestão automática do `avaliacao:regen`. Recolhido: é
 * trabalho de preparação, não leitura da mesa.
 */
export default function EditarTriagem({
  id,
  revisao,
  avaliadores,
  anteriores,
}: {
  id: string;
  revisao: RevisaoProjeto;
  /** Nomes dos avaliadores ativos. */
  avaliadores: string[];
  /** Projetos da remessa anterior que podem ser o vínculo (mesma instituição). */
  anteriores: { id: string; titulo: string }[];
}) {
  const [estado, acao, enviando] = useActionState<EstadoLink, FormData>(
    salvarTriagem.bind(null, { id }),
    {},
  );

  // O dono atual entra na lista mesmo fora dos ativos: o select não pode
  // trocá-lo em silêncio só porque alguém salvou outro campo.
  const nomes =
    revisao.responsavel && !avaliadores.includes(revisao.responsavel)
      ? [revisao.responsavel, ...avaliadores]
      : avaliadores;

  return (
    <details className="form-decisao">
      <summary>Editar triagem</summary>
      <form className="form-link" action={acao}>
        <select
          name="tipo"
          defaultValue={revisao.tipoCurado ?? ""}
          aria-label="Tipo"
        >
          <option value="">
            Sugestão automática ({ROTULO_TIPO[revisao.sugestao]})
          </option>
          <option value="novo">Novo</option>
          <option value="renovacao">Renovação</option>
          <option value="revisar">A revisar</option>
        </select>
        <select
          name="anterior"
          defaultValue={revisao.projetoAnteriorIdCurado ?? ""}
          aria-label="Projeto da remessa anterior"
        >
          <option value="">
            {revisao.projetoAnteriorIdCurado === null &&
            revisao.projetoAnteriorTitulo
              ? `Vínculo sugerido: ${revisao.projetoAnteriorTitulo}`
              : "Vínculo: seguir a sugestão automática"}
          </option>
          {anteriores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo}
            </option>
          ))}
        </select>
        <select
          name="responsavel"
          defaultValue={revisao.responsavel ?? ""}
          aria-label="Responsável pela pasta"
        >
          <option value="">Sem responsável</option>
          {nomes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          name="observacoes"
          maxLength={500}
          placeholder="Observações (opcional)"
          aria-label="Observações da triagem"
          defaultValue={revisao.observacoes ?? ""}
        />
        <button type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </button>
        <span className="sub" aria-live="polite">
          {estado.erro ??
            "Grava no banco do painel. Reflete em todas as páginas (filtros, pastas, KPIs)."}
        </span>
      </form>
    </details>
  );
}
