// Per-phase and per-PR/route cost of UI evidence runs. Any quantity a
// provider did not report stays "unknown" (null / an explicit unknown count);
// a missing number is never summed as zero.
import { PHASES, type Phase, type UiEvidenceRunRecord } from "./ui-evidence-runs.js";

export interface Known {
  /** Sum over invocations that reported a value; null when none did. */
  total: number | null;
  /** Invocations that reported nothing. */
  unknown: number;
}

export interface PhaseCost {
  phase: Phase;
  /** Model calls that actually ran (cache hits excluded). */
  calls: number;
  cacheHits: number;
  failures: number;
  elapsedMs: Known;
  inputTokens: Known;
  outputTokens: Known;
}

export interface RouteCost {
  pr: string | null;
  route: string | null;
  runs: number;
  brokenSteps: number;
  calls: number;
  elapsedMs: Known;
  inputTokens: Known;
  visual: Record<UiEvidenceRunRecord["visual"], number>;
}

export interface UiEvidenceCost {
  phases: PhaseCost[];
  byPrRoute: RouteCost[];
}

function known(values: Array<number | null>): Known {
  const reported = values.filter((v): v is number => v !== null);
  return { total: reported.length === 0 ? null : reported.reduce((a, b) => a + b, 0), unknown: values.length - reported.length };
}

const sortKey = (r: RouteCost): string => `${r.pr ?? ""}\u0000${r.route ?? ""}`;

export function aggregateUiEvidenceCost(runs: readonly UiEvidenceRunRecord[]): UiEvidenceCost {
  const all = runs.flatMap((r) => r.invocations);
  const phases = PHASES.map((phase): PhaseCost => {
    const mine = all.filter((i) => i.phase === phase);
    const ran = mine.filter((i) => !i.cacheHit);
    return {
      phase,
      calls: ran.length,
      cacheHits: mine.length - ran.length,
      failures: ran.filter((i) => !i.ok).length,
      elapsedMs: known(ran.map((i) => i.elapsedMs)),
      inputTokens: known(ran.map((i) => i.inputTokens)),
      outputTokens: known(ran.map((i) => i.outputTokens)),
    };
  });

  const groups = new Map<string, UiEvidenceRunRecord[]>();
  for (const r of runs) {
    const key = JSON.stringify([r.pr, r.route]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const byPrRoute = [...groups.values()].map((rs): RouteCost => {
    const ran = rs.flatMap((r) => r.invocations).filter((i) => !i.cacheHit);
    const visual = { unchecked: 0, unchanged: 0, "looks-right": 0, "looks-off": 0, sloppy: 0 };
    for (const r of rs) visual[r.visual]++;
    return {
      pr: rs[0]!.pr,
      route: rs[0]!.route,
      runs: rs.length,
      brokenSteps: rs.reduce((n, r) => n + r.brokenSteps, 0),
      calls: ran.length,
      elapsedMs: known(ran.map((i) => i.elapsedMs)),
      inputTokens: known(ran.map((i) => i.inputTokens)),
      visual,
    };
  }).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return { phases, byPrRoute };
}
