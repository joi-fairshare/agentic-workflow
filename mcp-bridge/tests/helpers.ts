// Shared test helpers — import these instead of repeating inline setup boilerplate.
import Database from "better-sqlite3";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";

/**
 * Creates an in-memory bridge database with all production pragmas applied.
 * Returns both the typed DbClient and the raw Database instance.
 */
export function createTestBridgeDb(): { db: DbClient; raw: Database.Database } {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");
  raw.exec(MIGRATIONS);
  const db = createDbClient(raw);
  return { db, raw };
}
