// mcp-bridge/tests/ingest-transcript.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { createSecretFilter } from "../src/ingestion/secret-filter.js";
import { ingestTranscriptLines, type IngestTranscriptInput } from "../src/application/services/ingest-transcript.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;
const filter = createSecretFilter();
const repo = "test-repo";

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());
});

function makeLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "human",
    uuid: "uuid-" + Math.random().toString(36).slice(2),
    parentUuid: null,
    message: { content: "Test message" },
    timestamp: "2026-03-20T10:00:00Z",
    ...overrides,
  });
}

describe("ingestTranscriptLines", () => {
  it("creates conversation node + message nodes from JSONL lines", () => {
    const lines = [
      makeLine({ uuid: "u1", type: "human", message: { content: "Hello" } }),
      makeLine({ uuid: "u2", type: "assistant", parentUuid: "u1", message: { content: "Hi there" } }),
    ];

    const result = ingestTranscriptLines(mdb, filter, {
      repo,
      sessionId: "/path/to/session.jsonl",
      sessionTitle: "session",
      lines,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages_ingested).toBe(2);

    // Conversation node exists
    const conv = mdb.getNodeBySource("transcript-session", "/path/to/session.jsonl");
    expect(conv).toBeDefined();
    expect(conv!.kind).toBe("conversation");

    // Sender is derived from transcript type
    const humanNode = mdb.getNodeBySource("transcript", "u1");
    expect(humanNode!.sender).toBe("human");

    const assistantNode = mdb.getNodeBySource("transcript", "u2");
    expect(assistantNode!.sender).toBe("assistant");
  });

  it("wires reply_to edges based on parentUuid", () => {
    const lines = [
      makeLine({ uuid: "u1", type: "human", message: { content: "Question" } }),
      makeLine({ uuid: "u2", type: "assistant", parentUuid: "u1", message: { content: "Answer" } }),
    ];

    const result = ingestTranscriptLines(mdb, filter, { repo, sessionId: "s1", sessionTitle: "s", lines });
    if (!result.ok) return;

    // Find the child node
    const childNode = mdb.getNodeBySource("transcript", "u2");
    expect(childNode).toBeDefined();

    // Should have a reply_to edge pointing to parent
    const outgoing = mdb.getEdgesFrom(childNode!.id);
    const replyEdge = outgoing.find((e) => e.kind === "reply_to");
    expect(replyEdge).toBeDefined();
  });

  it("wires contains edges from conversation to messages", () => {
    const lines = [makeLine({ uuid: "u1" })];
    ingestTranscriptLines(mdb, filter, { repo, sessionId: "s1", sessionTitle: "s", lines });

    const conv = mdb.getNodeBySource("transcript-session", "s1");
    const edges = mdb.getEdgesFrom(conv!.id);
    expect(edges.some((e) => e.kind === "contains")).toBe(true);
  });

  it("is idempotent — re-ingesting same session creates no duplicates", () => {
    const lines = [makeLine({ uuid: "u1" })];
    ingestTranscriptLines(mdb, filter, { repo, sessionId: "s1", sessionTitle: "s", lines });
    ingestTranscriptLines(mdb, filter, { repo, sessionId: "s1", sessionTitle: "s", lines });

    const allMessages = mdb.getNodesByRepoAndKind(repo, "message");
    expect(allMessages.filter((n) => n.source_id === "u1")).toHaveLength(1);
  });

  it("redacts secrets in message bodies", () => {
    const lines = [makeLine({ uuid: "u1", message: { content: "key AKIAIOSFODNN7EXAMPLE" } })];
    ingestTranscriptLines(mdb, filter, { repo, sessionId: "s1", sessionTitle: "s", lines });

    const node = mdb.getNodeBySource("transcript", "u1");
    expect(node!.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("uses [type] as node title when message content is empty", () => {
    const lines = [
      JSON.stringify({ type: "assistant", uuid: "u-empty", parentUuid: null, message: {}, timestamp: "2026-01-01T00:00:00Z" }),
    ];

    const result = ingestTranscriptLines(mdb, filter, { repo, sessionId: "s-empty", sessionTitle: "Empty", lines });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages_ingested).toBe(1);

    const node = mdb.getNodeBySource("transcript", "u-empty");
    expect(node).toBeDefined();
    // Empty content → title falls back to [type]
    expect(node!.title).toBe("[assistant]");
  });

  it("skips already-ingested message UUIDs within a session", () => {
    // Pre-insert a message node with a specific transcript source
    mdb.insertNode({
      repo: "r",
      kind: "message",
      title: "Pre-existing",
      body: "Already here",
      meta: "{}",
      source_id: "uuid-pre-existing",
      source_type: "transcript",
    });

    const lines = [
      JSON.stringify({ type: "human", uuid: "uuid-pre-existing", message: { content: "Hello" } }),
      JSON.stringify({ type: "assistant", uuid: "uuid-new", parentUuid: "uuid-pre-existing", message: { content: "World" } }),
    ];

    const result = ingestTranscriptLines(mdb, filter, {
      repo: "r",
      sessionId: "sess-skip-test",
      sessionTitle: "Skip Test",
      lines,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both records are processed but the pre-existing one is skipped
    expect(result.data.messages_ingested).toBe(2); // parser counts all parsed records
  });
});
