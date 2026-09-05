import { dados } from "@/lib/cache";
import { geometriaMundo, VIEW_BOX } from "@/lib/mapa";
import Painel from "./painel";

/**
 * Página do Mapa-múndi (Fase 2).
 *
 * Este Server Component É a camada de leitura: chama a fachada `dados.*`
 * (só SELECT na origem + junção com data/*.csv) e entrega tudo pronto ao
 * cliente. Os filtros da reunião reagregam no navegador — sem ida ao banco a
 * cada clique — e o botão "Atualizar" força uma consulta nova.
 */

// Dados vivos: nada de pré-render estático. O cache de 15 min é o de src/lib.
export const dynamic = "force-dynamic";

export default async function Page() {
  const ciclos = await dados.ciclos();
  // Foco no ciclo mais recente (2026), comparativo no anterior (2025).
  const anos = [...new Set(ciclos.map((c) => c.ano))].sort((a, b) => b - a);

  const carregados = await Promise.all(
    anos.map(async (ano) => ({ ano, projetos: await dados.projetos(ano) })),
  );

  return (
    <Painel ciclos={carregados} geo={geometriaMundo()} viewBox={VIEW_BOX} />
  );
}
