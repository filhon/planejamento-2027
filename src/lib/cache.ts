import { fetchOrcamentos } from "./queries";
import {
  agregarPorPais,
  avaliacoesCiclo,
  ciclos,
  conformidade,
  montarOrcamento,
  montarResumo,
  prestacaoContas,
  projetoDetalhe,
  projetosCiclo,
} from "./datasets";
import { carregarAvaliadores, limparCacheEnriquecimento } from "./enrichment";
import { carregarParcerias, type DadosParcerias } from "./parcerias-dados";
import type {
  Ano,
  Avaliador,
  AvaliacoesCiclo,
  Ciclo,
  Conformidade,
  OrcamentoCiclo,
  ProjetoCiclo,
  ProjetoDetalhe,
  ProjetoLocal,
  RelatorioPrestacao,
  ResumoCiclo,
} from "./types";

/**
 * Cache curto para uso ao vivo na reunião: as consultas repetidas dentro de
 * uma navegação não vão ao banco de novo, e o botão "Atualizar" (→ `atualizar()`)
 * derruba tudo, inclusive os CSVs de enriquecimento.
 */

const TTL_PADRAO_MS = 15 * 60 * 1000;

interface Entrada<T> {
  valor: Promise<T>;
  expiraEm: number;
}

const entradas = new Map<string, Entrada<unknown>>();

export function ttlMs(): number {
  const bruto = Number(process.env["CACHE_TTL_MS"]);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : TTL_PADRAO_MS;
}

async function memo<T>(chave: string, produzir: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const atual = entradas.get(chave) as Entrada<T> | undefined;
  if (atual && atual.expiraEm > agora) return atual.valor;

  const valor = produzir().catch((erro) => {
    entradas.delete(chave); // erro não fica em cache
    throw erro;
  });
  entradas.set(chave, { valor, expiraEm: agora + ttlMs() });
  return valor;
}

/** Invalida tudo — é o que o botão "Atualizar" do painel deve chamar. */
export function atualizar(): void {
  entradas.clear();
  limparCacheEnriquecimento();
}

export interface InfoCache {
  chaves: string[];
  ttlMs: number;
}

export function infoCache(): InfoCache {
  return { chaves: [...entradas.keys()], ttlMs: ttlMs() };
}

/** Fachada dos datasets, com cache. É por aqui que a API/UI deve entrar. */
export const dados = {
  ciclos: (): Promise<Ciclo[]> => memo("ciclos", ciclos),

  projetos: (ano: Ano): Promise<ProjetoCiclo[]> =>
    memo(`projetos:${ano}`, () => projetosCiclo(ano)),

  locais: (ano: Ano): Promise<ProjetoLocal[]> =>
    memo(`locais:${ano}`, async () =>
      agregarPorPais(await dados.projetos(ano)),
    ),

  resumo: (ano: Ano): Promise<ResumoCiclo> =>
    memo(`resumo:${ano}`, async () =>
      montarResumo(await dados.projetos(ano), ano),
    ),

  orcamento: (ano: Ano): Promise<OrcamentoCiclo> =>
    memo(`orcamento:${ano}`, async () => {
      const [orcamentos, projetos] = await Promise.all([
        memo("orcamentos:brutos", fetchOrcamentos),
        dados.projetos(ano),
      ]);
      return montarOrcamento(orcamentos, projetos, ano);
    }),

  avaliacoes: (ano: Ano): Promise<AvaliacoesCiclo> =>
    memo(`avaliacoes:${ano}`, () => avaliacoesCiclo(ano)),

  // Sem dimensão de ano: os dois são pequenos e servem todos os ciclos.
  conformidade: (): Promise<Conformidade> => memo("conformidade", conformidade),

  prestacao: (): Promise<RelatorioPrestacao[]> =>
    memo("prestacao", prestacaoContas),

  /** A "pasta" de um projeto — a página de detalhe (Fase 5). */
  detalhe: (id: string): Promise<ProjetoDetalhe | null> =>
    memo(`detalhe:${id}`, () => projetoDetalhe(id)),

  /** Só o CSV; entra no cache junto para o "Atualizar" derrubar tudo de uma vez. */
  avaliadores: (): Promise<Avaliador[]> =>
    memo("avaliadores", async () => carregarAvaliadores()),

  /** Missionários das agências + municípios + candidatos marcados (Fase 11). */
  parcerias: (): Promise<DadosParcerias> =>
    memo("parcerias", async () => carregarParcerias()),
};
