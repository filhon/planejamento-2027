"use server";

import { revalidatePath } from "next/cache";
import { atualizar } from "@/lib/cache";
import { adicionarLinkPrestacao } from "@/lib/enrichment";
import { alternarCandidato } from "@/lib/parcerias-dados";
import { exigirSessao } from "./sessao";

/**
 * Botão "Atualizar" da reunião: derruba o cache (inclusive os CSVs de
 * enriquecimento) e re-renderiza a página com uma consulta nova à origem.
 * Continua sendo só leitura — `atualizar()` apenas esvazia caches locais.
 */
export async function atualizarDados(): Promise<void> {
  await exigirSessao();
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
 * A validação é aqui e não no `<input type="url">`: só `https` (um
 * `javascript:` colado viraria href) e só um projeto de verdade.
 */
export async function salvarLinkPrestacao(
  alvo: { id: string; ano: number; titulo: string },
  _estado: EstadoLink,
  form: FormData,
): Promise<EstadoLink> {
  await exigirSessao();
  if (!UUID.test(alvo.id))
    return { erro: "Projeto não reconhecido. Recarregue a página." };

  const bruto = String(form.get("link") ?? "").trim();
  if (!bruto) return { erro: "Cole o link do arquivo ou da pasta no Drive." };
  if (bruto.length > 2000)
    return {
      erro: "Link comprido demais — copie o endereço da barra do navegador, sem o texto em volta.",
    };

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return {
      erro: "Não reconheci esse endereço. Cole o link inteiro, começando com https://",
    };
  }
  if (url.protocol !== "https:")
    return {
      erro: "O link precisa começar com https:// — use o botão Compartilhar do Drive.",
    };

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

/**
 * Marca/desmarca um missionário como candidato a parceria proativa (Fase 11).
 * Escrita em `data/parcerias_candidatos.csv`, fora da origem, como o link do
 * Drive. A chave vem do servidor (`Missionario.chave`), mas o formulário é
 * público na rede da reunião — o formato é conferido aqui.
 */
export async function marcarCandidato(
  alvo: { chave: string; rotulo: string },
  nota: string,
): Promise<{ marcado: boolean }> {
  await exigirSessao();
  if (!/^(APMT|JMM|JMN-IPB|JMN-CBB|Pioneiros):.{1,200}$/.test(alvo.chave))
    throw new Error("Missionário inválido.");
  const marcado = alternarCandidato({
    chave: alvo.chave,
    rotulo: alvo.rotulo.slice(0, 200),
    nota: nota.trim().slice(0, 300),
  });
  atualizar();
  revalidatePath("/parcerias");
  return { marcado };
}
