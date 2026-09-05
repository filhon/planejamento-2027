import { dados } from "@/lib/cache";
import type { OrcamentoCiclo } from "@/lib/types";
import Orcamento from "./orcamento";

/** Página 04 — Orçamento (docs/plano-dashboard.md §4). */
export default async function Page() {
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const orcamentos: Record<number, OrcamentoCiclo> = {};
  for (const o of await Promise.all(anos.map((a) => dados.orcamento(a)))) {
    orcamentos[o.ano] = o;
  }

  return <Orcamento orcamentos={orcamentos} />;
}
