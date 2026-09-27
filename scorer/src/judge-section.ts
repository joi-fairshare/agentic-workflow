import type Database from "better-sqlite3";

export type JudgeDb = Database.Database;

export interface JudgeReportRow {
  question: string;
  decisions: number;
  undos: number;
  errorRate: number;
  failures: number;
  fallbacks: number;
  p95LatencyMs: number;
  escalations: number;
}

// A question can appear here with zero decided rows (every call so far was
// disabled/invalid-input/never-decided), so `sorted` can be empty.
function p95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx] as number;
}

interface DecisionAggRow {
  latency_ms: number;
  undone_at: string | null;
  skipped: string;
}

export function judgeSection(db: JudgeDb, sinceIso: string): JudgeReportRow[] {
  const questions = db.prepare("SELECT DISTINCT question FROM decisions WHERE ts >= ? ORDER BY question").all(sinceIso) as Array<{ question: string }>;
  return questions.map(({ question }) => {
    // Only decided rows carry a real latency/undo/fallback story — an
    // escalated or failed row never decided anything (decision is NULL).
    const decisionRows = db
      .prepare("SELECT latency_ms, undone_at, skipped FROM decisions WHERE question = ? AND ts >= ? AND outcome = 'decided'")
      .all(question, sinceIso) as DecisionAggRow[];
    const decisions = decisionRows.length;
    const undos = decisionRows.filter((r) => r.undone_at !== null).length;
    // A real fallback: this decision's chain skipped at least one provider
    // before the winner, per the `skipped` array evaluate() records —
    // independent of the failures table, since a provider can be skipped for
    // being merely unavailable (no failure row) as well as for erroring.
    const fallbacks = decisionRows.filter((r) => (JSON.parse(r.skipped) as unknown[]).length > 0).length;
    const failures = (db.prepare("SELECT COUNT(*) as n FROM failures WHERE question = ? AND ts >= ?").get(question, sinceIso) as { n: number }).n;
    const escalations = (
      db.prepare("SELECT COUNT(*) as n FROM decisions WHERE question = ? AND ts >= ? AND outcome IN ('escalated', 'failed')").get(question, sinceIso) as { n: number }
    ).n;
    const latencies = decisionRows.map((r) => r.latency_ms).sort((a, b) => a - b);
    return {
      question,
      decisions,
      undos,
      errorRate: decisions > 0 ? undos / decisions : 0,
      failures,
      fallbacks,
      p95LatencyMs: p95(latencies),
      escalations,
    };
  });
}

export function renderJudgeSection(rows: JudgeReportRow[]): string {
  if (rows.length === 0) return "## Judge\n\nNo judge decisions recorded yet.\n";
  const header = "## Judge\n\n| Question | Decisions | Undos | Error rate | Failures | Escalations | Fallbacks | p95 latency (ms) |\n|---|---|---|---|---|---|---|---|\n";
  const body = rows
    .map((r) => `| ${r.question} | ${r.decisions} | ${r.undos} | ${(r.errorRate * 100).toFixed(1)}% | ${r.failures} | ${r.escalations} | ${r.fallbacks} | ${r.p95LatencyMs} |`)
    .join("\n");
  return `${header}${body}\n`;
}
