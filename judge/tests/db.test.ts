import { describe, expect, it } from "vitest";

import {
  findUnmappedBriefByTeammateName, findUnmappedBriefBySubagentDispatch,
  getBriefByAgentId, getBriefByToolUseId, getDecision, mapToolUseIdToAgentId, openDb,
  recordDecision, recordFailure, recordUndo, saveBrief,
} from "../src/db.js";
import { tmpDb } from "./helpers.js";

describe("openDb", () => {
  it("creates every table", () => {
    const db = openDb(":memory:");
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).toEqual(["briefs", "decisions", "failures"]);
  });

  it("sets WAL and busy_timeout on a real file", () => {
    const db = openDb(tmpDb());
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("busy_timeout", { simple: true })).toBe(2000);
  });

  it("records and retrieves a decision, round-tripping chain_position and skipped", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "d1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "claude-cli", decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 3,
      input_digest: "abc", undone_at: null, chain_position: 1,
      skipped: [{ provider: "jev", reason: "unavailable" }], outcome: "decided",
    });
    expect(getDecision(db, "d1")).toMatchObject({
      id: "d1", decision: "send", chain_position: 1,
      skipped: [{ provider: "jev", reason: "unavailable" }], outcome: "decided",
    });
  });

  it("round-trips an empty skipped array and chain_position 0 for a pre-rule", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "d1b", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0,
      input_digest: "abc", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    expect(getDecision(db, "d1b")).toMatchObject({ chain_position: 0, skipped: [] });
  });

  it("records and retrieves an escalated row with a null decision and no provider attempt", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "esc1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "none", decision: null, confidence: 0, reason_code: "question-disabled", latency_ms: 0,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "escalated",
    });
    expect(getDecision(db, "esc1")).toMatchObject({ decision: null, outcome: "escalated", provider: "none" });
  });

  it("records and retrieves a failed row (real provider failures/timeouts, not a clean escalation)", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "fail1", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "none", decision: null, confidence: 0, reason_code: "no-provider-decided", latency_ms: 0,
      input_digest: "x", undone_at: null, chain_position: 2,
      skipped: [{ provider: "jev", reason: "unavailable" }, { provider: "claude-cli", reason: "timeout" }],
      outcome: "failed",
    });
    expect(getDecision(db, "fail1")).toMatchObject({ decision: null, outcome: "failed" });
  });

  it("returns undefined for an unknown id", () => {
    expect(getDecision(openDb(":memory:"), "nope")).toBeUndefined();
  });

  it("records a failure row", () => {
    const db = openDb(":memory:");
    recordFailure(db, { ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", provider: "claude-cli", reason_code: "timeout" });
    expect(db.prepare("SELECT COUNT(*) as n FROM failures").get()).toEqual({ n: 1 });
  });

  it("marks a decision undone", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "d2", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "rules", decision: "batch", confidence: 0.9, reason_code: "x", latency_ms: 1,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    recordUndo(db, "d2", "2026-09-27T00:01:00.000Z");
    expect(getDecision(db, "d2")?.undone_at).toBe("2026-09-27T00:01:00.000Z");
  });

  it("recordUndo on an unknown id is a no-op", () => {
    const db = openDb(":memory:");
    expect(() => recordUndo(db, "nope", "2026-09-27T00:01:00.000Z")).not.toThrow();
  });

  it("lets two handles on the same file interleave writes without a throw or a lost row (RF-4)", async () => {
    const file = tmpDb();
    const dbA = openDb(file);
    const dbB = openDb(file);
    const writes: Array<Promise<void>> = [];
    for (let i = 0; i < 20; i++) {
      const db = i % 2 === 0 ? dbA : dbB;
      writes.push(
        Promise.resolve().then(() => {
          recordDecision(db, {
            id: `row-${i}`, ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta",
            provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 0,
            input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
          });
        }),
      );
    }
    await expect(Promise.all(writes)).resolves.not.toThrow();
    const count = dbA.prepare("SELECT COUNT(*) as n FROM decisions").get() as { n: number };
    expect(count.n).toBe(20);
    dbA.close();
    dbB.close();
  });
});

describe("brief store", () => {
  it("saves a brief and retrieves it by tool_use_id before any agent_id mapping exists", () => {
    const db = openDb(":memory:");
    saveBrief(db, { toolUseId: "tu1", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "add X", acceptanceCriteria: "tests pass", proofCommand: "npm test", savedAt: "2026-09-27T00:00:00.000Z" });
    expect(getBriefByToolUseId(db, "tu1")).toMatchObject({ goal: "add X", agentId: null });
  });

  it("maps tool_use_id to agent_id, after which the brief is retrievable by agent_id too", () => {
    const db = openDb(":memory:");
    saveBrief(db, { toolUseId: "tu1", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "add X", acceptanceCriteria: "tests pass", proofCommand: "npm test", savedAt: "2026-09-27T00:00:00.000Z" });
    mapToolUseIdToAgentId(db, "tu1", "agent-42");
    expect(getBriefByAgentId(db, "agent-42")).toMatchObject({ goal: "add X" });
  });

  it("returns undefined for an unknown tool_use_id or agent_id", () => {
    const db = openDb(":memory:");
    expect(getBriefByToolUseId(db, "nope")).toBeUndefined();
    expect(getBriefByAgentId(db, "nope")).toBeUndefined();
  });

  it("mapping an unknown tool_use_id is a no-op, not a throw", () => {
    const db = openDb(":memory:");
    expect(() => mapToolUseIdToAgentId(db, "nope", "agent-1")).not.toThrow();
  });

  it("finds the oldest unmapped brief by teammate name (exact match, Probe gate item 1 case 1)", () => {
    const db = openDb(":memory:");
    saveBrief(db, { toolUseId: "tu1", sessionId: "s1", promptId: "p1", dispatchName: "builder-a", subagentType: "general-purpose", goal: "first", acceptanceCriteria: "x", proofCommand: "x", savedAt: "2026-09-27T00:00:00.000Z" });
    saveBrief(db, { toolUseId: "tu2", sessionId: "s1", promptId: "p2", dispatchName: "builder-a", subagentType: "general-purpose", goal: "second", acceptanceCriteria: "x", proofCommand: "x", savedAt: "2026-09-27T00:01:00.000Z" });
    expect(findUnmappedBriefByTeammateName(db, "builder-a")).toMatchObject({ toolUseId: "tu1", goal: "first" });
  });

  it("finds the oldest unmapped brief by (session, prompt, subagentType) for an unnamed dispatch (Probe gate item 1 case 2)", () => {
    const db = openDb(":memory:");
    saveBrief(db, { toolUseId: "tu3", sessionId: "s1", promptId: "p1", dispatchName: null, subagentType: "lean-coder", goal: "x", acceptanceCriteria: "x", proofCommand: "x", savedAt: "2026-09-27T00:00:00.000Z" });
    expect(findUnmappedBriefBySubagentDispatch(db, "s1", "p1", "lean-coder")).toMatchObject({ toolUseId: "tu3" });
    expect(findUnmappedBriefBySubagentDispatch(db, "s1", "p1", "lean-reviewer")).toBeUndefined();
  });

  it("skips an already-mapped brief when looking up either unmapped-brief finder", () => {
    const db = openDb(":memory:");
    saveBrief(db, { toolUseId: "tu4", sessionId: "s1", promptId: "p1", dispatchName: "builder-a", subagentType: "general-purpose", goal: "x", acceptanceCriteria: "x", proofCommand: "x", savedAt: "2026-09-27T00:00:00.000Z" });
    mapToolUseIdToAgentId(db, "tu4", "agent-1");
    expect(findUnmappedBriefByTeammateName(db, "builder-a")).toBeUndefined();
  });
});
