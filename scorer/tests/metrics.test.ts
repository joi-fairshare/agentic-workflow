import { beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../src/db.js";
import { openDb } from "../src/db.js";
import { computeFixedPrefixFloor, computeMetrics, estimateFirstMessageSize, median, percentile } from "../src/metrics.js";

const startupCtx = (file: string, uuid: string, category: string, source: string, chars: number, ts = "2026-09-26T01:00:00.000Z") =>
  db.prepare("INSERT INTO startup_ctx VALUES (?, ?, 's', ?, ?, ?, ?, 'claude')").run(file, uuid, ts, category, source, chars);

let db: Db;
const SINCE = new Date("2026-09-26T00:00:00.000Z");
const UNTIL = new Date("2026-09-27T00:00:00.000Z");

function call(file: string, id: string, ts: string, ctx: number, o: { output?: number; type?: string; project?: string } = {}) {
  db.prepare("INSERT INTO calls VALUES (?, ?, ?, 's', 'a', ?, 1, 'm', ?, ?, 0, 0, ?, 'claude')").run(file, id, o.project ?? "p", o.type ?? "main", ts, ctx, o.output ?? 0);
}
const event = (uuid: string, kind: string, ts = "2026-09-26T05:00:00.000Z") => db.prepare("INSERT INTO events VALUES ('f', ?, ?, 's', ?, NULL, 'claude')").run(uuid, kind, ts);
const pr = (n: number, st: string | null, ts = "2026-09-26T05:00:00.000Z") => {
  db.prepare("INSERT INTO pr_links VALUES ('f', ?, 'o/r', ?, ?, 'claude')").run(`s${n}`, n, ts);
  if (st !== null) db.prepare("INSERT INTO pr_state VALUES ('o/r', ?, ?, 'x')").run(n, st);
};

beforeEach(() => { db = openDb(":memory:"); });

describe("median", () => {
  it("handles empty, odd and even inputs", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("computeFixedPrefixFloor", () => {
  it("returns the p10 value of a sorted set", () => {
    const totals = [30000, 31000, 32000, 40000, 41000, 42000, 43000, 60000, 61000, 62000];
    expect(computeFixedPrefixFloor(totals)).toBe(31000); // index floor(10*0.1)=1 of the sorted array
  });
  it("returns 0 for an empty array", () => {
    expect(computeFixedPrefixFloor([])).toBe(0);
  });
});

describe("estimateFirstMessageSize", () => {
  it("is the session total minus the floor", () => {
    expect(estimateFirstMessageSize(41271, 28251)).toBe(13020);
  });
  it("floors at 0 rather than going negative", () => {
    expect(estimateFirstMessageSize(20000, 28251)).toBe(0);
  });
});

describe("percentile", () => {
  it("computes p90 of a sorted set", () => {
    const values = Array.from({ length: 10 }, (_, i) => (i + 1) * 1000); // 1000..10000
    expect(percentile(values, 0.9)).toBe(9000);
  });

  it("returns the single value for a one-element set and 0 for an empty one", () => {
    expect(percentile([42], 0.9)).toBe(42);
    expect(percentile([42], 0.1)).toBe(42);
    expect(percentile([], 0.9)).toBe(0);
  });
});

describe("computeMetrics", () => {
  it("returns zeros and nulls for an empty window", () => {
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.cost).toMatchObject({ calls: 0, contextTokens: 0, shareOver200k: 0, startupPrefixShare: 0, tokensPerMergedPr: null, prsLinked: 0, contextGuard: { fires: 0 } });
    expect(m.involvement.promptsPerMergedPr).toBeNull();
  });

  it("counts context-guard fires within the window, ignoring ones outside it", () => {
    const m = computeMetrics(db, SINCE, UNTIL, [
      { ts: "2026-09-26T05:00:00.000Z", agentId: "a1", tokens: 210_000 },
      { ts: "2026-09-26T06:00:00.000Z", agentId: null, tokens: 205_000 },
      { ts: "2026-09-25T05:00:00.000Z", agentId: "a1", tokens: 210_000 }, // before SINCE
      { ts: "2026-09-27T05:00:00.000Z", agentId: "a1", tokens: 210_000 }, // at/after UNTIL
    ]);
    expect(m.cost.contextGuard).toEqual({ fires: 2 });
  });

  it("counts ui-evidence runs, broken steps, and unchecked-visual runs within the window, ignoring ones outside it", () => {
    const m = computeMetrics(db, SINCE, UNTIL, [], [
      { ts: "2026-09-26T05:00:00.000Z", brokenSteps: 1, visual: "unchecked" },
      { ts: "2026-09-26T06:00:00.000Z", brokenSteps: 2, visual: "looks-right" },
      { ts: "2026-09-25T05:00:00.000Z", brokenSteps: 9, visual: "unchecked" }, // before SINCE
    ]);
    expect(m.cost.uiEvidence).toEqual({ runs: 2, brokenSteps: 3, visualUnchecked: 1 });
  });

  it("defaults ui-evidence to zeros when no runs are passed", () => {
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.cost.uiEvidence).toEqual({ runs: 0, brokenSteps: 0, visualUnchecked: 0 });
  });

  it("computes context shares and the startup prefix share", () => {
    call("f1", "a", "2026-09-25T23:00:00.000Z", 50_000);
    call("f1", "b", "2026-09-26T01:00:00.000Z", 250_000, { output: 10 });
    call("f1", "c", "2026-09-26T02:00:00.000Z", 450_000, { output: 20 });
    call("f2", "d", "2026-09-26T03:00:00.000Z", 30_000, { type: "Explore", project: "q" });
    call("f2", "e", "2026-09-27T01:00:00.000Z", 999_999, { type: "Explore" });
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.cost.calls).toBe(3);
    expect(m.cost.contextTokens).toBe(730_000);
    expect(m.cost.outputTokens).toBe(30);
    expect(m.cost.callsOver200k).toBe(2);
    expect(m.cost.shareOver200k).toBeCloseTo(700_000 / 730_000);
    expect(m.cost.shareOver400k).toBeCloseTo(450_000 / 730_000);
    expect(m.cost.startupPrefixShare).toBeCloseTo((50_000 * 2 + 30_000 * 1) / 730_000);
    expect(m.cost.firstCallMedianByType).toEqual([
      { agentType: "main", agents: 1, median: 50_000 },
      { agentType: "Explore", agents: 1, median: 30_000 },
    ]);
    expect(m.cost.byProject).toEqual([{ project: "p", contextTokens: 700_000, calls: 2 }, { project: "q", contextTokens: 30_000, calls: 1 }]);
  });

  it("breaks cost and involvement down by provider and filters to the selected providers", () => {
    call("f1", "a", "2026-09-26T01:00:00.000Z", 1_000, { output: 10 });
    db.prepare("INSERT INTO calls (file, message_id, project, session_id, agent_id, agent_type, is_main, model, ts, input, cache_read, cache_creation, output, provider) VALUES ('cx', 'tc:1', 'p', 'cs', 'main', 'main', 1, 'gpt', ?, 100, 400, 0, 5, 'codex')").run("2026-09-26T02:00:00.000Z");
    db.prepare("INSERT INTO calls (file, message_id, project, session_id, agent_id, agent_type, is_main, model, ts, input, cache_read, cache_creation, output, provider) VALUES ('cx-sub', 'tc:2', 'p', 'cs', 'sub', 'explorer', 0, 'gpt', ?, 50, 0, 0, 1, 'codex')").run("2026-09-26T02:00:00.000Z");
    const evt = (uuid: string, kind: string, provider: string, session: string) =>
      db.prepare("INSERT INTO events (file, uuid, kind, session_id, ts, detail, provider) VALUES ('f', ?, ?, ?, '2026-09-26T05:00:00.000Z', NULL, ?)").run(uuid, kind, session, provider);
    evt("c1", "user_prompt", "codex", "cs"); evt("c2", "user_correction", "codex", "cs"); evt("k1", "user_continue", "cursor", "ks"); evt("k2", "interrupt", "cursor", "ks");
    const all = computeMetrics(db, SINCE, UNTIL);
    expect(all.providers).toEqual(["claude", "codex", "cursor"]);
    expect(all.byProvider).toEqual([
      { provider: "claude", hasUsage: true, sessions: 1, calls: 1, contextTokens: 1_000, outputTokens: 10, subagents: 0, prompts: 0, corrections: 0, interrupts: 0 },
      { provider: "codex", hasUsage: true, sessions: 1, calls: 2, contextTokens: 550, outputTokens: 6, subagents: 1, prompts: 2, corrections: 1, interrupts: 0 },
      { provider: "cursor", hasUsage: false, sessions: 1, calls: 0, contextTokens: 0, outputTokens: 0, subagents: 0, prompts: 1, corrections: 0, interrupts: 1 },
    ]);
    expect(all.cost.calls).toBe(3);
    expect(all.involvement.prompts).toBe(3);
    const codexOnly = computeMetrics(db, SINCE, UNTIL, [], [], undefined, ["codex"]);
    expect(codexOnly.byProvider.map((p) => p.provider)).toEqual(["codex"]);
    expect(codexOnly.cost.calls).toBe(2);
    expect(codexOnly.involvement).toMatchObject({ prompts: 2, corrections: 1, interrupts: 0 });
  });

  it("divides by merged PRs linked in the window only", () => {
    call("f1", "a", "2026-09-26T01:00:00.000Z", 1_000, { output: 200 });
    pr(1, "MERGED"); pr(2, "OPEN"); pr(3, null); pr(4, "MERGED", "2026-09-20T00:00:00.000Z");
    event("u1", "user_prompt"); event("u2", "user_continue"); event("u3", "user_correction"); event("u4", "interrupt");
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.cost).toMatchObject({ prsLinked: 3, prsMerged: 1, tokensPerMergedPr: 1_200 });
    expect(m.involvement).toEqual({ prompts: 3, continues: 1, corrections: 1, interrupts: 1, promptsPerMergedPr: 3 });
  });

  it("computes the fixed-prefix floor and first-message estimate per agent type, and the SessionStart hook median", () => {
    call("f1", "a", "2026-09-26T01:00:00.000Z", 30_000);
    startupCtx("f1", "u1", "hook_context", "SessionStart", 100);
    startupCtx("f2", "u2", "hook_context", "SessionStart", 300);
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.cost.fixedPrefixFloorByType).toEqual([{ agentType: "main", floor: 30_000 }]);
    expect(m.cost.firstMessageEstimateMedianByType).toEqual([{ agentType: "main", medianEstimate: 0 }]);
    expect(m.cost.sessionStartHookCharsMedian).toBe(200);
  });

  it("only counts a deferred_tools row that arrives before the session's first call", () => {
    db.prepare("INSERT INTO calls VALUES ('f1', 'a', 'p', 's1', 'a', 'main', 1, 'm', ?, 10000, 0, 0, 0, 'claude')").run("2026-09-26T01:00:00.000Z");
    // before the first call: counts
    db.prepare("INSERT INTO startup_ctx VALUES ('f1', 'u1', 's1', ?, 'deferred_tools', 'acme', 20000, 'claude')").run("2026-09-26T00:59:00.000Z");
    // a mid-session re-surfacing on a DIFFERENT source, arriving after the first call — must not count at all
    db.prepare("INSERT INTO startup_ctx VALUES ('f1', 'u2', 's1', ?, 'deferred_tools', 'claude_ai_Linear', 500, 'claude')").run("2026-09-26T01:30:00.000Z");
    const m = computeMetrics(db, SINCE, UNTIL);
    const acmeRow = m.cost.startupAccounting.find((r) => r.category === "deferred_tools" && r.source === "acme");
    const lateRow = m.cost.startupAccounting.find((r) => r.category === "deferred_tools" && r.source === "claude_ai_Linear");
    expect(acmeRow).toEqual({ category: "deferred_tools", source: "acme", medianChars: 20000, p90Chars: 20000, medianTokensEstimate: 5000 });
    expect(lateRow).toBeUndefined();
  });

  it("computes per-category median/p90 startup accounting from the first occurrence per session, main sessions only", () => {
    db.prepare("INSERT INTO calls VALUES ('f1', 'a', 'p', 's1', 'a', 'main', 1, 'm', ?, 10000, 0, 0, 0, 'claude')").run("2026-09-26T01:00:00.000Z");
    db.prepare("INSERT INTO calls VALUES ('f2', 'b', 'p', 's2', 'a', 'main', 1, 'm', ?, 10000, 0, 0, 0, 'claude')").run("2026-09-26T01:00:00.000Z");
    db.prepare("INSERT INTO startup_ctx VALUES ('f1', 'u1', 's1', ?, 'skill_listing', 'catalog', 30000, 'claude')").run("2026-09-26T01:00:00.000Z");
    db.prepare("INSERT INTO startup_ctx VALUES ('f2', 'u2', 's2', ?, 'skill_listing', 'catalog', 20000, 'claude')").run("2026-09-26T01:00:00.000Z");
    // a later, non-first occurrence in the same session/category/source should not double count
    db.prepare("INSERT INTO startup_ctx VALUES ('f1', 'u1b', 's1', ?, 'skill_listing', 'catalog', 500, 'claude')").run("2026-09-26T02:00:00.000Z");
    const m = computeMetrics(db, SINCE, UNTIL);
    const skillRow = m.cost.startupAccounting.find((r) => r.category === "skill_listing" && r.source === "catalog");
    expect(skillRow).toEqual({ category: "skill_listing", source: "catalog", medianChars: 25_000, p90Chars: 30_000, medianTokensEstimate: 6250 });
  });

  it("counts wakes in the window", () => {
    event("w1", "wake_idle"); event("w2", "wake_idle"); event("w3", "wake_text"); event("w4", "wake_terminate");
    event("w5", "wake_idle", "2026-09-28T00:00:00.000Z");
    const m = computeMetrics(db, SINCE, UNTIL);
    expect(m.wakes).toEqual({ idle: 2, text: 1, terminate: 1 });
    expect(m.since).toBe(SINCE.toISOString());
    expect(m.until).toBe(UNTIL.toISOString());
  });
});
