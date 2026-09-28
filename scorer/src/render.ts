import type { Verdict } from "./format-health.js";
import { renderJudgeSection, type JudgeReportRow } from "./judge-section.js";
import type { Metrics } from "./metrics.js";

export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

const NO_MERGES = "n/a (no merged PRs)";
// the user's /context reading, 2026-09-27 — see the plan's "Spec correction" section.
const CONTEXT_CALIBRATION: Record<string, number> = { skill_listing: 10000, instructions: 5600, mcp_instructions: 3100 };

export function renderReport(m: Metrics, v: Verdict, judgeRows: JudgeReportRow[] = []): string {
  const lines = [`# Scorer report — ${m.until.slice(0, 10)}`, "", `Window: ${m.since} → ${m.until}`, "", renderJudgeSection(judgeRows), ""];
  if (v.status === "unknown-format") {
    lines.push("## ⚠ UNKNOWN TRANSCRIPT FORMAT", "", "The transcript JSONL no longer matches what the scorer parses. No numbers are shown, because they would be wrong. Fix `scorer/src/transcript/parse-line.ts` against a current transcript.", "", ...v.problems.map((p) => `- ${p}`), "");
    return lines.join("\n");
  }
  lines.push(`Format health: ${v.status === "ok" ? "ok" : "no new transcript lines since the last run"}`, ...[...v.problems, ...v.notices].map((p) => `- ${p}`), "");
  const c = m.cost;
  const na = "n/a";
  lines.push(
    "## By provider", "",
    `Providers: ${m.providers.join(", ")}. Cursor transcripts carry no token usage, so its cost columns are n/a.`, "",
    "| Provider | Sessions | API calls | Context tokens | Output tokens | Subagents | Human messages | Corrections | Interrupts |",
    "|---|---|---|---|---|---|---|---|---|",
    ...m.byProvider.map((p) => {
      const cost = p.hasUsage ? [String(p.calls), formatTokens(p.contextTokens), formatTokens(p.outputTokens), String(p.subagents)] : [na, na, na, na];
      return `| ${p.provider} | ${p.sessions} | ${cost.join(" | ")} | ${p.prompts} | ${p.corrections} | ${p.interrupts} |`;
    }),
    "",
    "## Cost", "", "| Signal | Value |", "|---|---|",
    `| API calls | ${c.calls} |`,
    `| Context tokens re-sent | ${formatTokens(c.contextTokens)} |`,
    `| Output tokens | ${formatTokens(c.outputTokens)} |`,
    `| Share in calls over 200k / 400k | ${formatPct(c.shareOver200k)} / ${formatPct(c.shareOver400k)} |`,
    `| Calls over 200k | ${c.callsOver200k} |`,
    `| Startup prefix share | ${formatPct(c.startupPrefixShare)} |`,
    `| PRs linked / merged | ${c.prsLinked} / ${c.prsMerged} |`,
    `| Tokens per merged PR | ${c.tokensPerMergedPr === null ? NO_MERGES : formatTokens(c.tokensPerMergedPr)} |`,
    `| Context-guard fires | ${c.contextGuard.fires} |`,
    "",
    "## UI evidence", "", "| Signal | Value |", "|---|---|",
    `| Runs | ${c.uiEvidence.runs} |`,
    `| Broken steps | ${c.uiEvidence.brokenSteps} |`,
    `| Visual unchecked | ${c.uiEvidence.visualUnchecked} |`,
    "",
    "### First-call context by agent type", "", "| Agent type | Agents | First-call context, median |", "|---|---|---|",
    ...c.firstCallMedianByType.map((t) => `| ${t.agentType} | ${t.agents} | ${formatTokens(t.median)} |`),
    "",
    "### By project", "", "| Project | Context tokens | Calls |", "|---|---|---|",
    ...c.byProject.map((p) => `| ${p.project} | ${formatTokens(p.contextTokens)} | ${p.calls} |`),
    "",
    "## Startup accounting", "",
    "| Agent type | fixed-prefix floor (p10, estimated) | Median first-message size (estimated) |",
    "|---|---|---|",
    ...c.fixedPrefixFloorByType.map((f) => {
      // firstMessageEstimateMedianByType is computed from the same agent-type set as
      // fixedPrefixFloorByType (see metrics.ts), so a match always exists.
      const est = c.firstMessageEstimateMedianByType.find((e) => e.agentType === f.agentType)!;
      return `| ${f.agentType} | ${formatTokens(f.floor)} | ${formatTokens(est.medianEstimate)} |`;
    }),
    "",
    `SessionStart hook output, median chars across sessions: ${c.sessionStartHookCharsMedian} (~${formatTokens(c.sessionStartHookCharsMedian / 4)} tokens). Per-prompt hook output (prism-route/on_prompt.py) is not measured by this report — no attachment shape carrying it was found during Task 5's real-transcript inspection; see the plan's Task 5 notes.`,
    "",
    "### Startup accounting — per category (chars/4 estimate, median/p90 across main sessions, first occurrence per session)",
    "", "| Category | Source | Median tokens (est.) | P90 tokens (est.) |", "|---|---|---|---|",
    ...c.startupAccounting
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category) || b.medianTokensEstimate - a.medianTokensEstimate)
      .map((r) => `| ${r.category} | ${r.source} | ${formatTokens(r.medianTokensEstimate)} | ${formatTokens(Math.round(r.p90Chars / 4))} |`),
    ...(() => {
      const deferredTotal = c.startupAccounting.filter((r) => r.category === "deferred_tools").reduce((s, r) => s + r.medianTokensEstimate, 0);
      return deferredTotal > 0 ? [`| deferred_tools | **total** | ${formatTokens(deferredTotal)} | — |`] : [];
    })(),
    "",
    "`/context` does not include `deferred_tools` — it is the deferred-tool roster sent before the first API call (per-server `mcp__<server>__` prefix), which is separate from the `/context` breakdown entirely, so it has no calibration row below.",
    "",
    "**Calibration against `/context` (the user, 2026-09-27):**", "", "| Category | Scorer estimate (sum of medians) | `/context` reading | Match? |", "|---|---|---|---|",
    ...Object.entries(CONTEXT_CALIBRATION).map(([category, contextValue]) => {
      const sum = c.startupAccounting.filter((r) => r.category === category).reduce((s, r) => s + r.medianTokensEstimate, 0);
      // contextValue comes from the fixed CONTEXT_CALIBRATION table above and is never 0.
      const ratio = sum / contextValue;
      const flag = ratio > 1.3 || ratio < 0.7 ? "⚠ mismatch" : "ok";
      return `| ${category} | ${formatTokens(sum)} | ${formatTokens(contextValue)} | ${flag} |`;
    }),
    "",
    "## Wakes (teammate messages delivered)", "", "| Kind | Count |", "|---|---|",
    `| idle_notification | ${m.wakes.idle} |`, `| text | ${m.wakes.text} |`, `| terminate | ${m.wakes.terminate} |`,
    "",
    "## Wake gating", "", "| Signal | Value |", "|---|---|",
    `| Queued now | ${m.wakeGating.queuedNow} |`,
    `| Expired (never delivered) | ${m.wakeGating.expiredEver} |`,
    "",
    "## Involvement", "", "| Signal | Value |", "|---|---|",
    `| the user's messages | ${m.involvement.prompts} |`,
    `| Plain "continue / yes / ok" | ${m.involvement.continues} |`,
    `| Corrections (heuristic) | ${m.involvement.corrections} |`,
    `| Interrupts | ${m.involvement.interrupts} |`,
    `| the user's messages per merged PR | ${m.involvement.promptsPerMergedPr === null ? NO_MERGES : m.involvement.promptsPerMergedPr.toFixed(1)} |`,
    "",
  );

  // Task 5 (evaluator gates, review-corrected): derived directly from
  // judgeRows — no query against the scorer's own Db, which has no
  // `decisions` table (that lives only in judge's separate decisions.sqlite,
  // already read generically via renderJudgeSection above). askCheckDecisions
  // is the total row count (decided + escalated/failed), matching
  // evaluate()'s own EvaluateOutcome union: an {escalate:true} outcome is a
  // correctly-withheld auto-continue, a decided row is a granted one.
  const askRow = judgeRows.find((r) => r.question === "ask-check");
  const askCheckDecisions = askRow === undefined ? 0 : askRow.decisions + askRow.escalations;
  const askCheckEscalateRate = askCheckDecisions === 0 || askRow === undefined ? 0 : askRow.escalations / askCheckDecisions;
  lines.push(
    "## Quality", "", "| Signal | Value |", "|---|---|",
    `| ask-check decisions | ${askCheckDecisions} |`,
    `| ask-check escalate rate | ${formatPct(askCheckEscalateRate)} |`,
    "",
    "Review-rounds-per-PR and CI-failures-after-done have no data source in this scorer yet (no GitHub PR-review/CI fetch exists) — a follow-up, not faked here.",
    "",
  );
  return lines.join("\n");
}
