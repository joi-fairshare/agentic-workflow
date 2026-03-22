// mcp-bridge/tests/memory-controller.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { createEmbeddingService } from "../src/ingestion/embedding.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import { createMemoryController } from "../src/transport/controllers/memory-controller.js";
import {
  ingestClaudeCodeSummary,
} from "../src/application/services/ingest-claude-code.js";

// ── JSONL fixture helpers ─────────────────────────────────────────────────

const makeUserLine = (
  uuid: string,
  parentUuid: string | null,
  content: string,
  timestamp = "2026-01-01T00:00:00Z",
) =>
  JSON.stringify({
    type: "user",
    uuid,
    parentUuid,
    message: { role: "user", content },
    timestamp,
    sessionId: "ctrl-session",
    cwd: "/repo",
    gitBranch: "main",
    version: "2.1.80",
    entrypoint: "cli",
  });

const makeAssistantLine = (
  uuid: string,
  parentUuid: string,
  blocks: unknown[],
  timestamp = "2026-01-01T00:00:01Z",
) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    parentUuid,
    message: { role: "assistant", content: blocks },
    timestamp,
    sessionId: "ctrl-session",
    cwd: "/repo",
    gitBranch: "main",
    version: "2.1.80",
    entrypoint: "cli",
  });

const FIXTURE_LINES = [
  makeUserLine("u1", null, "What is TypeScript?"),
  makeAssistantLine("a1", "u1", [
    { type: "text", text: "TypeScript is a typed superset of JavaScript." },
    { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/example.ts" } },
  ]),
];

const FIXTURE_CONTENT = FIXTURE_LINES.join("\n");
const FIXTURE_FILE_PATH = "/fake/path/ctrl-session.jsonl";

// ── Mock node:fs to return the JSONL fixture when the fixture path is read ──

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: string, encoding?: string) => {
      if (path === FIXTURE_FILE_PATH) {
        return FIXTURE_CONTENT;
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    },
  };
});

// ── Test setup ────────────────────────────────────────────────────────────

let mdb: MemoryDbClient;

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
});

function makeController() {
  const embedService = createEmbeddingService();
  const filter = createSecretFilter();
  return { controller: createMemoryController(mdb, embedService, filter), filter };
}

function makeReq<T extends object>(body: T) {
  return { params: undefined as never, query: undefined as never, body, requestId: "test-req" };
}

function makeParamsReq<T extends object>(params: T) {
  return { params, query: undefined as never, body: undefined as never, requestId: "test-req" };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("memory-controller ingest", () => {
  it("ingest with source=generic creates conversation + message nodes", async () => {
    const { controller } = makeController();

    const messages = [
      { role: "user", content: "Hello there" },
      { role: "assistant", content: "Hi! How can I help?" },
    ];

    const result = await controller.ingest(makeReq({
      repo: "test-repo",
      source: "generic" as const,
      session_id: "generic-sess-1",
      title: "Test Conversation",
      content: JSON.stringify(messages),
      agent: "anonymous",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.messages_ingested).toBe(2);
    expect(result.data.conversation_id).toBeTruthy();
    expect(result.data.edges_created).toBeGreaterThan(0);
    expect(result.data.skipped).toBe(0);

    // Verify nodes were actually created
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const convNodes = allNodes.filter((n) => n.kind === "conversation");
    const msgNodes = allNodes.filter((n) => n.kind === "message");
    expect(convNodes).toHaveLength(1);
    expect(msgNodes).toHaveLength(2);
  });

  it("ingest with source=bridge returns error", async () => {
    const { controller } = makeController();

    const result = await controller.ingest(makeReq({
      repo: "test-repo",
      source: "bridge" as const,
      agent: "anonymous",
    }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
    expect(result.error.statusHint).toBe(400);
  });

  it("ingest with source=generic and invalid content JSON returns error", async () => {
    const { controller } = makeController();

    const result = await controller.ingest(makeReq({
      repo: "test-repo",
      source: "generic" as const,
      session_id: "sess-bad",
      content: "not-valid-json",
      agent: "anonymous",
    }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it("ingest with source=generic missing content returns error", async () => {
    const { controller } = makeController();

    const result = await controller.ingest(makeReq({
      repo: "test-repo",
      source: "generic" as const,
      session_id: "sess-no-content",
      agent: "anonymous",
    }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it("ingest with source=git returns error", async () => {
    const { controller } = makeController();

    const result = await controller.ingest(makeReq({
      repo: "test-repo",
      source: "git" as const,
      agent: "anonymous",
    }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
  });
});

describe("memory-controller expand", () => {
  it("expand handler creates detail nodes for an unexpanded assistant turn", async () => {
    const { controller, filter } = makeController();

    // First ingest the session using the service directly (sets up data with file_path in conv metadata)
    const ingestResult = ingestClaudeCodeSummary(mdb, filter, {
      repo: "test-repo",
      sessionId: "ctrl-session",
      filePath: FIXTURE_FILE_PATH,
      lines: FIXTURE_LINES,
    });

    expect(ingestResult.ok).toBe(true);

    // Find the assistant node (it has tool_use so expand will create artifact nodes)
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const assistantNodes = allNodes.filter((n) => n.kind === "message" && n.sender === "assistant");
    expect(assistantNodes).toHaveLength(1);

    const assistantNode = assistantNodes[0];
    const metaBefore = JSON.parse(assistantNode.meta) as Record<string, unknown>;
    expect(metaBefore.expanded).toBe(false);
    expect(metaBefore.tool_use_count).toBe(1);

    // Call the expand handler
    const result = await controller.expand(makeParamsReq({ id: assistantNode.id }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.nodes_created).toBe(1); // 1 artifact (Read tool)
    expect(result.data.edges_created).toBe(1);
    expect(result.data.nodes).toHaveLength(1);
    expect(result.data.nodes[0].kind).toBe("artifact");
    expect(result.data.nodes[0].title).toBe("Read");
    expect(result.data.edges).toHaveLength(1);

    // Verify expanded flag is set
    const updated = mdb.getNode(assistantNode.id);
    const metaAfter = JSON.parse(updated!.meta) as Record<string, unknown>;
    expect(metaAfter.expanded).toBe(true);
  });

  it("expand handler returns NOT_FOUND for a nonexistent node", async () => {
    const { controller } = makeController();

    const result = await controller.expand(makeParamsReq({ id: "nonexistent-node-id" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.statusHint).toBe(404);
  });
});
