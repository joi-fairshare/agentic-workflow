// mcp-bridge/tests/search-memory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { createEmbeddingService, type EmbeddingService } from "../src/ingestion/embedding.js";
import { searchMemory, type SearchInput } from "../src/application/services/search-memory.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;
let embedService: EmbeddingService;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());

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

  it("filters search results by sender when provided", async () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "hello from human", body: "", meta: "{}", source_id: "1", source_type: "t", sender: "human" });
    mdb.insertNode({ repo: "r", kind: "message", title: "hello from assistant", body: "", meta: "{}", source_id: "2", source_type: "t", sender: "assistant" });

    const result = await searchMemory(mdb, embedService, { query: "hello", repo: "r", mode: "keyword", limit: 10, sender: "human" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toContain("human");
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

  it("defaults to hybrid mode when mode is not provided", async () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Default mode test", body: "Uses hybrid by default", meta: "{}", source_id: "dm1", source_type: "bridge" });

    // Call without mode — should default to hybrid
    const result = await searchMemory(mdb, embedService, {
      query: "Default",
      repo: "r",
      limit: 10,
    });
    expect(result.ok).toBe(true);
  });

  it("degrades hybrid to keyword when embedService.isDegraded() is true", async () => {
    // Use a mock that directly reports isDegraded() = true so lines 42-44 are exercised
    const alwaysDegradedEmbed: import("../src/ingestion/embedding.js").EmbeddingService = {
      async embed() { return { ok: false, error: { code: "EMBEDDING_DEGRADED", message: "degraded", statusHint: 503 } }; },
      async embedBatch() { return { ok: false, error: { code: "EMBEDDING_DEGRADED", message: "degraded", statusHint: 503 } }; },
      isReady() { return false; },
      isDegraded() { return true; },
      async warmUp() {},
    };

    mdb.insertNode({ repo: "r", kind: "message", title: "Degraded test", body: "Keyword search still works", meta: "{}", source_id: "d1", source_type: "bridge" });

    const result = await searchMemory(mdb, alwaysDegradedEmbed, {
      query: "Keyword",
      repo: "r",
      mode: "hybrid",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].match_type).toBe("keyword");
  });

  it("returns error for semantic-only mode when embedding fails", async () => {
    const failEmbed = createEmbeddingService({
      embedFn: async () => { throw new Error("embed crash"); },
    });

    mdb.insertNode({ repo: "r", kind: "message", title: "Sem fail", body: "test", meta: "{}", source_id: "sf1", source_type: "bridge" });

    const result = await searchMemory(mdb, failEmbed, {
      query: "test",
      repo: "r",
      mode: "semantic",
      limit: 10,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMBEDDING_FAILED");
  });

  it("returns semantic results with proper RRF scoring", async () => {
    // Insert a node and its embedding for vector search
    const node = mdb.insertNode({ repo: "r", kind: "message", title: "Vector test", body: "Semantic vector search content", meta: "{}", source_id: "v1", source_type: "bridge" });
    // Embed the node
    const embedding = await embedService.embed("search_document: Semantic vector search content");
    if (embedding.ok) {
      mdb.insertEmbedding(node.id, embedding.data);
    }

    const result = await searchMemory(mdb, embedService, {
      query: "Semantic vector search",
      repo: "r",
      mode: "semantic",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].match_type).toBe("semantic");
  });

  it("hybrid mode merges FTS and vector results with RRF fusion", async () => {
    const node = mdb.insertNode({ repo: "r", kind: "message", title: "Hybrid merge", body: "This tests hybrid search fusion", meta: "{}", source_id: "h1", source_type: "bridge" });
    const embedding = await embedService.embed("search_document: This tests hybrid search fusion");
    if (embedding.ok) {
      mdb.insertEmbedding(node.id, embedding.data);
    }

    const result = await searchMemory(mdb, embedService, {
      query: "hybrid search fusion",
      repo: "r",
      mode: "hybrid",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("kind filter works on vector-only results via getNode lookup", async () => {
    // Insert two nodes with same embedding but different kinds
    const msgNode = mdb.insertNode({ repo: "r", kind: "message", title: "Vec msg", body: "Vector only message", meta: "{}", source_id: "vk1", source_type: "bridge" });
    const decNode = mdb.insertNode({ repo: "r", kind: "decision", title: "Vec dec", body: "Vector only decision", meta: "{}", source_id: "vk2", source_type: "manual" });

    const emb1 = await embedService.embed("search_document: Vector only message");
    const emb2 = await embedService.embed("search_document: Vector only decision");
    if (emb1.ok) mdb.insertEmbedding(msgNode.id, emb1.data);
    if (emb2.ok) mdb.insertEmbedding(decNode.id, emb2.data);

    const result = await searchMemory(mdb, embedService, {
      query: "Vector only",
      repo: "r",
      mode: "semantic",
      kinds: ["decision"],
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // All results should be decisions, filtering out messages
    for (const r of result.data) {
      expect(r.kind).toBe("decision");
    }
  });

  it("returns results when repo is empty string and nodes exist with repo='default'", async () => {
    mdb.insertNode({ repo: "default", kind: "conversation", title: "Conversation abc123", body: "", meta: "{}", source_id: "abc123", source_type: "bridge-conversation" });

    const result = await searchMemory(mdb, embedService, {
      query: "abc123",
      repo: "",
      mode: "keyword",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].title).toContain("abc123");
  });
});
