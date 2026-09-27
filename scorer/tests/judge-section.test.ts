import { describe, expect, it } from "vitest";

import { openDb, recordDecision, recordFailure, recordUndo } from "../../judge/src/db.js";
import { judgeSection, renderJudgeSection } from "../src/judge-section.js";

describe("judgeSection", () => {
  it("aggregates decisions, undos, failures, real fallbacks (from skipped, not failures), and p95 latency per question", () => {
    const db = openDb(":memory:");
    const ts = "2026-09-27T00:00:00.000Z";
    for (const [i, latency] of [10, 20, 30, 40].entries()) {
      recordDecision(db, {
        id: `d${i}`, ts, question: "wake-gate", content_class: "message-meta", provider: "claude-cli",
        decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: latency, input_digest: "x",
        undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
      });
    }
    recordDecision(db, {
      id: "d4", ts, question: "wake-gate", content_class: "message-meta", provider: "claude-cli",
      decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 100, input_digest: "x",
      undone_at: null, chain_position: 1, skipped: [{ provider: "jev", reason: "failed" }], outcome: "decided",
    });
    recordUndo(db, "d0", ts);
    recordFailure(db, { ts, question: "wake-gate", provider: "jev", reason_code: "unparseable-result" });

    const rows = judgeSection(db, "2026-09-26T00:00:00.000Z");
    expect(rows).toEqual([
      { question: "wake-gate", decisions: 5, undos: 1, errorRate: 0.2, failures: 1, fallbacks: 1, p95LatencyMs: 100, escalations: 0 },
    ]);
  });

  it("counts a fallback whenever a decision's skipped array is non-empty, independent of the failures table", () => {
    const db = openDb(":memory:");
    const ts = "2026-09-27T00:00:00.000Z";
    recordDecision(db, {
      id: "d0", ts, question: "wake-gate", content_class: "message-meta", provider: "claude-cli",
      decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 50, input_digest: "x",
      undone_at: null, chain_position: 1, skipped: [{ provider: "jev", reason: "unavailable" }], outcome: "decided",
    });
    const rows = judgeSection(db, "2026-09-26T00:00:00.000Z");
    expect(rows).toEqual([
      { question: "wake-gate", decisions: 1, undos: 0, errorRate: 0, failures: 0, fallbacks: 1, p95LatencyMs: 50, escalations: 0 },
    ]);
  });

  it("counts escalated and failed outcomes separately from decided rows, and excludes them from decisions/latency/undo/fallback stats", () => {
    const db = openDb(":memory:");
    const ts = "2026-09-27T00:00:00.000Z";
    recordDecision(db, {
      id: "d0", ts, question: "wake-gate", content_class: "message-meta", provider: "claude-cli",
      decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 50, input_digest: "x",
      undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    recordDecision(db, {
      id: "esc0", ts, question: "wake-gate", content_class: "message-meta", provider: "none",
      decision: null, confidence: 0, reason_code: "question-disabled", latency_ms: 0, input_digest: "x",
      undone_at: null, chain_position: 0, skipped: [], outcome: "escalated",
    });
    recordDecision(db, {
      id: "fail0", ts, question: "wake-gate", content_class: "message-meta", provider: "none",
      decision: null, confidence: 0, reason_code: "no-provider-decided", latency_ms: 0, input_digest: "x",
      undone_at: null, chain_position: 2,
      skipped: [{ provider: "jev", reason: "unavailable" }, { provider: "claude-cli", reason: "timeout" }],
      outcome: "failed",
    });
    const rows = judgeSection(db, "2026-09-26T00:00:00.000Z");
    expect(rows).toEqual([
      { question: "wake-gate", decisions: 1, undos: 0, errorRate: 0, failures: 0, fallbacks: 0, p95LatencyMs: 50, escalations: 2 },
    ]);
  });

  it("lists a question that has only escalated/failed rows (no decided row yet)", () => {
    const db = openDb(":memory:");
    recordDecision(db, {
      id: "esc0", ts: "2026-09-27T00:00:00.000Z", question: "wake-gate", content_class: "message-meta", provider: "none",
      decision: null, confidence: 0, reason_code: "question-disabled", latency_ms: 0, input_digest: "x",
      undone_at: null, chain_position: 0, skipped: [], outcome: "escalated",
    });
    const rows = judgeSection(db, "2026-09-26T00:00:00.000Z");
    expect(rows).toEqual([
      { question: "wake-gate", decisions: 0, undos: 0, errorRate: 0, failures: 0, fallbacks: 0, p95LatencyMs: 0, escalations: 1 },
    ]);
  });

  it("excludes decisions before the since timestamp", () => {
    const db = openDb(":memory:");
    recordDecision(db, { id: "old", ts: "2020-01-01T00:00:00.000Z", question: "wake-gate", content_class: "message-meta", provider: "rules", decision: "drop", confidence: 1, reason_code: "pre-rule", latency_ms: 1, input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided" });
    expect(judgeSection(db, "2026-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("returns an empty array, not an error, with no data at all", () => {
    expect(judgeSection(openDb(":memory:"), "2026-01-01T00:00:00.000Z")).toEqual([]);
  });
});

describe("renderJudgeSection", () => {
  it("renders a markdown table with the section leading with Judge", () => {
    const md = renderJudgeSection([{ question: "wake-gate", decisions: 5, undos: 1, errorRate: 0.2, failures: 1, fallbacks: 1, p95LatencyMs: 100, escalations: 0 }]);
    expect(md.startsWith("## Judge")).toBe(true);
    expect(md).toContain("wake-gate");
    expect(md).toContain("100");
  });

  it("renders a placeholder line with no rows", () => {
    expect(renderJudgeSection([])).toBe("## Judge\n\nNo judge decisions recorded yet.\n");
  });
});
