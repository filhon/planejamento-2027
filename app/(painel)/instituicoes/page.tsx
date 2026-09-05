import { dados } from "@/lib/cache";
import Instituicoes from "./instituicoes";

/** Página 05 — Instituições (docs/plano-dashboard.md §4). */
export default async function Page() {
  return <Instituicoes conformidade={await dados.conformidade()} />;
}
