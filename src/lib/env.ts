import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Raiz do repositório.
 *
 * Preferimos o cwd quando ele tem os dados: sob o Next o módulo roda empacotado
 * dentro de `.next/`, e `import.meta.dirname` apontaria para lá — os CSVs de
 * `data/` não seriam encontrados. Nos scripts (`tsx`), o cwd também é a raiz;
 * o fallback pelo caminho do arquivo cobre execuções a partir de outra pasta.
 */
export const REPO_ROOT = existsSync(
  resolve(process.cwd(), "data", "country_map.csv"),
)
  ? process.cwd()
  : resolve(import.meta.dirname, "..", "..");

/** Região do pooler IPv4 do Supabase (o host direto db.* é IPv6-only). */
const DEFAULT_POOLER_HOST = "aws-1-us-east-1.pooler.supabase.com";

let cachedEnv: Record<string, string> | null = null;

/**
 * Lê .env.local em UTF-8 (a senha contém `£`, então o encoding importa).
 * Não sobrescreve variáveis já presentes em process.env.
 */
export function loadEnvLocal(): Record<string, string> {
  if (cachedEnv) return cachedEnv;

  const file = resolve(REPO_ROOT, ".env.local");
  const vars: Record<string, string> = {};

  if (existsSync(file)) {
    const raw = readFileSync(file, "utf-8").replace(/^﻿/, "");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  }

  cachedEnv = vars;
  return vars;
}

export function pick(...keys: string[]): string | undefined {
  const env = loadEnvLocal();
  for (const key of keys) {
    // process.env tem prioridade (CI, overrides de shell).
    const fromProcess = process.env[key];
    if (fromProcess !== undefined && fromProcess !== "") return fromProcess;
    const fromFile = env[key];
    if (fromFile !== undefined && fromFile !== "") return fromFile;
  }
  return undefined;
}

/**
 * Referência do projeto Supabase (`yhauleemahxvbrdkdwju`), tirada do que já
 * existe em `.env.local` — do host direto ou do usuário `postgres.<ref>` do
 * pooler. Serve para montar a URL pública do Storage sem pedir uma variável
 * nova (e sem SDK: os três buckets da origem são públicos).
 */
export function getProjectRef(): string | null {
  const explicito = pick("SUPABASE_PROJECT_REF");
  if (explicito) return explicito;

  const host = pick("IP_HOST", "DB_HOST", "PGHOST") ?? "";
  const doHost = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(host);
  if (doHost) return doHost[1]!;

  const user = pick("DB_USER", "USER", "PGUSER") ?? "";
  const doUser = /^postgres\.([a-z0-9]+)$/i.exec(user);
  return doUser ? doUser[1]! : null;
}

/**
 * Base pública do Storage. Ler daqui não escreve nada na origem — é a mesma URL
 * que o sistema de submissão já serve aos usuários.
 */
export function getStorageBaseUrl(): string | null {
  const explicito = pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const base = explicito
    ? explicito.replace(/\/+$/, "")
    : getProjectRef() && `https://${getProjectRef()}.supabase.co`;
  return base ? `${base}/storage/v1/object/public` : null;
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** true quando o host foi reescrito para o pooler IPv4. */
  viaPooler: boolean;
}

/**
 * Monta a config de conexão a partir de .env.local.
 *
 * Regras (ver CLAUDE.md):
 * - host direto `db.<ref>.supabase.co` é IPv6-only → reescrever para o pooler
 *   IPv4 e transformar o usuário em `postgres.<ref>`.
 * - overrides explícitos (DB_HOST, DB_USER, ...) sempre vencem.
 */
export function getDbConfig(): DbConfig {
  const password = pick("DB_PASSWORD", "PASSWORD", "PGPASSWORD");
  if (!password) {
    throw new Error(
      "Senha do banco não encontrada. Defina PASSWORD (ou DB_PASSWORD) em .env.local — ver .env.example.",
    );
  }

  const rawHost = pick("DB_HOST", "IP_HOST", "PGHOST") ?? "";
  const rawUser = pick("DB_USER", "USER", "PGUSER") ?? "postgres";
  const database = pick("DB_NAME", "DB", "PGDATABASE") ?? "postgres";
  const port = Number(pick("DB_PORT", "PORTA", "PGPORT") ?? 5432);

  if (!rawHost) {
    throw new Error(
      "Host do banco não encontrado. Defina IP_HOST (ou DB_HOST) em .env.local.",
    );
  }

  const usePooler = (pick("DB_USE_POOLER") ?? "true").toLowerCase() !== "false";
  const poolerHost = pick("DB_POOLER_HOST") ?? DEFAULT_POOLER_HOST;

  // db.<project-ref>.supabase.co  →  pooler IPv4 + user postgres.<project-ref>
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(rawHost);
  const explicitHost = pick("DB_HOST") !== undefined;

  if (usePooler && direct && !explicitHost) {
    const ref = direct[1]!;
    const user = rawUser.includes(".") ? rawUser : `${rawUser}.${ref}`;
    return {
      host: poolerHost,
      port,
      database,
      user,
      password,
      viaPooler: true,
    };
  }

  return {
    host: rawHost,
    port,
    database,
    user: rawUser,
    password,
    viaPooler: rawHost.includes("pooler.supabase.com"),
  };
}
