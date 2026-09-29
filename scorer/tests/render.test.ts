import { describe, expect, it } from "vitest";

import { openDb as openJudgeDb, recordDecision } from "../../judge/src/db.js";
import type { Metrics } from "../src/metrics.js";
import { judgeSection } from "../src/judge-section.js";
import { formatKnown, formatPct, formatTokens, renderReport } from "../src/render.js";

const metrics: Metrics = {
  since: "2026-09-25T00:00:00.000Z",
  until: "2026-09-26T00:00:00.000Z",
  providers: ["claude", "codex", "cursor"],
  byProvider: [
    { provider: "claude", hasUsage: true, sessions: 5, calls: 1100, contextTokens: 23_000_000_000, outputTokens: 3_500_000, subagents: 4, prompts: 700, corrections: 30, interrupts: 70 },
    { provider: "codex", hasUsage: true, sessions: 2, calls: 100, contextTokens: 700_000_000, outputTokens: 500_000, subagents: 1, prompts: 90, corrections: 2, interrupts: 3 },
    { provider: "cursor", hasUsage: false, sessions: 1, calls: 0, contextTokens: 0, outputTokens: 0, subagents: 0, prompts: 11, corrections: 0, interrupts: 1 },
  ],
  cost: {
    calls: 1200, contextTokens: 23_700_000_000, outputTokens: 4_000_000, callsOver200k: 300,
    shareOver200k: 0.76, shareOver400k: 0.44, startupPrefixShare: 0.237,
    firstCallMedianByType: [{ agentType: "main", agents: 3, median: 78_000 }],
    fixedPrefixFloorByType: [{ agentType: "main", floor: 28_251 }],
    firstMessageEstimateMedianByType: [{ agentType: "main", medianEstimate: 13_020 }],
    sessionStartHookCharsMedian: 3321,
    startupAccounting: [
      { category: "skill_listing", source: "catalog", medianChars: 30000, p90Chars: 30000, medianTokensEstimate: 7500 },
      { category: "instructions", source: "~/.claude/CLAUDE.md", medianChars: 4123, p90Chars: 4123, medianTokensEstimate: 1031 },
      { category: "mcp_instructions", source: "prism-mcp", medianChars: 2074, p90Chars: 2074, medianTokensEstimate: 519 },
      { category: "deferred_tools", source: "acme", medianChars: 72148, p90Chars: 72148, medianTokensEstimate: 18037 },
      { category: "deferred_tools", source: "prism-mcp", medianChars: 6932, p90Chars: 6932, medianTokensEstimate: 1733 },
    ],
    byProject: [{ project: "-Users-dev-acme-web-app", contextTokens: 23_700_000_000, calls: 1200 }],
    prsLinked: 4, prsMerged: 2, tokensPerMergedPr: 11_852_000_000,
    contextGuard: { fires: 6 },
    uiEvidence: {
      runs: 3, brokenSteps: 1, visualUnchecked: 1, visualUnchanged: 1,
      cost: {
        phases: [
          { phase: "planning", calls: 1, cacheHits: 0, failures: 0, elapsedMs: { total: 1200, unknown: 0 }, inputTokens: { total: null, unknown: 1 }, outputTokens: { total: null, unknown: 1 } },
          { phase: "selector-repair", calls: 2, cacheHits: 0, failures: 1, elapsedMs: { total: 500, unknown: 1 }, inputTokens: { total: 4000, unknown: 1 }, outputTokens: { total: 90, unknown: 0 } },
          { phase: "visual-critique", calls: 0, cacheHits: 2, failures: 0, elapsedMs: { total: null, unknown: 0 }, inputTokens: { total: null, unknown: 0 }, outputTokens: { total: null, unknown: 0 } },
        ],
        byPrRoute: [{ pr: "42", route: "/schedule", runs: 2, brokenSteps: 1, calls: 3, elapsedMs: { total: 1700, unknown: 1 }, inputTokens: { total: null, unknown: 3 }, visual: { unchecked: 1, unchanged: 1, "looks-right": 0, "looks-off": 0, sloppy: 0 } },
                   { pr: null, route: null, runs: 1, brokenSteps: 0, calls: 0, elapsedMs: { total: null, unknown: 0 }, inputTokens: { total: null, unknown: 0 }, visual: { unchecked: 0, unchanged: 0, "looks-right": 1, "looks-off": 0, sloppy: 0 } }],
      },
    },
  },
  wakes: { idle: 707, text: 558, terminate: 19 },
  involvement: { prompts: 801, continues: 101, corrections: 32, interrupts: 74, promptsPerMergedPr: 400.5 },
  wakeGating: { queuedNow: 2, expiredEver: 5 },
};

describe("formatters", () => {
  it("formats token counts", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1_234)).toBe("1.2k");
    expect(formatTokens(78_000)).toBe("78.0k");
    expect(formatTokens(2_100_000)).toBe("2.1M");
    expect(formatTokens(23_700_000_000)).toBe("23.7B");
  });

  it("formats percentages", () => {
    expect(formatPct(0.237)).toBe("23.7%");
    expect(formatPct(0)).toBe("0.0%");
  });
});

describe("renderReport", () => {
  it("renders every section for a healthy read", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: ["unrecognized line types: x×1"] });
    expect(md).toContain("# Scorer report — 2026-09-26");
    expect(md).toContain("Format health: ok");
    expect(md).toContain("- unrecognized line types: x×1");
    expect(md).toContain("| Context tokens re-sent | 23.7B |");
    expect(md).toContain("| Startup prefix share | 23.7% |");
    expect(md).toContain("| Tokens per merged PR | 11.9B |");
    expect(md).toContain("| Context-guard fires | 6 |");
    expect(md).toContain("## UI evidence");
    expect(md).toContain("| Runs | 3 |");
    expect(md).toContain("| Broken steps | 1 |");
    expect(md).toContain("| Visual unchecked | 1 |");
    expect(md).toContain("| main | 3 | 78.0k |");
    expect(md).toContain("| -Users-dev-acme-web-app | 23.7B | 1200 |");
    expect(md).toContain("| idle_notification | 707 |");
    expect(md).toContain("| the user's messages | 801 |");
  });

  it("renders the by-provider table, with n/a cost for a provider without usage data", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("## By provider");
    expect(md).toContain("Providers: claude, codex, cursor.");
    expect(md).toContain("| claude | 5 | 1100 | 23.0B | 3.5M | 4 | 700 | 30 | 70 |");
    expect(md).toContain("| codex | 2 | 100 | 700.0M | 500.0k | 1 | 90 | 2 | 3 |");
    expect(md).toContain("| cursor | 1 | n/a | n/a | n/a | n/a | 11 | 0 | 1 |");
  });

  it("renders a Startup accounting section with the floor, first-message estimate, and SessionStart hook chars, each labeled clearly", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("## Startup accounting");
    expect(md).toContain("fixed-prefix floor");
    expect(md).toContain("(estimated)");
    expect(md).toContain("SessionStart hook output");
  });

  it("renders the per-category startup accounting table and a /context calibration line", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("Startup accounting — per category");
    expect(md).toContain("| skill_listing | catalog | 7.5k |");
    expect(md).toContain("Calibration against `/context`");
    expect(md).toContain("| skill_listing |");
  });

  it("sorts two sources of the same category by descending median tokens", () => {
    const md = renderReport({ ...metrics, cost: { ...metrics.cost, startupAccounting: [
      { category: "mcp_instructions", source: "prism-mcp", medianChars: 2074, p90Chars: 2074, medianTokensEstimate: 519 },
      { category: "mcp_instructions", source: "claude.ai Figma", medianChars: 2080, p90Chars: 2080, medianTokensEstimate: 520 },
    ] } }, { status: "ok", problems: [], notices: [] });
    const a = md.indexOf("claude.ai Figma");
    const b = md.indexOf("prism-mcp");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(b);
  });

  it("renders a deferred_tools total row and a note that /context does not include this category", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("| deferred_tools | acme | 18.0k |");
    expect(md).toContain("| deferred_tools | **total** | 19.8k |");
    expect(md).toContain("`/context` does not include `deferred_tools`");
  });

  it("flags a category as a mismatch when the scorer estimate diverges from the /context reading", () => {
    const md = renderReport({ ...metrics, cost: { ...metrics.cost, startupAccounting: [
      { category: "skill_listing", source: "catalog", medianChars: 400, p90Chars: 400, medianTokensEstimate: 100 },
    ] } }, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("⚠ mismatch");
  });

  it("shows n/a when no PR merged", () => {
    const md = renderReport({ ...metrics, cost: { ...metrics.cost, tokensPerMergedPr: null }, involvement: { ...metrics.involvement, promptsPerMergedPr: null } }, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("| Tokens per merged PR | n/a (no merged PRs) |");
    expect(md).toContain("| the user's messages per merged PR | n/a (no merged PRs) |");
  });

  it("prints only a loud warning when the format is unknown", () => {
    const md = renderReport(metrics, { status: "unknown-format", problems: ["9 of 10 assistant lines had no usage record"], notices: [] });
    expect(md).toContain("⚠ UNKNOWN TRANSCRIPT FORMAT");
    expect(md).toContain("- 9 of 10 assistant lines had no usage record");
    expect(md).not.toContain("Context tokens re-sent");
  });

  it("says when there was no new data, and still renders the stored numbers", () => {
    const md = renderReport(metrics, { status: "no-new-data", problems: [], notices: [] });
    expect(md).toContain("Format health: no new transcript lines since the last run");
    expect(md).toContain("Context tokens re-sent");
  });

  it("lists problems under an ok status", () => {
    expect(renderReport(metrics, { status: "ok", problems: ["1 lines were not valid JSON"], notices: [] })).toContain("- 1 lines were not valid JSON");
  });

  it("renders the Judge section at the top, even with no judge data", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    const judgeIdx = md.indexOf("## Judge");
    const costIdx = md.indexOf("## Cost");
    expect(judgeIdx).toBeGreaterThanOrEqual(0);
    expect(judgeIdx).toBeLessThan(costIdx);
    expect(md).toContain("No judge decisions recorded yet.");
  });

  it("renders real judge rows when passed", () => {
    const jdb = openJudgeDb(":memory:");
    recordDecision(jdb, {
      id: "d1", ts: "2026-09-25T12:00:00.000Z", question: "wake-gate", content_class: "message-meta",
      provider: "claude-cli", decision: "send", confidence: 1, reason_code: "claude-cli", latency_ms: 50,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    const rows = judgeSection(jdb, "2026-09-25T00:00:00.000Z");
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] }, rows);
    expect(md).toContain("| wake-gate | 1 | 0 |");
  });
});

describe("Quality section (ask-check escalate rate)", () => {
  it("renders 0 decisions / 0% when ask-check has never run yet, not NaN or a throw", () => {
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
    expect(md).toContain("## Quality");
    expect(md).toContain("| ask-check decisions | 0 |");
    expect(md).toContain("| ask-check escalate rate | 0.0% |");
  });

  it("computes askCheckDecisions and askCheckEscalateRate from real judge rows", () => {
    const jdb = openJudgeDb(":memory:");
    recordDecision(jdb, {
      id: "d1", ts: "2026-09-27T00:00:00.000Z", question: "ask-check", content_class: "transcript",
      provider: "claude-cli", decision: "continue", confidence: 1, reason_code: "model", latency_ms: 10,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "decided",
    });
    recordDecision(jdb, {
      id: "d2", ts: "2026-09-27T00:00:00.000Z", question: "ask-check", content_class: "transcript",
      provider: "none", decision: null, confidence: 0, reason_code: "no-provider-decided", latency_ms: 0,
      input_digest: "x", undone_at: null, chain_position: 0, skipped: [], outcome: "escalated",
    });
    const rows = judgeSection(jdb, "2026-09-27T00:00:00.000Z");
    const md = renderReport(metrics, { status: "ok", problems: [], notices: [] }, rows);
    expect(md).toContain("| ask-check decisions | 2 |");
    expect(md).toContain("| ask-check escalate rate | 50.0% |");
  });
});

describe("UI evidence cost rendering", () => {
  const md = renderReport(metrics, { status: "ok", problems: [], notices: [] });
  it("prints unknown — never 0 — for token usage nobody reported", () => {
    expect(md).toContain("| planning | 1 | 0 | 0 | 1.2s | unknown | unknown |");
    expect(md).toContain("| visual-critique | 0 | 2 | 0 | unknown | unknown | unknown |");
  });
  it("shows the known part and how many calls are missing on a partial report", () => {
    expect(md).toContain("| selector-repair | 2 | 0 | 1 | 500ms (+1 unknown) | 4.0k (+1 unknown) | 90 |");
  });
  it("breaks runs out per PR and route, tolerating runs with neither", () => {
    expect(md).toContain("| 42 | /schedule | 2 | 1 | 3 | 1.7s (+1 unknown) | unknown | 1 / 0 / 0 / 0 / 1 |");
    expect(md).toContain("| unknown | unknown | 1 | 0 | 0 | unknown | unknown | 0 / 1 / 0 / 0 / 0 |");
  });
  it("formatKnown handles exact, partial and unreported", () => {
    expect(formatKnown({ total: 5, unknown: 0 }, String)).toBe("5");
    expect(formatKnown({ total: 5, unknown: 2 }, String)).toBe("5 (+2 unknown)");
    expect(formatKnown({ total: null, unknown: 0 }, String)).toBe("unknown");
  });
});
