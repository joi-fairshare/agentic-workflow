// mcp-bridge/tests/helpers.ts
// Shared test helpers — import these instead of repeating inline setup boilerplate.
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import type { EmbeddingService } from "../src/ingestion/embedding.js";

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

/**
 * Creates an in-memory memory database with all production pragmas applied and
 * the sqlite-vec extension loaded.
 * Returns both the typed MemoryDbClient and the raw Database instance.
 */
export function createTestMemoryDb(): { mdb: MemoryDbClient; raw: Database.Database } {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");
  raw.exec(MEMORY_MIGRATIONS);
  const mdb = createMemoryDbClient(raw);
  return { mdb, raw };
}

/**
 * Returns a mock EmbeddingService suitable for tests that do not need real embeddings.
 * isReady() returns true, embed() and embedBatch() return zero-filled Float32Arrays.
 */
export function createMockEmbeddingService(): EmbeddingService {
  return {
    async embed() {
      return { ok: true, data: new Float32Array(768) };
    },
    async embedBatch() {
      return { ok: true, data: [new Float32Array(768)] };
    },
    isReady() {
      return true;
    },
    isDegraded() {
      return false;
    },
    async warmUp() {},
  };
}
