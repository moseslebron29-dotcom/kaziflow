import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { poolConfig } from "./db";

/**
 * Applies committed SQL migrations from ./drizzle in order. Safe to run on every
 * deploy: Drizzle records applied migrations and skips them next time.
 */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run migrations.");
  const candidates = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dirname, "..", "drizzle"),
  ];
  const migrationsFolder = candidates.find(dir => fs.existsSync(path.join(dir, "meta", "_journal.json")));
  if (!migrationsFolder) throw new Error("Migration folder ./drizzle was not found.");
  const pool = new pg.Pool(poolConfig());
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("[Migrate] Database schema is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("[Migrate] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
