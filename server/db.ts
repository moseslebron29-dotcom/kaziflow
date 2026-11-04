import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../drizzle/schema";

export type Db = NodePgDatabase<typeof schema>;
let _db: Db | null = null;
let _pool: pg.Pool | null = null;

/**
 * Render Postgres: the internal connection string needs no TLS; the external one
 * does. Set DATABASE_SSL=true when connecting from outside Render.
 */
export function poolConfig(url = process.env.DATABASE_URL): pg.PoolConfig {
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  return { connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_MAX || 10) };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _pool = new pg.Pool(poolConfig());
    _pool.on("error", error => console.error("[Database] Pool error:", error.message));
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export async function closeDb() {
  await _pool?.end();
  _pool = null;
  _db = null;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0];
}

/** Postgres unique-violation detection (replaces MySQL ER_DUP_ENTRY). */
export function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
