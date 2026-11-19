import { dados } from "@/lib/cache";
import {
  carregarEnvelopes,
  lerAdministrativo,
  lerCaixa,
} from "@/lib/painel-db";
import type { OrcamentoCiclo } from "@/lib/types";
import Resumo from "./resumo";

/**
 * Página 00 — Resumo Executivo: a tela de entrada da reunião (Fase 12).
 *
 * A Visão Geral, que era esta rota, mudou para `/visao-geral` — ela continua
 * sendo o diagnóstico do ciclo, mas a abertura da reunião agora é a diretriz
 * orçamentária. Desde a Fase 15 a divisão é a dos envelopes, com o envelope de
 * cada projeto e os custos administrativos lidos do Firestore (tela Envelopes).
 */
export default async function Page() {
  const ciclos = await dados.ciclos();
  const anos = [...new Set(ciclos.map((c) => c.ano))];

  const [lista, ajustes, caixas] = await Promise.all([
    Promise.all(anos.map((a) => dados.orcamento(a))),
    carregarEnvelopes(),
    Promise.all(
      anos.map(async (a) => {
        const [caixa, admin] = await Promise.all([
          lerCaixa(a),
          lerAdministrativo(a),
        ]);
        return [a, { ...caixa, admin }] as const;
      }),
    ),
  ]);
  const orcamentos: Record<number, OrcamentoCiclo> = {};
  for (const o of lista) orcamentos[o.ano] = o;

  return (
    <Resumo
      orcamentos={orcamentos}
      envelopes={Object.fromEntries(
        [...ajustes].map(([id, a]) => [id, a.envelope]),
      )}
      caixas={Object.fromEntries(caixas)}
    />
  );
}
