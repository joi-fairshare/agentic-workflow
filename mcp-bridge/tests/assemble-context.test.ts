// mcp-bridge/tests/assemble-context.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { createEmbeddingService, type EmbeddingService } from "../src/ingestion/embedding.js";
import { assembleContext } from "../src/application/services/assemble-context.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;
let embedService: EmbeddingService;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());

  embedService = createEmbeddingService({
    embedFn: async (texts) =>
      texts.map((t) => {
        const v = new Float32Array(768);
        for (let i = 0; i < 768; i++) v[i] = (t.charCodeAt(i % t.length) % 100) / 100;
        return v;
      }),
  });
});

describe("assembleContext", () => {
  it("assembles context from a query", async () => {
    mdb.insertNode({ repo: "r", kind: "decision", title: "Use Fastify", body: "Decided to use Fastify for HTTP", meta: "{}", source_id: "d1", source_type: "manual" });
    mdb.insertNode({ repo: "r", kind: "message", title: "Setup discussion", body: "We discussed Fastify vs Express", meta: "{}", source_id: "m1", source_type: "bridge" });

    const result = await assembleContext(mdb, embedService, {
      query: "Fastify",
      repo: "r",
      max_tokens: 8000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections.length).toBeGreaterThan(0);
    expect(result.data.token_estimate).toBeGreaterThan(0);
    expect(typeof result.data.summary).toBe("string");
  });

  it("assembles context from a node_id", async () => {
    const node = mdb.insertNode({ repo: "r", kind: "decision", title: "Auth approach", body: "Use JWT for auth tokens", meta: "{}", source_id: "d1", source_type: "manual" });
    const related = mdb.insertNode({ repo: "r", kind: "message", title: "Auth chat", body: "Discussed JWT vs sessions", meta: "{}", source_id: "m1", source_type: "bridge" });
    mdb.insertEdge({ repo: "r", from_node: node.id, to_node: related.id, kind: "discussed_in", weight: 1, meta: "{}", auto: true });

    const result = await assembleContext(mdb, embedService, {
      node_id: node.id,
      repo: "r",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections.length).toBeGreaterThan(0);
  });

  it("respects token budget", async () => {
    // Insert many nodes with large bodies
    for (let i = 0; i < 20; i++) {
      mdb.insertNode({
        repo: "r",
        kind: "message",
        title: `Message ${i} about testing`,
        body: `Testing content ${"x".repeat(500)}`,
        meta: "{}",
        source_id: `m${i}`,
        source_type: "bridge",
      });
    }

    const result = await assembleContext(mdb, embedService, {
      query: "testing",
      repo: "r",
      max_tokens: 200,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token_estimate).toBeLessThanOrEqual(200);
  });

  it("returns sections with relevance scores", async () => {
    mdb.insertNode({ repo: "r", kind: "message", title: "Relevant", body: "Zod validation schemas", meta: "{}", source_id: "m1", source_type: "bridge" });

    const result = await assembleContext(mdb, embedService, {
      query: "Zod validation",
      repo: "r",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const section of result.data.sections) {
      expect(typeof section.relevance).toBe("number");
      expect(typeof section.heading).toBe("string");
      expect(typeof section.content).toBe("string");
    }
  });

  it("returns error when neither query nor node_id given", async () => {
    const result = await assembleContext(mdb, embedService, { repo: "r" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});
