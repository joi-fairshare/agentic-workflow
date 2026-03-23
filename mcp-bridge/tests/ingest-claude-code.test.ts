// mcp-bridge/tests/ingest-claude-code.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createMemoryDbClient, type MemoryDbClient } from "../src/db/memory-client.js";
import { MEMORY_MIGRATIONS } from "../src/db/memory-schema.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import {
  ingestClaudeCodeSummary,
  expandClaudeCodeTurn,
  type ClaudeCodeSessionInput,
} from "../src/application/services/ingest-claude-code.js";

// ── Test line builders (mirrored from claude-code-parser.test.ts) ──────────

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
    sessionId: "s1",
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
    sessionId: "s1",
    cwd: "/repo",
    gitBranch: "main",
    version: "2.1.80",
    entrypoint: "cli",
  });

// ── Test setup ────────────────────────────────────────────────

let mdb: MemoryDbClient;
const filter = createSecretFilter();

beforeEach(() => {
  const raw = new Database(":memory:");
  sqliteVec.load(raw);
  raw.pragma("journal_mode = WAL");
  raw.exec(MEMORY_MIGRATIONS);
  mdb = createMemoryDbClient(raw);
});

// ── Two-turn session fixture ──────────────────────────────────

function makeTwoTurnLines(): string[] {
  return [
    makeUserLine("u1", null, "What is TypeScript?"),
    makeAssistantLine("a1", "u1", [{ type: "text", text: "TypeScript is a typed superset of JavaScript." }]),
    makeUserLine("u2", "a1", "Give an example"),
    makeAssistantLine("a2", "u2", [
      { type: "text", text: "Here is an example." },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/example.ts" } },
    ]),
  ];
}

function makeSessionInput(overrides: Partial<ClaudeCodeSessionInput> = {}): ClaudeCodeSessionInput {
  return {
    repo: "test-repo",
    sessionId: "s1",
    filePath: "/home/user/.claude/projects/proj/s1.jsonl",
    lines: makeTwoTurnLines(),
    ...overrides,
  };
}

// ── Tests: ingestClaudeCodeSummary ────────────────────────────

describe("ingestClaudeCodeSummary", () => {
  it("creates conversation node + turn nodes with correct senders and edges", () => {
    const result = ingestClaudeCodeSummary(mdb, filter, makeSessionInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2 turns × 2 nodes = 4 message nodes
    expect(result.data.messages_ingested).toBe(4);
    expect(result.data.skipped).toBe(0);
    expect(result.data.conversation_id).toBeTruthy();

    // Conversation node exists with correct source
    const conv = mdb.getNodeBySource("claude-code-session", "s1");
    expect(conv).toBeDefined();
    expect(conv!.kind).toBe("conversation");
    const convMeta = JSON.parse(conv!.meta) as Record<string, unknown>;
    expect(convMeta.session_id).toBe("s1");
    expect(convMeta.file_path).toBe("/home/user/.claude/projects/proj/s1.jsonl");

    // Message nodes
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const messages = allNodes.filter((n) => n.kind === "message");
    expect(messages).toHaveLength(4);

    const humanNodes = messages.filter((n) => n.sender === "human");
    const assistantNodes = messages.filter((n) => n.sender === "assistant");
    expect(humanNodes).toHaveLength(2);
    expect(assistantNodes).toHaveLength(2);

    // UUIDs are stored in assistant metadata
    for (const aNode of assistantNodes) {
      const meta = JSON.parse(aNode.meta) as Record<string, unknown>;
      expect(Array.isArray(meta.uuids)).toBe(true);
      expect((meta.uuids as string[]).length).toBeGreaterThan(0);
    }

    // contains edges: conversation → each message (4)
    const convEdges = mdb.getEdgesFrom(conv!.id);
    const containsEdges = convEdges.filter((e) => e.kind === "contains");
    expect(containsEdges).toHaveLength(4);
  });

  it("is idempotent — skips re-ingesting a session that already exists", () => {
    const input = makeSessionInput();

    const r1 = ingestClaudeCodeSummary(mdb, filter, input);
    expect(r1.ok).toBe(true);

    const r2 = ingestClaudeCodeSummary(mdb, filter, input);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.data.messages_ingested).toBe(0);
    expect(r2.data.skipped).toBe(1);

    // Only one conversation node created
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const convNodes = allNodes.filter((n) => n.kind === "conversation");
    expect(convNodes).toHaveLength(1);
  });

  it("sets expanded: false in all assistant turn metadata", () => {
    ingestClaudeCodeSummary(mdb, filter, makeSessionInput());

    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const assistantNodes = allNodes.filter((n) => n.kind === "message" && n.sender === "assistant");

    for (const node of assistantNodes) {
      const meta = JSON.parse(node.meta) as Record<string, unknown>;
      expect(meta.expanded).toBe(false);
    }
  });

  it("creates reply_to edges: assistant → human (same turn) and human → prev assistant", () => {
    ingestClaudeCodeSummary(mdb, filter, makeSessionInput());

    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const messages = allNodes.filter((n) => n.kind === "message");

    // Sort by turn_index then sender so we can reference them predictably
    const sorted = [...messages].sort((a, b) => {
      const ma = JSON.parse(a.meta) as { turn_index: number; sender: string };
      const mb = JSON.parse(b.meta) as { turn_index: number; sender: string };
      if (ma.turn_index !== mb.turn_index) return ma.turn_index - mb.turn_index;
      return ma.sender === "human" ? -1 : 1;
    });

    // Turn 0: human0, assistant0
    // Turn 1: human1, assistant1
    const [human0, assistant0, human1, assistant1] = sorted;

    // assistant0 → human0 (reply_to within same turn)
    const a0Edges = mdb.getEdgesFrom(assistant0.id);
    expect(a0Edges.some((e) => e.kind === "reply_to" && e.to_node === human0.id)).toBe(true);

    // human1 → assistant0 (consecutive turn)
    const h1Edges = mdb.getEdgesFrom(human1.id);
    expect(h1Edges.some((e) => e.kind === "reply_to" && e.to_node === assistant0.id)).toBe(true);

    // assistant1 → human1 (reply_to within same turn)
    const a1Edges = mdb.getEdgesFrom(assistant1.id);
    expect(a1Edges.some((e) => e.kind === "reply_to" && e.to_node === human1.id)).toBe(true);
  });

  it("applies secret filter to all content", () => {
    const secretLines = [
      makeUserLine("u1", null, "My AWS key is AKIAIOSFODNN7EXAMPLE"),
      makeAssistantLine("a1", "u1", [{ type: "text", text: "Got it AKIAIOSFODNN7EXAMPLE" }]),
    ];

    ingestClaudeCodeSummary(mdb, filter, makeSessionInput({ lines: secretLines }));

    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    for (const node of allNodes) {
      expect(node.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(node.title).not.toContain("AKIAIOSFODNN7EXAMPLE");
    }
  });
});

// ── Tests: expandClaudeCodeTurn ────────────────────────────────

describe("expandClaudeCodeTurn", () => {
  function ingestAndGetAssistantNode(lines: string[], turnIndex = 0) {
    ingestClaudeCodeSummary(mdb, filter, makeSessionInput({ lines }));
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const assistantNodes = allNodes
      .filter((n) => n.kind === "message" && n.sender === "assistant")
      .sort((a, b) => {
        const ma = JSON.parse(a.meta) as { turn_index: number };
        const mb = JSON.parse(b.meta) as { turn_index: number };
        return ma.turn_index - mb.turn_index;
      });
    return assistantNodes[turnIndex];
  }

  it("creates artifact nodes for tool_use and task nodes for Agent tool", () => {
    const lines = [
      makeUserLine("u1", null, "Do some work"),
      makeAssistantLine("a1", "u1", [
        { type: "text", text: "Sure." },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } },
        { type: "tool_use", id: "t2", name: "Agent", input: { subagent_type: "Explore", description: "Map codebase", prompt: "Find all files" } },
      ]),
    ];

    const assistantNode = ingestAndGetAssistantNode(lines, 0);
    expect(assistantNode).toBeDefined();

    const result = expandClaudeCodeTurn(mdb, filter, assistantNode.id, lines);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.nodes_created).toBe(2); // 1 artifact + 1 task
    expect(result.data.edges_created).toBe(2);
    expect(result.data.already_expanded).toBe(false);

    // Verify node kinds
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const artifacts = allNodes.filter((n) => n.kind === "artifact");
    const tasks = allNodes.filter((n) => n.kind === "task");
    expect(artifacts).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(artifacts[0].title).toBe("Read");
    expect(tasks[0].title).toBe("Map codebase");

    // Artifact edges from assistant node
    const edges = mdb.getEdgesFrom(assistantNode.id);
    const containsEdges = edges.filter((e) => e.kind === "contains");
    expect(containsEdges).toHaveLength(2);
  });

  it("sets expanded: true in turn metadata after expansion", () => {
    const lines = [
      makeUserLine("u1", null, "Do work"),
      makeAssistantLine("a1", "u1", [
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
      ]),
    ];

    const assistantNode = ingestAndGetAssistantNode(lines, 0);
    expandClaudeCodeTurn(mdb, filter, assistantNode.id, lines);

    // Re-read the node from DB
    const updated = mdb.getNode(assistantNode.id);
    expect(updated).toBeDefined();
    const meta = JSON.parse(updated!.meta) as Record<string, unknown>;
    expect(meta.expanded).toBe(true);
  });

  it("is a no-op when already expanded", () => {
    const lines = [
      makeUserLine("u1", null, "Do work"),
      makeAssistantLine("a1", "u1", [
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
      ]),
    ];

    const assistantNode = ingestAndGetAssistantNode(lines, 0);

    // Expand once
    expandClaudeCodeTurn(mdb, filter, assistantNode.id, lines);

    // Expand again
    const result = expandClaudeCodeTurn(mdb, filter, assistantNode.id, lines);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.already_expanded).toBe(true);
    expect(result.data.nodes_created).toBe(0);

    // Only 1 artifact was created (not duplicated)
    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const artifacts = allNodes.filter((n) => n.kind === "artifact");
    expect(artifacts).toHaveLength(1);
  });

  it("returns NOT_FOUND when turnNodeId does not exist", () => {
    const result = expandClaudeCodeTurn(mdb, filter, "nonexistent-id", []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("applies secret filter to tool input bodies", () => {
    const lines = [
      makeUserLine("u1", null, "Run command"),
      makeAssistantLine("a1", "u1", [
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo AKIAIOSFODNN7EXAMPLE" } },
      ]),
    ];

    const assistantNode = ingestAndGetAssistantNode(lines, 0);
    expandClaudeCodeTurn(mdb, filter, assistantNode.id, lines);

    const allNodes = mdb.getNodesByRepo("test-repo", 100, 0);
    const artifacts = allNodes.filter((n) => n.kind === "artifact");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].body).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(artifacts[0].body).toContain("[REDACTED]");
  });
});
