import { geometriaMundo, VIEW_BOX } from "@/lib/mapa";
import Mapa from "./mapa";

/**
 * Página 02 — Mapa-múndi (docs/plano-dashboard.md §5, docs/fase2-mapa.md).
 * A projeção roda aqui, no servidor: o cliente recebe só os paths SVG.
 */
export default function Page() {
  return <Mapa geo={geometriaMundo()} viewBox={VIEW_BOX} />;
}
