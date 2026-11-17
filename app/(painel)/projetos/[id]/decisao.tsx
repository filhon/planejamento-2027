"use client";

import { useActionState } from "react";
import { SITUACOES, type Decisao } from "@/lib/decisao";
import { salvarDecisao, type EstadoLink } from "../../../actions";
import { fmtMoeda } from "../../formato";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Decisão de contingência: valor aprovado e situação, gravados SÓ no banco do
 * painel (Firestore). O sistema de submissão não fica sabendo — e a linha diz
 * isso, para ninguém tomar o número por oficial. O formulário vem recolhido:
 * é contingência, não o caminho normal.
 */
export default function DecisaoPainel({
  alvo,
  decisao,
}: {
  alvo: { id: string; ano: number; titulo: string };
  decisao: Decisao | null;
}) {
  const [estado, acao, enviando] = useActionState<EstadoLink, FormData>(
    salvarDecisao.bind(null, alvo),
    {},
  );

  return (
    <div>
      <dt>Decisão registrada no painel</dt>
      <dd className={decisao ? undefined : "ausente"}>
        {decisao ? (
          <>
            <b>{SITUACOES[decisao.situacao] ?? decisao.situacao}</b>
            {decisao.valorAprovado !== null &&
              ` · ${fmtMoeda.format(decisao.valorAprovado)}`}
            {decisao.observacao && ` · ${decisao.observacao}`}
            <span className="sub">
              {" "}
              (contingência, fora do sistema de submissão ·{" "}
              {decisao.atualizadoPor},{" "}
              {fmtData.format(new Date(decisao.atualizadoEm))})
            </span>
          </>
        ) : (
          "Nenhuma: vale o que está no sistema de submissão"
        )}
        <details className="form-decisao">
          <summary>{decisao ? "Alterar decisão" : "Registrar decisão"}</summary>
          <form className="form-link" action={acao}>
            <select
              name="situacao"
              defaultValue={decisao?.situacao ?? ""}
              aria-label="Situação"
            >
              <option value="">Sem decisão (apagar)</option>
              {Object.entries(SITUACOES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <input
              name="valor"
              inputMode="decimal"
              placeholder="Valor aprovado (R$)"
              aria-label="Valor aprovado em reais"
              defaultValue={
                decisao?.valorAprovado != null
                  ? decisao.valorAprovado.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })
                  : ""
              }
            />
            <input
              name="observacao"
              maxLength={500}
              placeholder="Observação (opcional)"
              aria-label="Observação"
              defaultValue={decisao?.observacao ?? ""}
            />
            <button type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar"}
            </button>
            <span className="sub" aria-live="polite">
              {estado.erro ??
                "Grava só no banco do painel. O valor só vale para Aprovado / Aprovado com ressalvas."}
            </span>
          </form>
        </details>
      </dd>
    </div>
  );
}
