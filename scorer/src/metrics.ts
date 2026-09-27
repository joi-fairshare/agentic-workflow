import type { ContextGuardFire } from "./context-guard-fires.js";
import type { Db } from "./db.js";
import type { OutboxState } from "./outbox.js";
import type { UiEvidenceRunRecord } from "./ui-evidence-runs.js";

export interface Metrics {
  since: string;
  until: string;
  cost: {
    calls: number;
    contextTokens: number;
    outputTokens: number;
    callsOver200k: number;
    shareOver200k: number;
    shareOver400k: number;
    startupPrefixShare: number;
    firstCallMedianByType: Array<{ agentType: string; agents: number; median: number }>;
    fixedPrefixFloorByType: Array<{ agentType: string; floor: number }>;
    firstMessageEstimateMedianByType: Array<{ agentType: string; medianEstimate: number }>;
    sessionStartHookCharsMedian: number;
    startupAccounting: Array<{ category: string; source: string; medianChars: number; p90Chars: number; medianTokensEstimate: number }>;
    byProject: Array<{ project: string; contextTokens: number; calls: number }>;
    prsLinked: number;
    prsMerged: number;
    tokensPerMergedPr: number | null;
    contextGuard: { fires: number };
    uiEvidence: { runs: number; brokenSteps: number; visualUnchecked: number };
  };
  wakes: { idle: number; text: number; terminate: number };
  involvement: { prompts: number; continues: number; corrections: number; interrupts: number; promptsPerMergedPr: number | null };
  wakeGating: { queuedNow: number; expiredEver: number };
}

const CTX = "(input + cache_read + cache_creation)";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeFixedPrefixFloor(totals: readonly number[]): number {
  if (totals.length === 0) return 0;
  const sorted = [...totals].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * 0.1), sorted.length - 1)]!;
}

export function estimateFirstMessageSize(sessionTotal: number, agentTypeFloor: number): number {
  return Math.max(0, sessionTotal - agentTypeFloor);
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank percentile: the smallest value with at least p of the set at or below it.
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
}

export function computeMetrics(db: Db, since: Date, until: Date, firesLog: ContextGuardFire[] = [], uiEvidenceRuns: UiEvidenceRunRecord[] = [], outboxState: OutboxState = { queuedNow: 0, expiredEver: 0 }): Metrics {
  const w = { s: since.toISOString(), u: until.toISOString() };
  const totals = db.prepare(`
    SELECT COUNT(*) AS calls,
      COALESCE(SUM(${CTX}), 0) AS ctx,
      COALESCE(SUM(output), 0) AS out,
      COALESCE(SUM(CASE WHEN ${CTX} > 200000 THEN ${CTX} ELSE 0 END), 0) AS ctx200,
      COALESCE(SUM(CASE WHEN ${CTX} > 400000 THEN ${CTX} ELSE 0 END), 0) AS ctx400,
      COALESCE(SUM(CASE WHEN ${CTX} > 200000 THEN 1 ELSE 0 END), 0) AS n200
    FROM calls WHERE ts >= @s AND ts < @u`).get(w) as { calls: number; ctx: number; out: number; ctx200: number; ctx400: number; n200: number };

  const agents = db.prepare(`
    WITH firsts AS (
      SELECT c.file, c.agent_type, (c.input + c.cache_read + c.cache_creation) AS first_ctx
      FROM calls c WHERE c.ts = (SELECT MIN(ts) FROM calls c2 WHERE c2.file = c.file)
      GROUP BY c.file),
    win AS (SELECT file, COUNT(*) AS n FROM calls WHERE ts >= @s AND ts < @u GROUP BY file)
    SELECT f.agent_type AS agentType, f.first_ctx AS firstCtx, w.n AS n
    FROM firsts f JOIN win w ON w.file = f.file`).all(w) as Array<{ agentType: string; firstCtx: number; n: number }>;

  const prefix = agents.reduce((sum, a) => sum + a.firstCtx * a.n, 0);
  const byType = new Map<string, number[]>();
  for (const a of agents) byType.set(a.agentType, [...(byType.get(a.agentType) ?? []), a.firstCtx]);

  const fixedPrefixFloorByType = [...byType.entries()].map(([agentType, v]) => ({ agentType, floor: computeFixedPrefixFloor(v) }));
  const floorByAgentType = new Map(fixedPrefixFloorByType.map((f) => [f.agentType, f.floor]));
  const firstMessageEstimateMedianByType = [...byType.entries()].map(([agentType, v]) => ({
    agentType,
    // floorByAgentType is built from the same byType keys just above, so agentType is always present.
    medianEstimate: median(v.map((total) => estimateFirstMessageSize(total, floorByAgentType.get(agentType)!))),
  }));

  const hookCtxRows = db.prepare(`
    SELECT chars FROM startup_ctx WHERE category = 'hook_context' AND ts >= @s AND ts < @u`).all(w) as Array<{ chars: number }>;
  const sessionStartHookCharsMedian = median(hookCtxRows.map((h) => h.chars));

  const startupRows = db.prepare(`
    WITH first_call AS (
      SELECT session_id, MIN(ts) AS first_ts FROM calls GROUP BY session_id
    ),
    first_per_session AS (
      SELECT sc.session_id, sc.category, sc.source, sc.chars,
        ROW_NUMBER() OVER (PARTITION BY sc.session_id, sc.category, sc.source ORDER BY sc.ts ASC) AS rn
      FROM startup_ctx sc
      JOIN calls c ON c.session_id = sc.session_id
      LEFT JOIN first_call fc ON fc.session_id = sc.session_id
      WHERE c.is_main = 1 AND sc.ts >= @s AND sc.ts < @u
        -- deferred_tools has no isInitial-style flag (real shape: addedLines, addedNames,
        -- failedMcpServers, pendingMcpServers, readdedNames, removedNames, surfacedNames,
        -- type, wireHiddenNames — confirmed 2026-09-27) so a mid-session re-surfacing is
        -- excluded by requiring it to arrive at or before the session's first API call.
        AND (sc.category != 'deferred_tools' OR fc.first_ts IS NULL OR sc.ts <= fc.first_ts)
    )
    SELECT session_id AS sessionId, category, source, chars FROM first_per_session WHERE rn = 1`
  ).all(w) as Array<{ sessionId: string; category: string; source: string; chars: number }>;

  const byCategorySource = new Map<string, number[]>();
  for (const row of startupRows) {
    const key = `${row.category}::${row.source}`;
    byCategorySource.set(key, [...(byCategorySource.get(key) ?? []), row.chars]);
  }
  const startupAccounting = [...byCategorySource.entries()].map(([key, chars]) => {
    const [category, source] = key.split("::") as [string, string];
    return { category, source, medianChars: median(chars), p90Chars: percentile(chars, 0.9), medianTokensEstimate: Math.round(median(chars) / 4) };
  });

  const byProject = db.prepare(`
    SELECT project, SUM(${CTX}) AS contextTokens, COUNT(*) AS calls
    FROM calls WHERE ts >= @s AND ts < @u GROUP BY project ORDER BY contextTokens DESC`).all(w) as Metrics["cost"]["byProject"];

  const prs = db.prepare(`
    SELECT COUNT(*) AS linked, COALESCE(SUM(CASE WHEN s.state = 'MERGED' THEN 1 ELSE 0 END), 0) AS merged
    FROM (SELECT DISTINCT repo, number FROM pr_links WHERE ts >= @s AND ts < @u) p
    LEFT JOIN pr_state s ON s.repo = p.repo AND s.number = p.number`).get(w) as { linked: number; merged: number };

  const kinds = new Map((db.prepare("SELECT kind, COUNT(*) AS n FROM events WHERE ts >= @s AND ts < @u GROUP BY kind").all(w) as Array<{ kind: string; n: number }>).map((r) => [r.kind, r.n]));
  const k = (kind: string): number => kinds.get(kind) ?? 0;
  const prompts = k("user_prompt") + k("user_continue") + k("user_correction");
  const share = (part: number): number => (totals.ctx === 0 ? 0 : part / totals.ctx);
  const perMerged = (n: number): number | null => (prs.merged === 0 ? null : n / prs.merged);
  const firesInWindow = firesLog.filter((f) => f.ts >= w.s && f.ts < w.u).length;
  const uiRunsInWindow = uiEvidenceRuns.filter((r) => r.ts >= w.s && r.ts < w.u);

  return {
    since: w.s,
    until: w.u,
    cost: {
      calls: totals.calls,
      contextTokens: totals.ctx,
      outputTokens: totals.out,
      callsOver200k: totals.n200,
      shareOver200k: share(totals.ctx200),
      shareOver400k: share(totals.ctx400),
      startupPrefixShare: share(prefix),
      firstCallMedianByType: [...byType.entries()]
        .map(([agentType, v]) => ({ agentType, agents: v.length, median: median(v) }))
        .sort((a, b) => b.agents - a.agents || b.median - a.median),
      fixedPrefixFloorByType,
      firstMessageEstimateMedianByType,
      sessionStartHookCharsMedian,
      startupAccounting,
      byProject,
      prsLinked: prs.linked,
      prsMerged: prs.merged,
      tokensPerMergedPr: perMerged(totals.ctx + totals.out),
      contextGuard: { fires: firesInWindow },
      uiEvidence: {
        runs: uiRunsInWindow.length,
        brokenSteps: uiRunsInWindow.reduce((sum, r) => sum + r.brokenSteps, 0),
        visualUnchecked: uiRunsInWindow.filter((r) => r.visual === "unchecked").length,
      },
    },
    wakes: { idle: k("wake_idle"), text: k("wake_text"), terminate: k("wake_terminate") },
    involvement: { prompts, continues: k("user_continue"), corrections: k("user_correction"), interrupts: k("interrupt"), promptsPerMergedPr: perMerged(prompts) },
    wakeGating: { queuedNow: outboxState.queuedNow, expiredEver: outboxState.expiredEver },
  };
}
