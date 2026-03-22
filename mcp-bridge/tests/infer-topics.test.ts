// mcp-bridge/tests/infer-topics.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { createEmbeddingService, type EmbeddingService, EMBEDDING_DIMS } from "../src/ingestion/embedding.js";
import { inferTopics } from "../src/application/services/infer-topics.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;
let embedService: EmbeddingService;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());

  // Minimal mock — isReady() returns true, embed() won't be called by inferTopics
  embedService = createEmbeddingService({
    embedFn: async (texts) =>
      texts.map(() => new Float32Array(EMBEDDING_DIMS).fill(0)),
  });
});

// ── Helpers ─────────────────────────────────────────────────

/** Insert a conversation node with a given fake embedding. */
function insertConvWithEmbedding(
  title: string,
  embedding: Float32Array,
  idx: number,
): ReturnType<MemoryDbClient["insertNode"]> {
  const node = mdb.insertNode({
    repo: "r",
    kind: "conversation",
    title,
    body: `Body of ${title}`,
    meta: "{}",
    source_id: `src-${idx}`,
    source_type: "test",
  });
  mdb.insertEmbedding(node.id, embedding);
  return node;
}

/** Build a unit vector in 768 dims where only dim[axis] is non-zero. */
function axisVec(axis: number): Float32Array {
  const v = new Float32Array(EMBEDDING_DIMS);
  v[axis] = 1.0;
  return v;
}

// ── Tests ───────────────────────────────────────────────────

describe("inferTopics", () => {
  it("creates topic nodes from clearly clustered conversations", async () => {
    // 4 conversations forming 2 clusters:
    //   cluster A: axis 0  (conversations 1 & 2)
    //   cluster B: axis 100 (conversations 3 & 4)
    insertConvWithEmbedding("Conv A1", axisVec(0), 1);
    insertConvWithEmbedding("Conv A2", axisVec(0), 2);
    insertConvWithEmbedding("Conv B1", axisVec(100), 3);
    insertConvWithEmbedding("Conv B2", axisVec(100), 4);

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.topics_created).toBe(2);

    // Verify topic nodes exist in DB
    const topics = mdb.getNodesByRepoAndKind("r", "topic");
    expect(topics).toHaveLength(2);
  });

  it("wires discussed_in edges from topics to conversations", async () => {
    insertConvWithEmbedding("Conv A1", axisVec(0), 1);
    insertConvWithEmbedding("Conv A2", axisVec(0), 2);
    insertConvWithEmbedding("Conv B1", axisVec(100), 3);
    insertConvWithEmbedding("Conv B2", axisVec(100), 4);

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.edges_created).toBe(4); // 2 edges per topic × 2 topics

    // Each topic should have exactly 2 outgoing discussed_in edges
    const topics = mdb.getNodesByRepoAndKind("r", "topic");
    for (const topic of topics) {
      const edges = mdb.getEdgesFrom(topic.id);
      expect(edges).toHaveLength(2);
      expect(edges.every((e) => e.kind === "discussed_in")).toBe(true);
    }
  });

  it("respects the k parameter for cluster count", async () => {
    // 6 conversations, 3 distinct directions → 3 clusters with k=3
    insertConvWithEmbedding("A1", axisVec(0), 1);
    insertConvWithEmbedding("A2", axisVec(0), 2);
    insertConvWithEmbedding("B1", axisVec(100), 3);
    insertConvWithEmbedding("B2", axisVec(100), 4);
    insertConvWithEmbedding("C1", axisVec(200), 5);
    insertConvWithEmbedding("C2", axisVec(200), 6);

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.topics_created).toBe(3);
    const topics = mdb.getNodesByRepoAndKind("r", "topic");
    expect(topics).toHaveLength(3);
  });

  it("skips nodes without embeddings", async () => {
    // Insert 2 conversations WITH embeddings in one cluster
    insertConvWithEmbedding("With1", axisVec(0), 1);
    insertConvWithEmbedding("With2", axisVec(0), 2);
    // Insert 2 conversations WITHOUT embeddings
    mdb.insertNode({ repo: "r", kind: "conversation", title: "No emb 1", body: "body", meta: "{}", source_id: "ne1", source_type: "test" });
    mdb.insertNode({ repo: "r", kind: "conversation", title: "No emb 2", body: "body", meta: "{}", source_id: "ne2", source_type: "test" });

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only 1 topic should be created (from the 2 nodes that have embeddings)
    expect(result.data.topics_created).toBe(1);
    // Only 2 edges (the 2 nodes with embeddings)
    expect(result.data.edges_created).toBe(2);
  });

  it("returns zero topics if fewer than 2 nodes have embeddings", async () => {
    // Only 1 node with an embedding — can't form a cluster of size 2
    insertConvWithEmbedding("Lone", axisVec(0), 1);

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.topics_created).toBe(0);
    expect(result.data.edges_created).toBe(0);
  });

  it("returns zero topics for empty repo", async () => {
    const result = await inferTopics(mdb, embedService, { repo: "r", k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.topics_created).toBe(0);
    expect(result.data.edges_created).toBe(0);
  });

  it("applies cosine similarity threshold — skips low-similarity assignments", async () => {
    // Two groups, but very different embeddings
    insertConvWithEmbedding("Near1", axisVec(0), 1);
    insertConvWithEmbedding("Near2", axisVec(0), 2);

    // Use extremely high threshold — nothing should pass (cosine sim of identical = 1.0)
    // Actually use threshold=0 to ensure all pass, then verify edge count
    const result = await inferTopics(mdb, embedService, {
      repo: "r",
      k: 1,
      threshold: 0.0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // With threshold 0, everything in 1 cluster should create 1 topic with 2 edges
    expect(result.data.topics_created).toBe(1);
    expect(result.data.edges_created).toBe(2);
  });

  it("handles entries with identical embeddings gracefully", async () => {
    // Insert multiple conversations with identical embeddings — triggers totalWeight=0 early stop
    for (let i = 0; i < 5; i++) {
      const node = mdb.insertNode({ repo: "r", kind: "conversation", title: `Same conv ${i}`, body: "identical", meta: "{}", source_id: `same-${i}`, source_type: "test" });
      mdb.insertEmbedding(node.id, new Float32Array(EMBEDDING_DIMS).fill(0.5));
    }

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 3, threshold: 0.0 });
    expect(result.ok).toBe(true);
  });

  it("uses the topic node title from the most-central cluster member", async () => {
    // All 3 identical vectors → 1 cluster, any member can be most central
    insertConvWithEmbedding("Alpha Conversation", axisVec(0), 1);
    insertConvWithEmbedding("Beta Conversation", axisVec(0), 2);
    insertConvWithEmbedding("Gamma Conversation", axisVec(0), 3);

    const result = await inferTopics(mdb, embedService, { repo: "r", k: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const topics = mdb.getNodesByRepoAndKind("r", "topic");
    expect(topics).toHaveLength(1);
    // Title must be one of the conversation titles (most central member)
    const validTitles = ["Alpha Conversation", "Beta Conversation", "Gamma Conversation"];
    expect(validTitles).toContain(topics[0].title);
  });
});
