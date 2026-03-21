// mcp-bridge/tests/memory-client.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { randomUUID } from "node:crypto";

let mdb: MemoryDbClient;

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
});

describe("node operations", () => {
  it("inserts and retrieves a node by id", () => {
    const node = mdb.insertNode({
      repo: "test-repo",
      kind: "message",
      title: "Test message",
      body: "Hello world",
      meta: "{}",
      source_id: "src-1",
      source_type: "bridge",
    });

    expect(node.id).toBeDefined();
    expect(node.kind).toBe("message");
    expect(node.title).toBe("Test message");

    const fetched = mdb.getNode(node.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(node.id);
  });

  it("returns undefined for unknown node id", () => {
    expect(mdb.getNode(randomUUID())).toBeUndefined();
  });

  it("truncates body exceeding MAX_BODY_BYTES", () => {
    const longBody = "x".repeat(60_000); // 60KB > 50KB limit
    const node = mdb.insertNode({
      repo: "r",
      kind: "message",
      title: "t",
      body: longBody,
      meta: "{}",
      source_id: "s",
      source_type: "bridge",
    });
    expect(node.body.length).toBeLessThanOrEqual(50 * 1024);
  });

  it("lists nodes by repo and kind", () => {
    mdb.insertNode({ repo: "r1", kind: "message", title: "a", body: "b", meta: "{}", source_id: "s1", source_type: "bridge" });
    mdb.insertNode({ repo: "r1", kind: "topic", title: "c", body: "d", meta: "{}", source_id: "s2", source_type: "manual" });
    mdb.insertNode({ repo: "r2", kind: "message", title: "e", body: "f", meta: "{}", source_id: "s3", source_type: "bridge" });

    const r1Messages = mdb.getNodesByRepoAndKind("r1", "message");
    expect(r1Messages).toHaveLength(1);
    expect(r1Messages[0].title).toBe("a");

    const r1All = mdb.getNodesByRepo("r1", 100, 0);
    expect(r1All).toHaveLength(2);
  });

  it("finds node by source_type and source_id", () => {
    const node = mdb.insertNode({
      repo: "r",
      kind: "message",
      title: "t",
      body: "b",
      meta: "{}",
      source_id: "msg-abc",
      source_type: "bridge",
    });

    const found = mdb.getNodeBySource("bridge", "msg-abc");
    expect(found).toBeDefined();
    expect(found!.id).toBe(node.id);
  });

  it("returns undefined for unknown source", () => {
    expect(mdb.getNodeBySource("bridge", "nonexistent")).toBeUndefined();
  });
});

describe("edge operations", () => {
  it("inserts and retrieves edges by node", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "conversation", title: "conv", body: "b", meta: "{}", source_id: "c1", source_type: "bridge" });
    const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "msg", body: "b", meta: "{}", source_id: "m1", source_type: "bridge" });

    const edge = mdb.insertEdge({
      repo: "r",
      from_node: n1.id,
      to_node: n2.id,
      kind: "contains",
      weight: 1.0,
      meta: "{}",
      auto: true,
    });

    expect(edge.id).toBeDefined();
    expect(edge.kind).toBe("contains");

    const outgoing = mdb.getEdgesFrom(n1.id);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].to_node).toBe(n2.id);

    const incoming = mdb.getEdgesTo(n2.id);
    expect(incoming).toHaveLength(1);
    expect(incoming[0].from_node).toBe(n1.id);
  });

  it("returns empty array for node with no edges", () => {
    const n = mdb.insertNode({ repo: "r", kind: "message", title: "t", body: "b", meta: "{}", source_id: "s", source_type: "bridge" });
    expect(mdb.getEdgesFrom(n.id)).toHaveLength(0);
    expect(mdb.getEdgesTo(n.id)).toHaveLength(0);
  });
});

describe("cursor operations", () => {
  it("upserts and retrieves a cursor", () => {
    mdb.upsertCursor("bridge-backfill", "test-repo", "2026-01-01T00:00:00Z");
    const cursor = mdb.getCursor("bridge-backfill", "test-repo");
    expect(cursor).toBe("2026-01-01T00:00:00Z");
  });

  it("updates an existing cursor", () => {
    mdb.upsertCursor("bridge-backfill", "r", "2026-01-01T00:00:00Z");
    mdb.upsertCursor("bridge-backfill", "r", "2026-02-01T00:00:00Z");
    expect(mdb.getCursor("bridge-backfill", "r")).toBe("2026-02-01T00:00:00Z");
  });

  it("returns undefined for unknown cursor", () => {
    expect(mdb.getCursor("nonexistent", "r")).toBeUndefined();
  });
});

describe("FTS5 search", () => {
  it("searches nodes by text match", () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Authentication refactor", body: "Moved JWT validation to middleware", meta: "{}", source_id: "s1", source_type: "bridge" });
    mdb.insertNode({ repo: "r", kind: "message", title: "Database migration", body: "Added users table", meta: "{}", source_id: "s2", source_type: "bridge" });

    const results = mdb.searchFTS("JWT validation", "r", 10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Authentication refactor");
  });

  it("returns BM25 rank score", () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Zod validation", body: "Added Zod schemas for all endpoints", meta: "{}", source_id: "s1", source_type: "bridge" });

    const results = mdb.searchFTS("Zod", "r", 10);
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBeDefined();
    expect(typeof results[0].rank).toBe("number");
  });
});

describe("transaction", () => {
  it("wraps multiple operations atomically", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "conversation", title: "c", body: "b", meta: "{}", source_id: "c1", source_type: "bridge" });

    mdb.transaction(() => {
      const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "m", body: "b", meta: "{}", source_id: "m1", source_type: "bridge" });
      mdb.insertEdge({ repo: "r", from_node: n1.id, to_node: n2.id, kind: "contains", weight: 1.0, meta: "{}", auto: true });
    });

    const edges = mdb.getEdgesFrom(n1.id);
    expect(edges).toHaveLength(1);
  });
});

describe("stats", () => {
  it("returns node and edge counts per repo", () => {
    mdb.insertNode({ repo: "r1", kind: "message", title: "a", body: "b", meta: "{}", source_id: "s1", source_type: "bridge" });
    mdb.insertNode({ repo: "r1", kind: "topic", title: "c", body: "d", meta: "{}", source_id: "s2", source_type: "manual" });

    const stats = mdb.getStats("r1");
    expect(stats.node_count).toBe(2);
    expect(stats.edge_count).toBe(0);
  });
});

describe("embedding operations", () => {
  it("inserts and retrieves embeddings for a node", () => {
    const node = mdb.insertNode({
      repo: "r",
      kind: "message",
      title: "t",
      body: "b",
      meta: "{}",
      source_id: "s1",
      source_type: "bridge",
    });

    const embedding = new Float32Array(768).fill(0.5);
    mdb.insertEmbedding(node.id, embedding);

    const result = mdb.getEmbedding(node.id);
    expect(result).toBeDefined();
    expect(result!.length).toBe(768);
  });

  it("performs KNN search", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "message", title: "a", body: "b", meta: "{}", source_id: "s1", source_type: "bridge" });
    const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "c", body: "d", meta: "{}", source_id: "s2", source_type: "bridge" });
    const n3 = mdb.insertNode({ repo: "r", kind: "message", title: "e", body: "f", meta: "{}", source_id: "s3", source_type: "bridge" });

    const query = new Float32Array(768).fill(1.0);
    mdb.insertEmbedding(n1.id, new Float32Array(768).fill(0.9));
    mdb.insertEmbedding(n2.id, new Float32Array(768).fill(0.5));
    mdb.insertEmbedding(n3.id, new Float32Array(768).fill(0.1));

    const results = mdb.searchKNN(query, 2);
    expect(results).toHaveLength(2);
    expect(results[0].node_id).toBe(n1.id);
  });
});
