import fs from "node:fs";

import { TestResultSchema, UiSummarySchema } from "./schema.js";

export type RunOutcome = "passed" | "failed" | "broken";

export interface RunEvidence {
  kind: "ui-evidence" | "test";
  outcome: RunOutcome;
  /** The commit the run executed against; null when a ui-evidence run had no --app-build. */
  commit: string | null;
  /** Check-file hash observed by run-test; null for ui-evidence (the helper hashes the script itself). */
  checkSha256: string | null;
}

// A failed expectation anywhere makes the run "failed" (a real behavior
// failure). Only broken steps and no failed ones is "broken": a selector
// problem, which is not a reproduction of the bug.
function uiOutcome(statuses: readonly RunOutcome[]): RunOutcome {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("broken")) return "broken";
  return "passed";
}

export function readRunEvidence(file: string): RunEvidence | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { error: `cannot read evidence: ${file}` };
  }
  const test = TestResultSchema.safeParse(raw);
  if (test.success) {
    return { kind: "test", outcome: test.data.exitCode === 0 ? "passed" : "failed", commit: test.data.commit, checkSha256: test.data.checkSha256 };
  }
  const ui = UiSummarySchema.safeParse(raw);
  if (ui.success) {
    if (ui.data.steps.length === 0) return { error: `ui-evidence summary has no steps: ${file}` };
    return { kind: "ui-evidence", outcome: uiOutcome(ui.data.steps.map((s) => s.status)), commit: ui.data.appBuild ?? null, checkSha256: null };
  }
  return { error: `unrecognised evidence format (expected a ui-evidence summary.json or a run-test result): ${file}` };
}
