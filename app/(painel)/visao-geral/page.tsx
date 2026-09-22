import { dados } from "@/lib/cache";
import type { OrcamentoCiclo } from "@/lib/types";
import VisaoGeral from "./visao-geral";

/**
 * Página 01 — Visão Geral (docs/plano-dashboard.md §4).
 *
 * Era a rota `/` até a Fase 12, quando o Resumo Executivo assumiu a abertura da
 * reunião; o componente veio junto para a pasta, como nas outras páginas.
 */
export default async function Page() {
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const orcamentos: Record<number, OrcamentoCiclo> = {};
  for (const o of await Promise.all(anos.map((a) => dados.orcamento(a)))) {
    orcamentos[o.ano] = o;
  }

  return <VisaoGeral orcamentos={orcamentos} />;
}
