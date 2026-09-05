"use server";

import { revalidatePath } from "next/cache";
import { atualizar } from "@/lib/cache";

/**
 * Botão "Atualizar" da reunião: derruba o cache (inclusive os CSVs de
 * enriquecimento) e re-renderiza a página com uma consulta nova à origem.
 * Continua sendo só leitura — `atualizar()` apenas esvazia caches locais.
 */
export async function atualizarDados(): Promise<void> {
  atualizar();
  revalidatePath("/");
}
