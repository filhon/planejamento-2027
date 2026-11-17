import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Decisao, Situacao } from "./decisao";
import { embedDrive, rotuloDrive } from "./drive";
import { firestore, firestoreObrigatorio } from "./firestore";
import type { Candidato } from "./parcerias";
import type { Anexo } from "./types";

/**
 * Leitura e escrita do banco do painel (Firestore). Coleções descritas em
 * `firestore.ts`. Nada aqui toca a origem.
 */

const data = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : null;

// ---------- prestacao_links ----------

/**
 * Links do Drive com a prestação de contas que nunca entrou no sistema de
 * submissão, por projeto. Saem com a forma de `Anexo` para cair no mesmo
 * visor dos anexos da origem. Só `https` passa (um `javascript:` viraria href).
 */
export async function linksPrestacao(
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

export async function carregarCandidatos(): Promise<Candidato[]> {
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

export async function lerDecisao(projectId: string): Promise<Decisao | null> {
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
