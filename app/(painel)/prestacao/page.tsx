import { dados } from "@/lib/cache";
import Prestacao from "./prestacao";

/** Página 06 — Prestação de contas (docs/plano-dashboard.md §4). */
export default async function Page() {
  return <Prestacao relatorios={await dados.prestacao()} />;
}
