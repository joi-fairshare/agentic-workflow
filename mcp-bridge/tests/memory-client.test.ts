// mcp-bridge/tests/memory-client.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { randomUUID } from "node:crypto";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());
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

  it("deleteNodesBySourceType removes nodes and cascades to edges", () => {
    const n1 = mdb.insertNode({ repo: "r", kind: "message", title: "a", body: "b", meta: "{}", source_id: "s1", source_type: "bridge" });
    const n2 = mdb.insertNode({ repo: "r", kind: "message", title: "c", body: "d", meta: "{}", source_id: "s2", source_type: "bridge" });
    const n3 = mdb.insertNode({ repo: "r", kind: "topic", title: "e", body: "f", meta: "{}", source_id: "s3", source_type: "manual" });

    // Create edges: n3 → n1 and n3 → n2
    mdb.insertEdge({ repo: "r", from_node: n3.id, to_node: n1.id, kind: "related_to", weight: 1.0, meta: "{}", auto: true });
    mdb.insertEdge({ repo: "r", from_node: n3.id, to_node: n2.id, kind: "related_to", weight: 1.0, meta: "{}", auto: true });

    // Verify setup
    expect(mdb.getEdgesFrom(n3.id)).toHaveLength(2);
    expect(mdb.getStats("r").node_count).toBe(3);

    // Delete all bridge nodes in repo "r"
    mdb.deleteNodesBySourceType("bridge", "r");

    // Bridge nodes should be gone
    expect(mdb.getNode(n1.id)).toBeUndefined();
    expect(mdb.getNode(n2.id)).toBeUndefined();

    // Manual node should remain
    expect(mdb.getNode(n3.id)).toBeDefined();

    // Edges pointing to deleted nodes should be cascade-deleted
    expect(mdb.getEdgesFrom(n3.id)).toHaveLength(0);
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

describe("FTS5 edge cases", () => {
  it("searchFTS returns empty for blank query", () => {
    const results = mdb.searchFTS("   ", "r", 10);
    expect(results).toEqual([]);
  });
});

describe("FTS5 adversarial input sanitization", () => {
  // Each test inserts a node so a successful match can be confirmed, then
  // asserts that none of the adversarial queries throw — they must return
  // either results or an empty array.

  beforeEach(() => {
    mdb.insertNode({ repo: "r", kind: "message", title: "adversarial test node", body: "sanitization check", meta: "{}", source_id: "adv-1", source_type: "bridge" });
  });

  it("handles embedded double quotes without throwing", () => {
    expect(() => mdb.searchFTS('term "with" quotes', "r", 10)).not.toThrow();
    const results = mdb.searchFTS('term "with" quotes', "r", 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles FTS5 boolean operators as search terms without throwing", () => {
    expect(() => mdb.searchFTS("NEAR OR NOT AND", "r", 10)).not.toThrow();
    const results = mdb.searchFTS("NEAR OR NOT AND", "r", 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles wildcard characters without throwing", () => {
    expect(() => mdb.searchFTS("test*", "r", 10)).not.toThrow();
    const results = mdb.searchFTS("test*", "r", 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles parentheses and column syntax without throwing", () => {
    expect(() => mdb.searchFTS("(nested) title:foo", "r", 10)).not.toThrow();
    const results = mdb.searchFTS("(nested) title:foo", "r", 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles backslash sequences without throwing", () => {
    expect(() => mdb.searchFTS("path\\to\\file", "r", 10)).not.toThrow();
    const results = mdb.searchFTS("path\\to\\file", "r", 10);
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("truncateBody with multi-byte UTF-8 characters", () => {
  it("truncates body with 3-byte chars and strips trailing UTF-8 replacement char", () => {
    // Chinese character 中 (U+4E2D) is 3 bytes in UTF-8.
    // MAX_BODY_BYTES = 50 * 1024 = 51200.
    // 17067 chars × 3 bytes = 51201 bytes > 51200, so truncation occurs.
    // Slicing at 51200 takes 17066 complete chars (51198 bytes) + 2 bytes of the 17067th char,
    // which produces a UTF-8 replacement character (\uFFFD) that must be stripped.
    const threeByteChar = "\u4e2d"; // 中 — 3 bytes in UTF-8
    const longBody = threeByteChar.repeat(17067); // 51201 bytes total
    const node = mdb.insertNode({
      repo: "r",
      kind: "message",
      title: "multibyte test",
      body: longBody,
      meta: "{}",
      source_id: "mb-s",
      source_type: "bridge",
    });
    // Body should be truncated
    expect(node.body.length).toBeLessThan(longBody.length);
    // The replacement char from the truncated multi-byte char should be stripped
    expect(node.body.endsWith("\uFFFD")).toBe(false);
    // Should end with a complete Chinese character
    expect(node.body.endsWith(threeByteChar)).toBe(true);
  });
});

describe("KNN with repo filter", () => {
  it("searchKNN with repo filter returns only matching repo nodes", () => {
    const n1 = mdb.insertNode({ repo: "repo-a", kind: "message", title: "A", body: "test", meta: "{}", source_id: "a1", source_type: "t" });
    const n2 = mdb.insertNode({ repo: "repo-b", kind: "message", title: "B", body: "test", meta: "{}", source_id: "b1", source_type: "t" });

    const emb = new Float32Array(768).fill(0.1);
    mdb.insertEmbedding(n1.id, emb);
    mdb.insertEmbedding(n2.id, emb);

    const results = mdb.searchKNN(emb, 10, "repo-a");
    expect(results.every((r) => {
      const node = mdb.getNode(r.node_id);
      return node?.repo === "repo-a";
    })).toBe(true);
    expect(results.length).toBeGreaterThan(0);
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
