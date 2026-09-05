import { dados } from "@/lib/cache";
import type { AvaliacoesCiclo } from "@/lib/types";
import Pipeline from "./pipeline";

/** Página 03 — Pipeline & Avaliação (docs/plano-dashboard.md §4). */
export default async function Page() {
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const avaliacoes: Record<number, AvaliacoesCiclo> = {};
  for (const a of await Promise.all(anos.map((ano) => dados.avaliacoes(ano)))) {
    avaliacoes[a.ano] = a;
  }

  return <Pipeline avaliacoes={avaliacoes} />;
}
