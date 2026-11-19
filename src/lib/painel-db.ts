import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Decisao, Situacao } from "./decisao";
import { embedDrive, rotuloDrive } from "./drive";
import {
  alvosValidos,
  ehChaveDeProjeto,
  mesesComVazio,
  mesesValidos,
  type Alvos,
  type ChaveEnvelope,
} from "./envelopes";
import { firestore, firestoreObrigatorio } from "./firestore";
import type { Candidato } from "./parcerias";
import type { Anexo, RevisaoProjeto, TipoRevisao } from "./types";

/**
 * Leitura e escrita do banco do painel (Firestore). Coleções descritas em
 * `firestore.ts`. Nada aqui toca a origem.
 */

// ---------- leitura tolerante ----------

let falhaLeitura: string | null = null;

/**
 * A última falha de leitura do banco do painel nesta instância (null = lendo
 * normalmente). Com a cota diária do Firestore estourada, toda leitura falha
 * com RESOURCE_EXHAUSTED; antes isso derrubava o painel inteiro, porque o
 * layout lê a triagem. Agora a leitura devolve vazio, registra a falha, e as
 * telas avisam (a de Envelopes vira só leitura).
 */
export const falhaDoBanco = (): string | null => falhaLeitura;

function tolerante<A extends unknown[], R>(
  nome: string,
  ler: (...a: A) => Promise<R>,
  vazio: () => R,
): (...a: A) => Promise<R> {
  return async (...a: A) => {
    try {
      const r = await ler(...a);
      falhaLeitura = null;
      return r;
    } catch (e) {
      console.error(`Firestore, leitura (${nome}):`, e);
      const msg = e instanceof Error ? e.message : String(e);
      falhaLeitura = /RESOURCE_EXHAUSTED|quota/i.test(msg)
        ? "a cota diária de leituras do banco do painel (Firestore) acabou"
        : "o banco do painel (Firestore) não respondeu";
      return vazio();
    }
  };
}

const data = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : null;

// ---------- prestacao_links ----------

/**
 * Links do Drive com a prestação de contas que nunca entrou no sistema de
 * submissão, por projeto. Saem com a forma de `Anexo` para cair no mesmo
 * visor dos anexos da origem. Só `https` passa (um `javascript:` viraria href).
 */
async function linksPrestacaoBruto(
  ids: string[],
): Promise<Map<string, Anexo[]>> {
  const mapa = new Map<string, Anexo[]>();
  const db = firestore();
  if (!db || ids.length === 0) return mapa;

  const snap = await db
    .collection("prestacao_links")
    .where("projectId", "in", ids)
    .get();
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
    .sort(
      (a, b) =>
        (data(a.adicionadoEm)?.getTime() ?? 0) -
        (data(b.adicionadoEm)?.getTime() ?? 0),
    );

  for (const r of docs) {
    const id = String(r.projectId);
    const link = String(r.link ?? "");
    if (!/^https:\/\//i.test(link)) continue;
    const lista = mapa.get(id) ?? [];
    lista.push({
      id: `link:${r.id}`,
      nome: String(r.rotulo || "") || rotuloDrive(link),
      // O rótulo diz de onde veio: isto NÃO é a prestação registrada no sistema.
      tipo: embedDrive(link) ? "Drive · fora do sistema" : "link externo",
      url: link,
      bytes: null,
      enviadoEm: data(r.adicionadoEm),
      enviadoPor: r.adicionadoPor ? String(r.adicionadoPor) : null,
      ehVideo: false,
    });
    mapa.set(id, lista);
  }
  return mapa;
}

export async function adicionarLinkPrestacao(linha: {
  projectId: string;
  ano: number;
  titulo: string;
  rotulo: string;
  link: string;
  por: string;
}): Promise<void> {
  await firestoreObrigatorio().collection("prestacao_links").add({
    projectId: linha.projectId,
    ano: linha.ano,
    titulo: linha.titulo,
    rotulo: linha.rotulo,
    link: linha.link,
    adicionadoEm: FieldValue.serverTimestamp(),
    adicionadoPor: linha.por,
  });
}

// ---------- parcerias_candidatos ----------

async function carregarCandidatosBruto(): Promise<Candidato[]> {
  const db = firestore();
  if (!db) return [];
  const snap = await db.collection("parcerias_candidatos").get();
  return snap.docs.map((d) => {
    const r = d.data();
    return {
      chave: String(r.chave),
      rotulo: String(r.rotulo ?? ""),
      nota: String(r.nota ?? ""),
      marcadoEm: data(r.marcadoEm)?.toISOString().slice(0, 10) ?? "",
    };
  });
}

/** Marca (ou desmarca, se já estava). Devolve se ficou marcado. */
export async function alternarCandidato(alvo: {
  chave: string;
  rotulo: string;
  nota: string;
  por: string;
}): Promise<boolean> {
  const db = firestoreObrigatorio();
  const ref = db
    .collection("parcerias_candidatos")
    .doc(encodeURIComponent(alvo.chave));
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) {
      tx.delete(ref);
      return false;
    }
    tx.set(ref, {
      chave: alvo.chave,
      rotulo: alvo.rotulo,
      nota: alvo.nota,
      marcadoEm: FieldValue.serverTimestamp(),
      marcadoPor: alvo.por,
    });
    return true;
  });
}

// ---------- decisoes ----------

async function lerDecisaoBruto(projectId: string): Promise<Decisao | null> {
  const db = firestore();
  if (!db) return null;
  const doc = await db.collection("decisoes").doc(projectId).get();
  const r = doc.data();
  if (!r) return null;
  return {
    situacao: r.situacao as Situacao,
    valorAprovado: typeof r.valorAprovado === "number" ? r.valorAprovado : null,
    observacao: String(r.observacao ?? ""),
    atualizadoEm: data(r.atualizadoEm) ?? new Date(0),
    atualizadoPor: String(r.atualizadoPor ?? ""),
  };
}

/**
 * Grava (ou apaga, com `decisao = null`) a decisão de contingência. Toda
 * gravação também vai para `historico`, então sobrescrever não perde o que
 * estava lá.
 */
export async function gravarDecisao(
  alvo: { projectId: string; ano: number; titulo: string; por: string },
  decisao: Pick<Decisao, "situacao" | "valorAprovado" | "observacao"> | null,
): Promise<void> {
  const db = firestoreObrigatorio();
  const ref = db.collection("decisoes").doc(alvo.projectId);
  const registro = {
    ano: alvo.ano,
    titulo: alvo.titulo,
    situacao: decisao?.situacao ?? null,
    valorAprovado: decisao?.valorAprovado ?? null,
    observacao: decisao?.observacao ?? "",
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: alvo.por,
  };
  const lote = db.batch();
  if (decisao) lote.set(ref, registro);
  else lote.delete(ref);
  lote.create(ref.collection("historico").doc(), registro);
  await lote.commit();
}

/** Situação e valor de toda decisão registrada: a tela de Envelopes soma por elas. */
async function carregarDecisoesBruto(): Promise<
  Map<string, { situacao: string | null; valorAprovado: number | null }>
> {
  const mapa = new Map<
    string,
    { situacao: string | null; valorAprovado: number | null }
  >();
  const db = firestore();
  if (!db) return mapa;
  for (const doc of (await db.collection("decisoes").get()).docs) {
    const r = doc.data();
    mapa.set(doc.id, {
      situacao: typeof r.situacao === "string" ? r.situacao : null,
      valorAprovado:
        typeof r.valorAprovado === "number" ? r.valorAprovado : null,
    });
  }
  return mapa;
}

// ---------- envelopes (Fase 15) ----------

/**
 * O que a mesa decidiu na tela de Envelopes, por projeto (doc = uuid do projeto
 * na origem): o envelope escolhido (null = seguir a sugestão) e o mês a mês
 * ajustado (null = seguir pedido/decisão). É o que, consolidado, vai para o
 * banco de projetos — a origem não recebe nada daqui.
 */
export interface AjusteEnvelope {
  envelope: ChaveEnvelope | null;
  meses: number[] | null;
  atualizadoPor: string | null;
}

async function carregarEnvelopesBruto(): Promise<Map<string, AjusteEnvelope>> {
  const mapa = new Map<string, AjusteEnvelope>();
  const db = firestore();
  if (!db) return mapa;
  for (const doc of (await db.collection("envelopes").get()).docs) {
    const r = doc.data();
    mapa.set(doc.id, {
      envelope: ehChaveDeProjeto(r.envelope) ? r.envelope : null,
      meses: mesesValidos(r.meses),
      atualizadoPor: textoOuNulo(r.atualizadoPor),
    });
  }
  return mapa;
}

/** O mês a mês ajustado de um projeto (null = sem ajuste). */
async function lerMesesAjustadosBruto(
  projectId: string,
): Promise<number[] | null> {
  const db = firestore();
  if (!db) return null;
  const r = (await db.collection("envelopes").doc(projectId).get()).data();
  return mesesValidos(r?.meses);
}

/** Grava só os campos passados (merge); cada gravação vai para `historico`. */
export async function gravarEnvelope(
  alvo: { projectId: string; ano: number; titulo: string; por: string },
  campos: { envelope?: ChaveEnvelope | null; meses?: number[] | null },
): Promise<void> {
  const db = firestoreObrigatorio();
  const ref = db.collection("envelopes").doc(alvo.projectId);
  const registro = {
    ano: alvo.ano,
    titulo: alvo.titulo,
    ...campos,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: alvo.por,
  };
  const lote = db.batch();
  lote.set(ref, registro, { merge: true });
  lote.create(ref.collection("historico").doc(), registro);
  await lote.commit();
}

/**
 * Custos administrativos do ano, mês a mês (`envelopes_admin/{ano}`), com
 * `null` = não digitado (vale a reserva da diretriz). Docs da primeira versão
 * (sem `versao`) guardavam zero nos meses não digitados: lá zero vira null.
 */
async function lerAdministrativoBruto(
  ano: number,
): Promise<(number | null)[] | null> {
  const db = firestore();
  if (!db) return null;
  const r = (
    await db.collection("envelopes_admin").doc(String(ano)).get()
  ).data();
  const meses = mesesComVazio(r?.meses);
  if (!meses || r?.versao === 2) return meses;
  return meses.map((v) => (v === 0 ? null : v));
}

export async function gravarAdministrativo(
  ano: number,
  meses: (number | null)[],
  por: string,
): Promise<void> {
  const db = firestoreObrigatorio();
  const ref = db.collection("envelopes_admin").doc(String(ano));
  const registro = {
    ano,
    meses,
    versao: 2,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: por,
  };
  const lote = db.batch();
  lote.set(ref, registro);
  lote.create(ref.collection("historico").doc(), registro);
  await lote.commit();
}

/**
 * Receita mês a mês, saldo inicial e percentuais dos envelopes do ano
 * (`envelopes_caixa/{ano}`), com `null` = não digitado (vale a receita do
 * sistema ÷ 12, e a diretriz da reunião).
 */
async function lerCaixaBruto(ano: number): Promise<{
  receita: (number | null)[] | null;
  saldoInicial: number | null;
  alvos: Alvos | null;
}> {
  const db = firestore();
  if (!db) return { receita: null, saldoInicial: null, alvos: null };
  const r = (
    await db.collection("envelopes_caixa").doc(String(ano)).get()
  ).data();
  return {
    receita: mesesComVazio(r?.receita),
    saldoInicial: numeroOuNulo(r?.saldoInicial),
    alvos: alvosValidos(r?.alvos),
  };
}

export async function gravarCaixa(
  ano: number,
  campos: {
    receita?: (number | null)[];
    saldoInicial?: number | null;
    alvos?: Alvos | null;
  },
  por: string,
): Promise<void> {
  const db = firestoreObrigatorio();
  const ref = db.collection("envelopes_caixa").doc(String(ano));
  const registro = {
    ano,
    ...campos,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: por,
  };
  const lote = db.batch();
  lote.set(ref, registro, { merge: true });
  lote.create(ref.collection("historico").doc(), registro);
  await lote.commit();
}

/** Vários projetos de uma vez (adiar em lote), cada um com o seu histórico. */
export async function gravarMesesEmLote(
  itens: { projectId: string; ano: number; titulo: string; meses: number[] }[],
  por: string,
): Promise<void> {
  const db = firestoreObrigatorio();
  // 2 operações por projeto; o lote do Firestore aceita 500.
  for (let i = 0; i < itens.length; i += 200) {
    const lote = db.batch();
    for (const it of itens.slice(i, i + 200)) {
      const ref = db.collection("envelopes").doc(it.projectId);
      const registro = {
        ano: it.ano,
        titulo: it.titulo,
        meses: it.meses,
        atualizadoEm: FieldValue.serverTimestamp(),
        atualizadoPor: por,
      };
      lote.set(ref, registro, { merge: true });
      lote.create(ref.collection("historico").doc(), registro);
    }
    await lote.commit();
  }
}

// ---------- triagem ----------

const TIPOS: TipoRevisao[] = ["novo", "renovacao", "revisar"];
const tipoOuNulo = (v: unknown): TipoRevisao | null =>
  TIPOS.includes(v as TipoRevisao) ? (v as TipoRevisao) : null;
const textoOuNulo = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const numeroOuNulo = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Triagem por PROJETO (coleção `triagem`, doc = uuid do projeto na origem):
 * novo × renovação, vínculo com a remessa anterior e dono da pasta.
 *
 * Fica FORA da origem porque o dado não existe lá: `cycle_projects` não liga
 * um ciclo ao outro. Os campos `sugestao*` (e o `responsavel` da distribuição)
 * vêm do `npm run avaliacao:regen`; `tipo`, `projetoAnteriorId`,
 * `responsavel` e `observacoes` a equipe edita na pasta do projeto, e o regen
 * nunca sobrescreve os três primeiros.
 *
 * `recebidoAnterior` NÃO sai daqui: é resolvido contra a origem em datasets.ts,
 * senão corrigir o vínculo deixaria o valor velho na tela.
 */
async function carregarTriagemBruto(): Promise<Map<string, RevisaoProjeto>> {
  const mapa = new Map<string, RevisaoProjeto>();
  const db = firestore();
  if (!db) return mapa;

  for (const doc of (await db.collection("triagem").get()).docs) {
    const r = doc.data();
    const sugestao = tipoOuNulo(r.sugestaoTipo) ?? "novo";
    const curadoTipo = tipoOuNulo(r.tipo);
    const curadoAnterior = textoOuNulo(r.projetoAnteriorId);
    mapa.set(doc.id, {
      naTriagem: true,
      tipo: curadoTipo ?? sugestao,
      sugestao,
      curado: curadoTipo !== null || curadoAnterior !== null,
      tipoCurado: curadoTipo,
      projetoAnteriorIdCurado: curadoAnterior,
      similaridade: numeroOuNulo(r.similaridade),
      projetoAnteriorId:
        curadoAnterior ?? textoOuNulo(r.sugestaoProjetoAnteriorId),
      projetoAnteriorTitulo: textoOuNulo(r.sugestaoProjetoAnteriorTitulo),
      recebidoAnterior: null,
      responsavel: textoOuNulo(r.responsavel),
      observacoes: textoOuNulo(r.observacoes),
    });
  }
  return mapa;
}

/** O que o `avaliacao:regen` calcula para cada projeto da remessa. */
export interface TriagemGerada {
  projectId: string;
  ano: number;
  titulo: string;
  instituicao: string;
  instituicaoId: string | null;
  status: string;
  solicitado: number;
  sugestaoTipo: TipoRevisao;
  similaridade: number | null;
  sugestaoProjetoAnteriorId: string | null;
  sugestaoProjetoAnteriorTitulo: string | null;
  sugestaoRecebidoAnterior: number | null;
  /** A distribuição das pastas é do script; os outros curados, não. */
  responsavel: string | null;
}

/**
 * Grava a rodada do regen com `merge`: `tipo`, `projetoAnteriorId` e
 * `observacoes` não estão no objeto, então o que a equipe decidiu fica.
 */
export async function gravarTriagemGerada(
  linhas: TriagemGerada[],
): Promise<void> {
  const db = firestoreObrigatorio();
  const escritor = db.bulkWriter();
  for (const { projectId, ...campos } of linhas)
    void escritor.set(
      db.collection("triagem").doc(projectId),
      { ...campos, geradoEm: FieldValue.serverTimestamp() },
      { merge: true },
    );
  await escritor.close();
}

/** Edição pela pasta do projeto. Cada gravação também vai para `historico`. */
export async function gravarTriagemCurada(
  alvo: { projectId: string; por: string },
  curado: {
    tipo: TipoRevisao | null;
    projetoAnteriorId: string | null;
    responsavel: string | null;
    observacoes: string | null;
  },
): Promise<void> {
  const db = firestoreObrigatorio();
  const ref = db.collection("triagem").doc(alvo.projectId);
  const registro = {
    ...curado,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: alvo.por,
  };
  const lote = db.batch();
  lote.set(ref, registro, { merge: true });
  lote.create(ref.collection("historico").doc(), registro);
  await lote.commit();
}

export const linksPrestacao = tolerante(
  "linksPrestacao",
  linksPrestacaoBruto,
  () => new Map(),
);

export const carregarCandidatos = tolerante(
  "carregarCandidatos",
  carregarCandidatosBruto,
  () => [],
);

export const lerDecisao = tolerante("lerDecisao", lerDecisaoBruto, () => null);

export const carregarDecisoes = tolerante(
  "carregarDecisoes",
  carregarDecisoesBruto,
  () => new Map(),
);

export const carregarEnvelopes = tolerante(
  "carregarEnvelopes",
  carregarEnvelopesBruto,
  () => new Map(),
);

export const lerMesesAjustados = tolerante(
  "lerMesesAjustados",
  lerMesesAjustadosBruto,
  () => null,
);

export const lerAdministrativo = tolerante(
  "lerAdministrativo",
  lerAdministrativoBruto,
  () => null,
);

export const lerCaixa = tolerante("lerCaixa", lerCaixaBruto, () => ({
  receita: null,
  saldoInicial: null,
  alvos: null,
}));

export const carregarTriagem = tolerante(
  "carregarTriagem",
  carregarTriagemBruto,
  () => new Map(),
);
