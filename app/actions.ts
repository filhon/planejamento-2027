"use server";

import { revalidatePath } from "next/cache";
import { atualizar } from "@/lib/cache";
import { adicionarLinkPrestacao } from "@/lib/enrichment";

/**
 * Botão "Atualizar" da reunião: derruba o cache (inclusive os CSVs de
 * enriquecimento) e re-renderiza a página com uma consulta nova à origem.
 * Continua sendo só leitura — `atualizar()` apenas esvazia caches locais.
 */
export async function atualizarDados(): Promise<void> {
  atualizar();
  revalidatePath("/");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EstadoLink {
  erro?: string;
}

/**
 * Guarda o link do Drive com a prestação de contas de um projeto.
 *
 * A única escrita do painel — e é em `data/prestacao_links.csv`, FORA da
 * origem: o banco de submissões continua somente-leitura, e o que se anexa aqui
 * é evidência para a reunião, não o relatório oficial do sistema.
 *
 * O formulário é público na rede da reunião, então a validação é aqui e não no
 * `<input type="url">`: só `https` (um `javascript:` colado viraria href) e só
 * um projeto de verdade.
 */
export async function salvarLinkPrestacao(
  alvo: { id: string; ano: number; titulo: string },
  _estado: EstadoLink,
  form: FormData,
): Promise<EstadoLink> {
  if (!UUID.test(alvo.id)) return { erro: "Projeto inválido." };

  const bruto = String(form.get("link") ?? "").trim();
  if (!bruto) return { erro: "Cole o link do arquivo ou da pasta no Drive." };
  if (bruto.length > 2000) return { erro: "Link longo demais." };

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return { erro: "Isso não é um endereço válido." };
  }
  if (url.protocol !== "https:") return { erro: "Só link https." };

  adicionarLinkPrestacao({
    projectId: alvo.id,
    ano: alvo.ano,
    titulo: alvo.titulo,
    rotulo: String(form.get("rotulo") ?? "")
      .trim()
      .slice(0, 120),
    link: url.toString(),
  });

  // O detalhe é memoizado com os links já dentro; `atualizar()` derruba a
  // entrada, e o revalidate refaz a página da pasta (a do projeto anterior
  // também, que é onde o mesmo link aparece).
  atualizar();
  revalidatePath("/projetos/[id]", "page");
  return {};
}
