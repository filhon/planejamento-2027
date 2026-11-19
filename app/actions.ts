"use server";

import { revalidatePath } from "next/cache";
import { atualizar } from "@/lib/cache";
import { validarDecisao } from "@/lib/decisao";
import {
  ehChaveDeProjeto,
  mesesComVazio,
  mesesValidos,
  somaMeses,
  type ChaveEnvelope,
} from "@/lib/envelopes";
import {
  adicionarLinkPrestacao,
  alternarCandidato,
  lerMesesAjustados,
  gravarAdministrativo,
  gravarCaixa,
  gravarMesesEmLote,
  gravarDecisao,
  gravarEnvelope,
  gravarTriagemCurada,
} from "@/lib/painel-db";
import type { TipoRevisao } from "@/lib/types";
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

/** Falha de rede/credencial vira frase no formulário: a mesa precisa saber que NÃO gravou. */
function falhaGravacao(e: unknown): string {
  console.error("Firestore:", e);
  return "Não gravou no banco do painel. Tente de novo; se persistir, anote à mão.";
}

/**
 * Guarda o link do Drive com a prestação de contas de um projeto.
 *
 * Grava no banco do painel (Firestore, `prestacao_links`), FORA da origem: o
 * banco de submissões continua somente-leitura, e o que se anexa aqui
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
  const sessao = await exigirSessao();
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

  try {
    await adicionarLinkPrestacao({
      projectId: alvo.id,
      ano: alvo.ano,
      titulo: alvo.titulo,
      rotulo: String(form.get("rotulo") ?? "")
        .trim()
        .slice(0, 120),
      link: url.toString(),
      por: sessao.nome,
    });
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }

  // Os links são lidos sem cache na página; o revalidate só a refaz.
  revalidatePath("/projetos/[id]", "page");
  return {};
}

/**
 * Marca/desmarca um missionário como candidato a parceria proativa (Fase 11).
 * Grava no Firestore (`parcerias_candidatos`), fora da origem, como o link
 * do Drive. A chave vem do servidor (`Missionario.chave`), mas o formulário é
 * público na rede da reunião — o formato é conferido aqui.
 */
export async function marcarCandidato(
  alvo: { chave: string; rotulo: string },
  nota: string,
): Promise<{ marcado: boolean }> {
  const sessao = await exigirSessao();
  if (!/^(APMT|JMM|JMN-IPB|JMN-CBB|Pioneiros):.{1,200}$/.test(alvo.chave))
    throw new Error("Missionário inválido.");
  const marcado = await alternarCandidato({
    chave: alvo.chave,
    rotulo: alvo.rotulo.slice(0, 200),
    nota: nota.trim().slice(0, 300),
    por: sessao.nome,
  });
  atualizar();
  revalidatePath("/parcerias");
  return { marcado };
}

/**
 * Decisão de contingência (valor aprovado + situação) de um projeto. Fica SÓ
 * no Firestore (`decisoes`): o sistema de submissão não fica sabendo, e o
 * resto do painel (KPIs, orçamento) continua lendo a origem.
 */
export async function salvarDecisao(
  alvo: { id: string; ano: number; titulo: string },
  _estado: EstadoLink,
  form: FormData,
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  if (!UUID.test(alvo.id))
    return { erro: "Projeto não reconhecido. Recarregue a página." };

  const v = validarDecisao({
    situacao: String(form.get("situacao") ?? ""),
    valor: String(form.get("valor") ?? ""),
    observacao: String(form.get("observacao") ?? ""),
  });
  if ("erro" in v) return v;

  // Uma fonte só para o valor aprovado: havendo mês a mês na tela de Envelopes,
  // o valor da decisão é a soma dele, seja o que for que veio no formulário.
  if (!("apagar" in v) && v.valorAprovado !== null) {
    const meses = await lerMesesAjustados(alvo.id);
    if (meses) v.valorAprovado = somaMeses(meses);
  }

  try {
    await gravarDecisao(
      {
        projectId: alvo.id,
        ano: alvo.ano,
        titulo: alvo.titulo.slice(0, 300),
        por: sessao.nome,
      },
      "apagar" in v ? null : v,
    );
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  revalidatePath("/projetos/[id]", "page");
  return {};
}

/**
 * Tela de Envelopes (Fase 15): o envelope e/ou o mês a mês de um projeto.
 * `envelope: null` volta à sugestão; `meses: null` volta ao pedido. Grava no
 * Firestore (`envelopes`), nunca na origem. Sem revalidate: a tela mantém o
 * estado local, e as outras páginas releem o Firestore ao abrir.
 */
export async function salvarEnvelope(
  alvo: { id: string; ano: number; titulo: string },
  campos: { envelope?: string | null; meses?: unknown },
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  if (!UUID.test(alvo.id))
    return { erro: "Projeto não reconhecido. Recarregue a página." };

  const gravar: { envelope?: ChaveEnvelope | null; meses?: number[] | null } =
    {};
  if ("envelope" in campos) {
    if (campos.envelope !== null && !ehChaveDeProjeto(campos.envelope))
      return { erro: "Envelope desconhecido." };
    gravar.envelope = campos.envelope as ChaveEnvelope | null;
  }
  if ("meses" in campos) {
    const meses = campos.meses === null ? null : mesesValidos(campos.meses);
    if (campos.meses !== null && !meses)
      return { erro: "Valores do mês a mês inválidos." };
    gravar.meses = meses;
  }

  try {
    await gravarEnvelope(
      {
        projectId: alvo.id,
        ano: alvo.ano,
        titulo: alvo.titulo.slice(0, 300),
        por: sessao.nome,
      },
      gravar,
    );
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  return {};
}

/** Custos administrativos do ano, mês a mês (`envelopes_admin`). */
export async function salvarAdministrativo(
  ano: number,
  meses: unknown,
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  const validos = mesesComVazio(meses);
  if (!Number.isInteger(ano) || !validos)
    return { erro: "Valores do mês a mês inválidos." };
  try {
    await gravarAdministrativo(ano, validos, sessao.nome);
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  return {};
}

/** Receita mês a mês (null = valor do sistema) e saldo inicial do caixa. */
export async function salvarCaixa(
  ano: number,
  campos: { receita?: unknown; saldoInicial?: unknown },
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  if (!Number.isInteger(ano)) return { erro: "Ano inválido." };
  const gravar: { receita?: (number | null)[]; saldoInicial?: number | null } =
    {};
  if ("receita" in campos) {
    const receita = mesesComVazio(campos.receita);
    if (!receita) return { erro: "Valores da receita inválidos." };
    gravar.receita = receita;
  }
  if ("saldoInicial" in campos) {
    const v = campos.saldoInicial;
    // Saldo inicial pode ser negativo (o ano começa devendo).
    if (
      v !== null &&
      !(typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e9)
    )
      return { erro: "Saldo inicial inválido." };
    gravar.saldoInicial = v === null ? null : Math.round(v * 100) / 100;
  }
  try {
    await gravarCaixa(ano, gravar, sessao.nome);
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  return {};
}

/** Adiar em lote: o mês a mês novo de vários projetos, numa ida ao banco. */
export async function salvarMesesEmLote(
  itens: { id: string; ano: number; titulo: string; meses: unknown }[],
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > 600)
    return { erro: "Lote vazio ou grande demais." };
  const validos = [];
  for (const it of itens) {
    const meses = mesesValidos(it?.meses);
    if (!UUID.test(String(it?.id)) || !meses || !Number.isInteger(it.ano))
      return { erro: "Um dos projetos do lote é inválido. Nada foi gravado." };
    validos.push({
      projectId: it.id,
      ano: it.ano,
      titulo: String(it.titulo ?? "").slice(0, 300),
      meses,
    });
  }
  try {
    await gravarMesesEmLote(validos, sessao.nome);
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  return {};
}

/**
 * Triagem do projeto (novo × renovação, vínculo, dono da pasta, observações),
 * editada na pasta. Grava no Firestore (`triagem`); o `avaliacao:regen` nunca
 * sobrescreve tipo, vínculo nem observações. Campo vazio = seguir a sugestão
 * automática.
 */
export async function salvarTriagem(
  alvo: { id: string },
  _estado: EstadoLink,
  form: FormData,
): Promise<EstadoLink> {
  const sessao = await exigirSessao();
  if (!UUID.test(alvo.id))
    return { erro: "Projeto não reconhecido. Recarregue a página." };

  const campo = (k: string) => String(form.get(k) ?? "").trim();
  const tipo = campo("tipo");
  if (tipo && !["novo", "renovacao", "revisar"].includes(tipo))
    return { erro: "Tipo desconhecido." };
  const anterior = campo("anterior");
  if (anterior && !UUID.test(anterior))
    return { erro: "Projeto anterior não reconhecido." };

  try {
    await gravarTriagemCurada(
      { projectId: alvo.id, por: sessao.nome },
      {
        tipo: (tipo || null) as TipoRevisao | null,
        projetoAnteriorId: anterior || null,
        responsavel: campo("responsavel").slice(0, 120) || null,
        observacoes: campo("observacoes").slice(0, 500) || null,
      },
    );
  } catch (e) {
    return { erro: falhaGravacao(e) };
  }
  // A triagem entra em toda página (filtros, pastas, KPIs): derruba o cache da
  // origem nesta instância e refaz tudo.
  atualizar();
  revalidatePath("/", "layout");
  return {};
}
