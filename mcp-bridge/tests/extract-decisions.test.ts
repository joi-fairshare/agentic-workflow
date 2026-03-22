// mcp-bridge/tests/extract-decisions.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { type MemoryDbClient } from "../src/db/memory-client.js";
import { extractDecisions } from "../src/application/services/extract-decisions.js";
import { createTestMemoryDb } from "./helpers.js";

let mdb: MemoryDbClient;

beforeEach(() => {
  ({ mdb } = createTestMemoryDb());
});

// ── Helpers ──────────────────────────────────────────────────

function insertConversation(title = "Test conversation", idx = 1) {
  return mdb.insertNode({
    repo: "test",
    kind: "conversation",
    title,
    body: "",
    meta: "{}",
    source_id: `conv-${idx}`,
    source_type: "bridge",
  });
}

function insertMessage(body: string, idx = 1) {
  return mdb.insertNode({
    repo: "test",
    kind: "message",
    title: "Message about decisions",
    body,
    meta: "{}",
    source_id: `msg-${idx}`,
    source_type: "bridge",
  });
}

function linkMessageToConversation(convId: string, msgId: string) {
  mdb.insertEdge({
    repo: "test",
    from_node: convId,
    to_node: msgId,
    kind: "contains",
    weight: 1.0,
    meta: "{}",
    auto: true,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("extractDecisions", () => {
  it("extracts 'we decided to use Zod for validation' as a decision node", () => {
    const conv = insertConversation();
    const msg = insertMessage(
      "We decided to use Zod for validation because it integrates well with TypeScript",
      1,
    );
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.decisions_created).toBeGreaterThanOrEqual(1);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const titles = decisions.map((d) => d.title.toLowerCase());
    expect(titles.some((t) => t.includes("zod"))).toBe(true);
  });

  it("extracts 'going with Fastify over Express' as a decision node", () => {
    const conv = insertConversation();
    const msg = insertMessage(
      "After evaluation, going with Fastify over Express for the HTTP layer",
      1,
    );
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.decisions_created).toBeGreaterThanOrEqual(1);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const titles = decisions.map((d) => d.title.toLowerCase());
    expect(titles.some((t) => t.includes("fastify"))).toBe(true);
  });

  it("creates decided_in edge from decision node to the containing conversation", () => {
    const conv = insertConversation();
    const msg = insertMessage(
      "We decided to use TypeScript strict mode for better type safety",
      1,
    );
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.edges_created).toBeGreaterThanOrEqual(1);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions.length).toBeGreaterThanOrEqual(1);

    // Each decision should have a decided_in edge pointing to the conversation
    for (const decision of decisions) {
      const edges = mdb.getEdgesFrom(decision.id);
      const decidedInEdge = edges.find((e) => e.kind === "decided_in");
      expect(decidedInEdge).toBeDefined();
      expect(decidedInEdge?.to_node).toBe(conv.id);
    }
  });

  it("does not create duplicate decisions for the same text in the same conversation", () => {
    const conv = insertConversation();
    // Two messages that produce identical captured text for the same decision
    const msg1 = insertMessage(
      "We decided to use Zod for validation.",
      1,
    );
    const msg2 = insertMessage(
      "As mentioned, we decided to use Zod for validation.",
      2,
    );
    linkMessageToConversation(conv.id, msg1.id);
    linkMessageToConversation(conv.id, msg2.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should only create 1 unique decision for "use Zod for validation" in this conversation
    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    const zodDecisions = decisions.filter((d) =>
      d.title.toLowerCase().includes("zod"),
    );
    expect(zodDecisions.length).toBe(1);
  });

  it("ignores messages with no decision patterns", () => {
    const conv = insertConversation();
    const msg = insertMessage(
      "Today we discussed the weather and had coffee. Nothing was decided.",
      1,
    );
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.decisions_created).toBe(0);
    expect(result.data.edges_created).toBe(0);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions).toHaveLength(0);
  });

  it("handles messages not contained in any conversation — creates decision node but no edge", () => {
    // Message with NO contains edge from any conversation
    insertMessage(
      "We decided to use SQLite for the database layer",
      1,
    );

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Decision node should still be created
    expect(result.data.decisions_created).toBeGreaterThanOrEqual(1);
    // But no edge can be created without a conversation
    expect(result.data.edges_created).toBe(0);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    // No outgoing edges from decision nodes
    for (const decision of decisions) {
      const edges = mdb.getEdgesFrom(decision.id);
      expect(edges).toHaveLength(0);
    }
  });

  it("handles empty repo with no messages", () => {
    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.decisions_created).toBe(0);
    expect(result.data.edges_created).toBe(0);
  });

  it("does not create duplicate decisions across different conversations", () => {
    // Same decision text in two different conversations → should create 2 decisions
    const conv1 = insertConversation("Conversation 1", 1);
    const conv2 = insertConversation("Conversation 2", 2);
    const msg1 = insertMessage("We decided to use Zod for validation in our API layer", 1);
    const msg2 = insertMessage("We decided to use Zod for validation for form inputs as well", 2);
    linkMessageToConversation(conv1.id, msg1.id);
    linkMessageToConversation(conv2.id, msg2.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Same title text in different conversations counts as different decisions
    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    const zodDecisions = decisions.filter((d) =>
      d.title.toLowerCase().includes("zod"),
    );
    expect(zodDecisions.length).toBe(2);
    expect(result.data.edges_created).toBe(2);
  });

  it("returns correct counts for multiple decisions in one message", () => {
    const conv = insertConversation();
    // Message with two distinct decision patterns
    const msg = insertMessage(
      "We decided to use Zod for validation. Also, let's go with Fastify over Express for HTTP.",
      1,
    );
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.decisions_created).toBeGreaterThanOrEqual(2);
    expect(result.data.edges_created).toBeGreaterThanOrEqual(2);
  });

  it("only processes messages from the specified repo", () => {
    // Insert a message in a different repo
    mdb.insertNode({
      repo: "other-repo",
      kind: "message",
      title: "Other repo message",
      body: "We decided to use PostgreSQL for the main database",
      meta: "{}",
      source_id: "msg-other",
      source_type: "bridge",
    });

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should not pick up messages from other-repo
    expect(result.data.decisions_created).toBe(0);

    const decisions = mdb.getNodesByRepoAndKind("test", "decision");
    expect(decisions).toHaveLength(0);
  });

  it("skips message nodes with empty body", () => {
    const conv = insertConversation();
    const msg = insertMessage("", 1);
    linkMessageToConversation(conv.id, msg.id);

    const result = extractDecisions(mdb, { repo: "test" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decisions_created).toBe(0);
  });


  it("counts but does not duplicate already-extracted decisions", () => {
    // Create a conversation and message with a decision pattern
    const convNode = mdb.insertNode({ repo: "r", kind: "conversation", title: "Conv", body: "", meta: "{}", source_id: "conv-dedup", source_type: "test" });
    const msgNode = mdb.insertNode({ repo: "r", kind: "message", title: "Msg", body: "We decided to use PostgreSQL for the database", meta: "{}", source_id: "msg-dedup", source_type: "test" });
    mdb.insertEdge({ repo: "r", from_node: convNode.id, to_node: msgNode.id, kind: "contains", weight: 1.0, meta: "{}", auto: true });

    // First extraction
    const r1 = extractDecisions(mdb, { repo: "r" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const firstCount = r1.data.decisions_created;
    expect(firstCount).toBeGreaterThan(0);

    // Second extraction — should find existing and count it without duplicating
    const r2 = extractDecisions(mdb, { repo: "r" });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.decisions_created).toBe(firstCount);
  });
});
