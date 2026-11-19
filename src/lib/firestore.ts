import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { pick } from "./env";

/**
 * O banco DO PAINEL (Firestore) — tudo o que o painel grava mora aqui, nunca na
 * origem. Substitui os CSVs graváveis (prestacao_links, parcerias_candidatos),
 * que a Vercel apagava a cada deploy, e guarda a decisão de contingência.
 *
 * Coleções (docs/publicacao.md):
 *  - prestacao_links/{auto}   { projectId, ano, titulo, rotulo, link, adicionadoEm, adicionadoPor }
 *  - parcerias_candidatos/{encodeURIComponent(chave)}  { chave, rotulo, nota, marcadoEm, marcadoPor }
 *  - decisoes/{projectId}     { ano, titulo, situacao, valorAprovado, observacao, atualizadoEm, atualizadoPor }
 *    └ historico/{auto}       cópia de cada gravação (nada se perde ao sobrescrever)
 *  - envelopes/{projectId}    { ano, titulo, envelope, meses[12], atualizadoEm, atualizadoPor } + historico
 *  - envelopes_admin/{ano}    { ano, meses[12] (null = reserva), versao: 2, atualizadoEm, atualizadoPor } + historico
 *  - envelopes_caixa/{ano}    { ano, receita[12] (null = sistema ÷ 12), saldoInicial, atualizadoEm, atualizadoPor } + historico
 *
 * Só o servidor fala com o Firestore (Admin SDK, conta de serviço). As regras
 * do Firestore podem — e devem — negar todo acesso de cliente: ver
 * firestore.rules.
 */

let banco: Firestore | null | undefined;

/** `null` quando FIREBASE_SERVICE_ACCOUNT não está definido (leitura vira vazio). */
export function firestore(): Firestore | null {
  if (banco !== undefined) return banco;
  const bruto = pick("FIREBASE_SERVICE_ACCOUNT");
  if (!bruto) {
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT ausente: links, candidatos e decisões ficam vazios e não gravam.",
    );
    return (banco = null);
  }
  // Aceita o JSON da conta de serviço cru ou em base64 (mais fácil de colar
  // numa linha só do .env.local).
  const json = bruto.trim().startsWith("{")
    ? bruto
    : Buffer.from(bruto, "base64").toString("utf-8");
  const app =
    getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
  return (banco = getFirestore(app));
}

/** Para as Server Actions: gravar sem banco configurado é erro, não silêncio. */
export function firestoreObrigatorio(): Firestore {
  const db = firestore();
  if (!db)
    throw new Error(
      "Banco do painel não configurado (FIREBASE_SERVICE_ACCOUNT) — ver docs/publicacao.md.",
    );
  return db;
}
