import { dados } from "@/lib/cache";
import type { OrcamentoCiclo } from "@/lib/types";
import Resumo from "./resumo";

/**
 * Página 00 — Resumo Executivo: a tela de entrada da reunião (Fase 12).
 *
 * A Visão Geral, que era esta rota, mudou para `/visao-geral` — ela continua
 * sendo o diagnóstico do ciclo, mas a abertura da reunião agora é a diretriz
 * orçamentária do presidente.
 */
export default async function Page() {
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const orcamentos: Record<number, OrcamentoCiclo> = {};
  for (const o of await Promise.all(anos.map((a) => dados.orcamento(a)))) {
    orcamentos[o.ano] = o;
  }

  return <Resumo orcamentos={orcamentos} />;
}
