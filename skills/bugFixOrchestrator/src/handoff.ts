const RESULTS = ["confirmed", "ruled-out", "untested"] as const;
export type HypothesisResult = (typeof RESULTS)[number];

export interface Hypothesis {
  n: number;
  text: string;
  files: string[];
  likelihood: string;
  result: HypothesisResult;
}

export interface Handoff {
  status: string;
  hypotheses: Hypothesis[];
  /** The `## Root Cause` section's text; empty when absent. */
  rootCause: string;
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function parseFiles(cell: string): string[] {
  const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (ticked.length > 0) return ticked;
  return cell.split(",").map((f) => f.trim()).filter((f) => f !== "");
}

// Parses the handoff written by `/rootCause --investigate-only`: the
// `status:` line and the `## Hypotheses` table
// (# | Hypothesis | Cause-site files | Likelihood | Result).
export function parseHandoff(md: string): Handoff | { error: string } {
  const lines = md.split("\n");
  const statusLine = lines.find((l) => /^status:\s*/.test(l));
  if (statusLine === undefined) return { error: "handoff has no status: line" };
  const status = statusLine.replace(/^status:\s*/, "").trim();

  const start = lines.findIndex((l) => l.trim() === "## Hypotheses");
  if (start === -1) return { error: "handoff has no ## Hypotheses section" };
  const tableRows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("|")) tableRows.push(line);
    else if (tableRows.length > 0 || line.trim() !== "") break;
  }
  // Header + separator, then data rows.
  const hypotheses: Hypothesis[] = [];
  for (const row of tableRows.slice(2)) {
    const c = cells(row);
    const n = Number(c[0]);
    const result = c[4] as HypothesisResult;
    if (c.length !== 5 || !Number.isInteger(n) || !RESULTS.includes(result)) return { error: `malformed hypotheses row: ${row.trim()}` };
    hypotheses.push({ n, text: c[1], files: parseFiles(c[2]), likelihood: c[3], result });
  }
  const rc = /^## Root Cause[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(md);
  return { status, hypotheses, rootCause: rc === null ? "" : rc[1].trim() };
}
