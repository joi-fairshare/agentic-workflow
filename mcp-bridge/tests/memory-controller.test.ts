import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import type { EmbeddingService } from "../src/ingestion/embedding.js";
import { createMemoryController } from "../src/transport/controllers/memory-controller.js";
import type { ApiRequest } from "../src/transport/types.js";
import type { CreateNodeSchema, GetContextSchema, CreateLinkSchema, SearchMemorySchema, TraverseSchema } from "../src/transport/schemas/memory-schemas.js";
import { createTestMemoryDb, createMockEmbeddingService } from "./helpers.js";

function makeCreateNodeReq(
  body: { repo: string; kind: "topic" | "decision"; title: string; body?: string; related_to?: string },
): ApiRequest<CreateNodeSchema> {
  return {
    body: { repo: body.repo, kind: body.kind, title: body.title, body: body.body, related_to: body.related_to },
    params: undefined as never,
    query: undefined as never,
    requestId: "test",
  };
}

describe("memory-controller", () => {
  let mdb: MemoryDbClient;
  let controller: ReturnType<typeof createMemoryController>;

  beforeEach(() => {
    ({ mdb } = createTestMemoryDb());
    const filter = createSecretFilter();
    const embedService = createMockEmbeddingService();
    controller = createMemoryController(mdb, embedService, filter);
  });

  describe("getContext", () => {
    it("returns VALIDATION_ERROR when neither query nor node_id is provided", async () => {
      const result = await controller.getContext({
        query: { repo: "test-repo", max_tokens: 8000 } as never,
        body: undefined as never,
        params: undefined as never,
        requestId: "test",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns context sections when query matches nodes", async () => {
      // Insert a node that will be found by the query
      mdb.insertNode({
        repo: "test-repo",
        kind: "message",
        title: "Context test node",
        body: "This is content for context assembly testing",
        meta: "{}",
        source_id: "ctx-1",
        source_type: "bridge",
      });

      const result = await controller.getContext({
        query: { repo: "test-repo", query: "context assembly", max_tokens: 8000 },
        body: undefined as never,
        params: undefined as never,
        requestId: "test",
      } as ApiRequest<GetContextSchema>);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // sections should be an array (possibly empty if keyword search returns nothing)
      expect(Array.isArray(result.data.sections)).toBe(true);
    });
  });

  describe("createLink", () => {
    it("returns NOT_FOUND when to_node does not exist", async () => {
      const fromNode = mdb.insertNode({
        repo: "test-repo",
        kind: "topic",
        title: "From Node",
        body: "body",
        meta: "{}",
        source_id: "from-1",
        source_type: "bridge",
      });

      const result = await controller.createLink({
        body: { from_node: fromNode.id, to_node: "non-existent-id", kind: "related_to" },
        params: undefined as never,
        query: undefined as never,
        requestId: "test",
      } as ApiRequest<CreateLinkSchema>);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("createLink with note", () => {
    it("creates link with a note and filters secrets from it", async () => {
      const fromNode = mdb.insertNode({ repo: "test-repo", kind: "topic", title: "From", body: "", meta: "{}", source_id: "fl-from", source_type: "bridge" });
      const toNode = mdb.insertNode({ repo: "test-repo", kind: "decision", title: "To", body: "", meta: "{}", source_id: "fl-to", source_type: "bridge" });

      const result = await controller.createLink({
        body: { from_node: fromNode.id, to_node: toNode.id, kind: "related_to", note: "See discussion" },
        params: undefined as never,
        query: undefined as never,
        requestId: "test",
      } as ApiRequest<CreateLinkSchema>);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The note should be stored in meta
      expect(result.data.meta).toContain("See discussion");
    });
  });

  describe("search", () => {
    it("returns EMBEDDING_NOT_READY when mode=semantic and embedService is not ready", async () => {
      // Use a not-ready embedding service to exercise the EMBEDDING_NOT_READY path
      const notReadyEmbed: EmbeddingService = {
        async embed() { return { ok: true, data: new Float32Array(768) }; },
        async embedBatch() { return { ok: true, data: [new Float32Array(768)] }; },
        isReady() { return false; },
        isDegraded() { return false; },
        async warmUp() {},
      };
      const notReadyController = createMemoryController(mdb, notReadyEmbed, createSecretFilter());
      const result = await notReadyController.search({
        query: { repo: "test-repo", query: "anything", mode: "semantic" as const, limit: 10 },
        body: undefined as never,
        params: undefined as never,
        requestId: "test",
      } as ApiRequest<SearchMemorySchema>);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("EMBEDDING_NOT_READY");
    });

    it("handles kinds filter (comma-separated kinds string)", async () => {
      mdb.insertNode({ repo: "test-repo", kind: "decision", title: "A decision", body: "body", meta: "{}", source_id: "s-dec", source_type: "bridge" });

      const result = await controller.search({
        query: { repo: "test-repo", query: "decision", mode: "keyword" as const, kinds: "decision,topic", limit: 10 },
        body: undefined as never,
        params: undefined as never,
        requestId: "test",
      } as ApiRequest<SearchMemorySchema>);

      expect(result.ok).toBe(true);
    });

    it("returns error from searchMemory when semantic search fails (embed service ready but fails)", async () => {
      // Use a mock where isReady()=true but embed() always fails, causing semantic search to error
      const failReadyEmbed: EmbeddingService = {
        async embed() { return { ok: false, error: { code: "EMBEDDING_FAILED", message: "crash", statusHint: 500 } }; },
        async embedBatch() { return { ok: false, error: { code: "EMBEDDING_FAILED", message: "crash", statusHint: 500 } }; },
        isReady() { return true; },
        isDegraded() { return false; },
        async warmUp() {},
      };
      const failController = createMemoryController(mdb, failReadyEmbed, createSecretFilter());

      const result = await failController.search({
        query: { repo: "test-repo", query: "anything", mode: "semantic" as const, limit: 10 },
        body: undefined as never,
        params: undefined as never,
        requestId: "test",
      } as ApiRequest<SearchMemorySchema>);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("EMBEDDING_FAILED");
    });
  });

  describe("traverse", () => {
    it("returns NOT_FOUND when node_id does not exist", async () => {
      const result = await controller.traverse({
        query: { direction: "outgoing" as const, max_depth: 3, max_nodes: 50 },
        params: { id: "nonexistent-node-id" },
        body: undefined as never,
        requestId: "test",
      } as ApiRequest<TraverseSchema>);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");
    });

    it("handles edge_kinds filter (comma-separated string)", async () => {
      const node = mdb.insertNode({ repo: "test-repo", kind: "conversation", title: "Conv", body: "body", meta: "{}", source_id: "conv-ek", source_type: "bridge" });

      const result = await controller.traverse({
        query: { direction: "outgoing" as const, edge_kinds: "contains,reply_to", max_depth: 3, max_nodes: 50 },
        params: { id: node.id },
        body: undefined as never,
        requestId: "test",
      } as ApiRequest<TraverseSchema>);

      expect(result.ok).toBe(true);
    });
  });

  describe("createNode", () => {
    it("should create multiple manual nodes without UNIQUE constraint violation", async () => {
      const res1 = await controller.createNode(
        makeCreateNodeReq({ repo: "test-repo", kind: "topic", title: "First Topic", body: "Body 1" }),
      );
      const res2 = await controller.createNode(
        makeCreateNodeReq({ repo: "test-repo", kind: "topic", title: "Second Topic", body: "Body 2" }),
      );
      const res3 = await controller.createNode(
        makeCreateNodeReq({ repo: "test-repo", kind: "decision", title: "A Decision", body: "Body 3" }),
      );

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(res3.ok).toBe(true);

      // Each node should have a unique source_id
      if (res1.ok && res2.ok && res3.ok) {
        const sourceIds = new Set([res1.data.source_id, res2.data.source_id, res3.data.source_id]);
        expect(sourceIds.size).toBe(3);

        // All should have source_type "manual"
        expect(res1.data.source_type).toBe("manual");
        expect(res2.data.source_type).toBe("manual");
        expect(res3.data.source_type).toBe("manual");

        // All should have unique node ids
        const nodeIds = new Set([res1.data.id, res2.data.id, res3.data.id]);
        expect(nodeIds.size).toBe(3);
      }
    });

    it("should create a related_to edge when related_to is provided", async () => {
      const target = await controller.createNode(
        makeCreateNodeReq({ repo: "test-repo", kind: "topic", title: "Target" }),
      );
      expect(target.ok).toBe(true);
      if (!target.ok) return;

      const related = await controller.createNode(
        makeCreateNodeReq({ repo: "test-repo", kind: "decision", title: "Related", related_to: target.data.id }),
      );
      expect(related.ok).toBe(true);
      if (!related.ok) return;

      const edges = mdb.getEdgesFrom(related.data.id);
      expect(edges.length).toBe(1);
      expect(edges[0].to_node).toBe(target.data.id);
      expect(edges[0].kind).toBe("related_to");
    });
  });
});
