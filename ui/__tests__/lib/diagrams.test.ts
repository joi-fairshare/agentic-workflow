import { describe, it, expect } from "vitest";
import { buildDirectedGraph, buildSequenceDiagram } from "@/lib/diagrams";
import type { Message } from "@/lib/types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    conversation: "conv-1",
    sender: "alice",
    recipient: "bob",
    kind: "context",
    payload: "hello",
    meta_prompt: null,
    created_at: "2026-01-01T00:00:00Z",
    read_at: null,
    ...overrides,
  };
}

describe("buildDirectedGraph", () => {
  it("returns empty graph placeholder for no messages", () => {
    const result = buildDirectedGraph([]);
    expect(result).toBe("graph LR\n    empty[No messages]");
  });

  it("creates a single edge for one message", () => {
    const result = buildDirectedGraph([makeMessage()]);
    expect(result).toContain("graph LR");
    expect(result).toContain("alice");
    expect(result).toContain("bob");
    expect(result).toContain("context");
  });

  it("aggregates duplicate kinds on same edge", () => {
    const msgs = [makeMessage({ kind: "context" }), makeMessage({ kind: "context" })];
    const result = buildDirectedGraph(msgs);
    const matches = result.match(/context/g);
    expect(matches).toHaveLength(1);
  });

  it("shows multiple kinds on same edge", () => {
    const msgs = [makeMessage({ kind: "context" }), makeMessage({ kind: "reply" })];
    const result = buildDirectedGraph(msgs);
    expect(result).toContain("context");
    expect(result).toContain("reply");
  });

  it("sanitizes special characters in agent names", () => {
    const result = buildDirectedGraph([makeMessage({ sender: "agent@1.0", recipient: "agent#2" })]);
    expect(result).toContain("agent_1_0");
    expect(result).toContain("agent_2");
  });
});

describe("buildSequenceDiagram", () => {
  it("returns empty diagram placeholder for no messages", () => {
    const result = buildSequenceDiagram([]);
    expect(result).toBe("sequenceDiagram\n    Note over empty: No messages");
  });

  it("declares participants and shows message arrow", () => {
    const result = buildSequenceDiagram([makeMessage()]);
    expect(result).toContain("sequenceDiagram");
    expect(result).toContain("participant alice");
    expect(result).toContain("participant bob");
    expect(result).toContain("alice->>bob");
    expect(result).toContain("context");
  });

  it("truncates long payloads to 40 chars", () => {
    const longPayload = "A".repeat(50);
    const result = buildSequenceDiagram([makeMessage({ payload: longPayload })]);
    expect(result).toContain("A".repeat(40) + "...");
  });

  it("escapes double quotes in payload", () => {
    const result = buildSequenceDiagram([makeMessage({ payload: 'say "hello"' })]);
    expect(result).toContain("say 'hello'");
  });

  it("declares each participant only once", () => {
    const msgs = [
      makeMessage({ sender: "alice", recipient: "bob" }),
      makeMessage({ sender: "bob", recipient: "alice" }),
    ];
    const result = buildSequenceDiagram(msgs);
    const aliceMatches = result.match(/participant.*alice/g);
    expect(aliceMatches).toHaveLength(1);
  });
});
