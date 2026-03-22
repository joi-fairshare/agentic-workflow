import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient } from "../../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../../src/db/memory-schema.js";
import { createSecretFilter } from "../../src/ingestion/secret-filter.js";
import type { EmbeddingService } from "../../src/ingestion/embedding.js";
import { createMemoryRoutes } from "../../src/routes/memory.js";
import { createServer } from "../../src/server.js";
import type { FastifyInstance } from "fastify";

function createMockEmbeddingService(): EmbeddingService {
  return {
    async embed() { return { ok: true, data: new Float32Array(768) }; },
    async embedBatch() { return { ok: true, data: [new Float32Array(768)] }; },
    isReady() { return false; },
    isDegraded() { return false; },
    async warmUp() {},
  };
}

let app: FastifyInstance;
let mdb: ReturnType<typeof createMemoryDbClient>;

beforeEach(async () => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.pragma("busy_timeout = 5000");
  raw.pragma("foreign_keys = ON");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
  const filter = createSecretFilter();
  const embedService = createMockEmbeddingService();
  const memoryRoutes = createMemoryRoutes(mdb, embedService, filter);
  app = createServer([memoryRoutes]);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /memory/stats", () => {
  it("returns 200 with zero counts for empty db", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/memory/stats?repo=test",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.node_count).toBe(0);
    expect(body.data.edge_count).toBe(0);
  });
});

describe("POST /memory/node", () => {
  it("returns 201 with created node", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/node",
      payload: { repo: "test", kind: "topic", title: "Test Topic", body: "Body" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe("topic");
    expect(body.data.title).toBe("Test Topic");
  });
});

describe("GET /memory/node/:id", () => {
  it("returns 200 with node", async () => {
    const node = mdb.insertNode({ repo: "test", kind: "topic", title: "T", body: "B", meta: "{}", source_id: "s1", source_type: "manual" });
    const res = await app.inject({
      method: "GET",
      url: `/memory/node/${node.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(node.id);
  });

  it("returns 404 for non-existent node", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/memory/node/nonexistent-id",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /memory/link", () => {
  it("returns 201 with created edge", async () => {
    const n1 = mdb.insertNode({ repo: "test", kind: "topic", title: "A", body: "", meta: "{}", source_id: "s1", source_type: "manual" });
    const n2 = mdb.insertNode({ repo: "test", kind: "topic", title: "B", body: "", meta: "{}", source_id: "s2", source_type: "manual" });

    const res = await app.inject({
      method: "POST",
      url: "/memory/link",
      payload: { from_node: n1.id, to_node: n2.id, kind: "related_to" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ok).toBe(true);
  });

  it("returns 404 when from_node does not exist", async () => {
    const n2 = mdb.insertNode({ repo: "test", kind: "topic", title: "B", body: "", meta: "{}", source_id: "s2", source_type: "manual" });
    const res = await app.inject({
      method: "POST",
      url: "/memory/link",
      payload: { from_node: "nonexistent", to_node: n2.id, kind: "related_to" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /memory/node/:id/edges", () => {
  it("returns edges for a node", async () => {
    const n1 = mdb.insertNode({ repo: "test", kind: "topic", title: "A", body: "", meta: "{}", source_id: "s1", source_type: "manual" });
    const n2 = mdb.insertNode({ repo: "test", kind: "topic", title: "B", body: "", meta: "{}", source_id: "s2", source_type: "manual" });
    mdb.insertEdge({ repo: "test", from_node: n1.id, to_node: n2.id, kind: "related_to", weight: 1.0, meta: "{}", auto: false });

    const res = await app.inject({
      method: "GET",
      url: `/memory/node/${n1.id}/edges`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe("GET /memory/topics", () => {
  it("returns topic nodes for a repo", async () => {
    mdb.insertNode({ repo: "test", kind: "topic", title: "T1", body: "", meta: "{}", source_id: "s1", source_type: "manual" });
    mdb.insertNode({ repo: "test", kind: "decision", title: "D1", body: "", meta: "{}", source_id: "s2", source_type: "manual" });

    const res = await app.inject({
      method: "GET",
      url: "/memory/topics?repo=test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe("GET /memory/search", () => {
  it("returns 503 when embedding not ready and semantic mode requested", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/memory/search?query=test&repo=test&mode=semantic",
    });
    expect(res.statusCode).toBe(503);
  });

  it("returns results for keyword search", async () => {
    mdb.insertNode({ repo: "test", kind: "topic", title: "Test Topic", body: "body text", meta: "{}", source_id: "s1", source_type: "manual" });

    const res = await app.inject({
      method: "GET",
      url: "/memory/search?query=Test&repo=test&mode=keyword",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe("POST /memory/ingest", () => {
  it("returns 201 with ingested count", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/ingest",
      payload: { source: "bridge", repo: "test" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.ingested).toBe(0);
  });
});

describe("GET /memory/traverse/:id", () => {
  it("returns traversal result for a node", async () => {
    const node = mdb.insertNode({ repo: "test", kind: "topic", title: "Root", body: "", meta: "{}", source_id: "s1", source_type: "manual" });

    const res = await app.inject({
      method: "GET",
      url: `/memory/traverse/${node.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.root).toBe(node.id);
  });
});

describe("GET /memory/context", () => {
  it("returns context response", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/memory/context?query=test&repo=test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
