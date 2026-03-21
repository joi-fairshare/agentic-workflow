// mcp-bridge/tests/search-memory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createEmbeddingService, type EmbeddingService } from "../src/ingestion/embedding.js";
import { searchMemory, type SearchInput } from "../src/application/services/search-memory.js";

let mdb: MemoryDbClient;
let embedService: EmbeddingService;

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);

  embedService = createEmbeddingService({
    embedFn: async (texts) =>
      texts.map((t) => {
        // Simple deterministic embedding: hash-like based on char codes
        const v = new Float32Array(768);
        for (let i = 0; i < 768; i++) v[i] = (t.charCodeAt(i % t.length) % 100) / 100;
        return v;
      }),
  });
});

describe("searchMemory", () => {
  it("returns FTS5 keyword results", async () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Zod validation", body: "Added Zod schemas for API endpoints", meta: "{}", source_id: "s1", source_type: "bridge" });
    mdb.insertNode({ repo: "r", kind: "message", title: "Database migration", body: "Added users table with indexes", meta: "{}", source_id: "s2", source_type: "bridge" });

    const result = await searchMemory(mdb, embedService, {
      query: "Zod schemas",
      repo: "r",
      mode: "keyword",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].title).toBe("Zod validation");
  });

  it("returns results filtered by kind", async () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Auth message", body: "JWT token validation", meta: "{}", source_id: "s1", source_type: "bridge" });
    mdb.insertNode({ repo: "r", kind: "decision", title: "Auth decision", body: "Use JWT tokens", meta: "{}", source_id: "s2", source_type: "manual" });

    const result = await searchMemory(mdb, embedService, {
      query: "JWT",
      repo: "r",
      mode: "keyword",
      kinds: ["decision"],
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].kind).toBe("decision");
  });

  it("falls back to keyword-only when embedding call fails in hybrid mode", async () => {
    const failEmbed = createEmbeddingService({
      embedFn: async () => { throw new Error("model crash"); },
    });

    mdb.insertNode({ repo: "r", kind: "message", title: "Fallback test", body: "Should still find this via FTS", meta: "{}", source_id: "s1", source_type: "bridge" });

    const result = await searchMemory(mdb, failEmbed, {
      query: "Fallback",
      repo: "r",
      mode: "hybrid",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
  });
});
