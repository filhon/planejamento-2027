import { dados } from "@/lib/cache";
import Projetos from "./projetos";

/**
 * Página 07 — Projetos & Pastas (Fase 5, docs/fase5-projetos.md).
 *
 * Os projetos já vêm do layout (contexto do painel); daqui só sai a lista de
 * avaliadores, para uma pasta vazia continuar aparecendo na reunião.
 */
export default async function Page() {
  return <Projetos avaliadores={await dados.avaliadores()} />;
}
