import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient, type MemoryDbClient } from "../../db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../../db/memory-schema.js";
import { createSecretFilter } from "../../ingestion/secret-filter.js";
import type { EmbeddingService } from "../../ingestion/embedding.js";
import { createMemoryController } from "./memory-controller.js";
import type { ApiRequest } from "../types.js";
import type { CreateNodeSchema } from "../schemas/memory-schemas.js";

function createInMemoryDb(): Database.Database {
  const db = new Database(":memory:");
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MEMORY_MIGRATIONS);
  return db;
}

function createMockEmbeddingService(): EmbeddingService {
  return {
    async embed() {
      return { ok: true, data: new Float32Array(768) };
    },
    async embedBatch() {
      return { ok: true, data: [new Float32Array(768)] };
    },
    isReady() {
      return false;
    },
    isDegraded() {
      return false;
    },
    async warmUp() {},
  };
}

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
    const raw = createInMemoryDb();
    mdb = createMemoryDbClient(raw);
    const filter = createSecretFilter();
    const embedService = createMockEmbeddingService();
    controller = createMemoryController(mdb, embedService, filter);
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
