import pg from "pg";
import { getDbConfig } from "./env";

/**
 * Acesso ao banco de ORIGEM — SOMENTE LEITURA.
 *
 * REGRA ABSOLUTA (CLAUDE.md): a origem é intocável. Só `SELECT`/introspecção.
 * Nada de INSERT/UPDATE/DELETE/CREATE/ALTER — nem views, nem tabelas.
 *
 * Três camadas de proteção, porque a credencial disponível é o papel `postgres`
 * (escrita total) e "read only" hoje é só um acordo:
 *  1. `SET default_transaction_read_only = on` em toda conexão nova (o próprio
 *     Postgres passa a recusar escrita na sessão);
 *  2. `assertReadOnly()` valida cada SQL antes de sair daqui;
 *  3. nenhuma função de escrita é exportada por este módulo.
 */

const { Pool } = pg;

// numeric/int8 chegam como string no driver; converter para number aqui evita
// espalhar Number(...) por toda a camada de datasets.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;

  const cfg = getDbConfig();
  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
    application_name: "hebron-painel-readonly",
  });

  pool.on("error", (err) => {
    console.error("[db] erro no pool:", err.message);
  });

  return pool;
}

/** Palavras que jamais podem aparecer como comando numa consulta daqui. */
const FORBIDDEN =
  /\b(insert|update|delete|merge|truncate|drop|create|alter|grant|revoke|comment|refresh|reindex|vacuum|analyze|copy|call|do|set|reset|begin|commit|rollback|lock|prepare|execute|listen|notify|discard|import|security\s+label)\b/i;

export class ReadOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyViolationError";
  }
}

/** Remove comentários e literais para a checagem não confundir texto com comando. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''");
}

/**
 * Garante que o SQL é uma leitura pura. Lança se não for.
 * Exportada para poder ser testada (ver scripts/check-fase1.ts).
 */
export function assertReadOnly(sql: string): void {
  const cleaned = stripNoise(sql).trim().replace(/;\s*$/, "");

  if (cleaned.includes(";")) {
    throw new ReadOnlyViolationError(
      "Múltiplos comandos numa mesma consulta não são permitidos.",
    );
  }
  if (!/^\s*(select|with|table|explain\s+select|show)\b/i.test(cleaned)) {
    throw new ReadOnlyViolationError(
      `Somente SELECT é permitido na origem. Recebido: "${cleaned.slice(0, 60)}…"`,
    );
  }
  const hit = FORBIDDEN.exec(cleaned);
  if (hit) {
    throw new ReadOnlyViolationError(
      `Comando de escrita/efeito colateral bloqueado ("${hit[1]}"). A origem é somente leitura.`,
    );
  }
}

type ClienteMarcado = pg.PoolClient & { __readOnlyAplicado?: boolean };

let avisouSetFalhou = false;

/**
 * Pega um cliente do pool e garante que a sessão dele está travada em leitura.
 *
 * O `SET` roda uma única vez por conexão física, no primeiro checkout — não dá
 * para usar o evento `connect` do pg (ele não espera o handler e a consulta da
 * fila corre junto), e o pooler do Supabase ignora a opção de startup
 * `-c default_transaction_read_only=on`. Este `SET` não escreve dado nenhum:
 * só torna a sessão mais restrita.
 */
async function comCliente<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = (await getPool().connect()) as ClienteMarcado;
  try {
    if (!cliente.__readOnlyAplicado) {
      try {
        await cliente.query("SET default_transaction_read_only = on");
      } catch {
        if (!avisouSetFalhou) {
          avisouSetFalhou = true;
          console.warn(
            "[db] Aviso: não foi possível fixar default_transaction_read_only na sessão. " +
              "A guarda de SQL (somente SELECT) continua ativa.",
          );
        }
      }
      cliente.__readOnlyAplicado = true;
    }
    return await fn(cliente);
  } finally {
    cliente.release();
  }
}

/** Executa um SELECT na origem. Qualquer outra coisa é bloqueada antes de sair daqui. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertReadOnly(sql);
  return comCliente(
    async (cliente) => (await cliente.query<T>(sql, params)).rows,
  );
}

/** Uma linha só (ou null). */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  viaPooler: boolean;
  serverVersion: string;
  sessionReadOnly: boolean;
}

/** Testa a conexão e devolve o que dá para conferir sem expor segredo. */
export async function pingDatabase(): Promise<ConnectionInfo> {
  const cfg = getDbConfig();
  const row = await queryOne<{ version: string; ro: string }>(
    "select version() as version, current_setting('default_transaction_read_only') as ro",
  );
  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    viaPooler: cfg.viaPooler,
    serverVersion: row?.version.split(" on ")[0] ?? "desconhecida",
    sessionReadOnly: row?.ro === "on",
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
