import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createDbClient, type DbClient } from "../src/db/client.js";
import { MIGRATIONS } from "../src/db/schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import type { EmbeddingService } from "../src/ingestion/embedding.js";
import { sendContext } from "../src/application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../src/application/services/get-messages.js";
import { assignTask } from "../src/application/services/assign-task.js";
import { reportStatus } from "../src/application/services/report-status.js";
import { searchMemory } from "../src/application/services/search-memory.js";
import { traverseMemory } from "../src/application/services/traverse-memory.js";
import { assembleContext } from "../src/application/services/assemble-context.js";
import { randomUUID } from "node:crypto";

// Mirrors the resultToContent helper from mcp.ts
function resultToContent<T>(result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }) {
  if (result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text" as const, text: `Error [${result.error.code}]: ${result.error.message}` }],
    isError: true,
  };
}

function createMockEmbedding(): EmbeddingService {
  return {
    async embed() { return { ok: true, data: new Float32Array(768) }; },
    async embedBatch() { return { ok: true, data: [new Float32Array(768)] }; },
    isReady() { return false; },
    isDegraded() { return false; },
    async warmUp() {},
  };
}

let db: DbClient;
let mdb: MemoryDbClient;
let embedService: EmbeddingService;

beforeEach(() => {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.exec(MIGRATIONS);
  db = createDbClient(raw);

  const memRaw = new Database(":memory:");
  sqliteVec.load(memRaw);
  memRaw.pragma("journal_mode = WAL");
  memRaw.pragma("busy_timeout = 5000");
  memRaw.pragma("foreign_keys = ON");
  memRaw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(memRaw);

  embedService = createMockEmbedding();
});

describe("resultToContent", () => {
  it("formats success result as JSON text", () => {
    const result = resultToContent({ ok: true as const, data: { id: "123" } });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "123" });
    expect(result).not.toHaveProperty("isError");
  });

  it("formats error result with code and message", () => {
    const result = resultToContent({ ok: false as const, error: { code: "NOT_FOUND", message: "Gone" } });
    expect(result.content[0].text).toBe("Error [NOT_FOUND]: Gone");
    expect(result.isError).toBe(true);
  });
});

describe("send_context tool", () => {
  it("creates a message via sendContext service", () => {
    const conv = randomUUID();
    const result = sendContext(db, { conversation: conv, sender: "claude", recipient: "codex", payload: "hello" });
    const content = resultToContent(result);

    expect(content).not.toHaveProperty("isError");
    const data = JSON.parse(content.content[0].text);
    expect(data.conversation).toBe(conv);
  });
});

describe("get_messages tool", () => {
  it("retrieves messages for a conversation", () => {
    const conv = randomUUID();
    sendContext(db, { conversation: conv, sender: "a", recipient: "b", payload: "msg" });

    const result = getMessagesByConversation(db, conv);
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);
  });
});

describe("get_unread tool", () => {
  it("returns unread and marks them read", () => {
    sendContext(db, { conversation: randomUUID(), sender: "a", recipient: "bob", payload: "msg" });

    const result = getUnreadMessages(db, "bob");
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data).toHaveLength(1);

    // Second call returns empty
    const result2 = getUnreadMessages(db, "bob");
    const data2 = JSON.parse(resultToContent(result2).content[0].text);
    expect(data2).toHaveLength(0);
  });
});

describe("assign_task tool", () => {
  it("creates a task", () => {
    const conv = randomUUID();
    const result = assignTask(db, { conversation: conv, domain: "backend", summary: "Fix", details: "Details" });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.status).toBe("pending");
  });
});

describe("report_status tool", () => {
  it("updates task status", () => {
    const conv = randomUUID();
    const taskResult = assignTask(db, { conversation: conv, domain: "x", summary: "s", details: "d" });
    if (!taskResult.ok) return;

    const result = reportStatus(db, {
      conversation: conv, sender: "codex", recipient: "claude",
      task_id: taskResult.data.id, status: "completed", payload: "Done",
    });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.task_updated).toBe(true);
  });
});

describe("search_memory tool", () => {
  it("returns results for keyword search", async () => {
    mdb.insertNode({ repo: "test", kind: "topic", title: "Searchable", body: "content", meta: "{}", source_id: "s1", source_type: "manual" });
    const result = await searchMemory(mdb, embedService, { query: "Searchable", repo: "test", mode: "keyword" });
    const content = resultToContent(result);
    expect(content).not.toHaveProperty("isError");
  });
});

describe("traverse_memory tool", () => {
  it("traverses from a node", () => {
    const node = mdb.insertNode({ repo: "test", kind: "topic", title: "Root", body: "", meta: "{}", source_id: "s1", source_type: "manual" });
    const result = traverseMemory(mdb, { node_id: node.id });
    const content = resultToContent(result);
    const data = JSON.parse(content.content[0].text);
    expect(data.root).toBe(node.id);
  });
});

describe("get_context tool", () => {
  it("assembles context", async () => {
    const result = await assembleContext(mdb, embedService, { repo: "test", query: "test" });
    const content = resultToContent(result);
    expect(content).not.toHaveProperty("isError");
  });
});

describe("create_memory_node tool", () => {
  it("creates a node with secret filtering", () => {
    const filter = createSecretFilter();
    // Use a pattern matching the sk- key pattern (requires 20+ alphanumeric chars after sk-)
    const title = filter.redact("My API Key sk-abc123def456789012345");
    const node = mdb.insertNode({
      repo: "test", kind: "topic", title, body: "", meta: "{}",
      source_id: randomUUID(), source_type: "manual",
    });
    expect(node.title).not.toContain("sk-abc123def456789012345");
  });
});

describe("create_memory_link tool", () => {
  it("creates an edge between nodes", () => {
    const n1 = mdb.insertNode({ repo: "test", kind: "topic", title: "A", body: "", meta: "{}", source_id: "s1", source_type: "manual" });
    const n2 = mdb.insertNode({ repo: "test", kind: "topic", title: "B", body: "", meta: "{}", source_id: "s2", source_type: "manual" });

    const edge = mdb.insertEdge({
      repo: "test", from_node: n1.id, to_node: n2.id,
      kind: "related_to", weight: 1.0, meta: "{}", auto: false,
    });
    expect(edge.from_node).toBe(n1.id);
    expect(edge.to_node).toBe(n2.id);
  });
});
