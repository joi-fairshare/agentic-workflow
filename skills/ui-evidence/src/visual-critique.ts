// skills/ui-evidence/src/visual-critique.ts — thin wrapper around
// `judge visual-critique` (Task 5). Fails closed on any error, timeout,
// unparseable stdout, or out-of-enum decision (RF-5) — never a fabricated
// "looks-right". run-script.ts already treats a null result as "unchecked"
// with no reasons.
const VALID = new Set(["looks-right", "looks-off", "sloppy"]);

export interface VisualCritiqueResult {
  decision: "looks-right" | "looks-off" | "sloppy";
  reasons: string[];
}

import { runJudge } from "./judge-exec.js";

type Exec = (args: string[], input: string) => Promise<{ stdout: string; code: number | null }>;

const defaultExec: Exec = (args, input) => runJudge(args, input, 21_000);

export async function runVisualCritique(
  afterScreenshot: string,
  baselineScreenshot: string | null,
  evidenceDir: string,
  exec: Exec = defaultExec,
): Promise<VisualCritiqueResult | null> {
  try {
    const { stdout } = await exec(["visual-critique"], JSON.stringify({ afterScreenshot, baselineScreenshot, evidenceDir }));
    const parsed = JSON.parse(stdout) as { decision?: string; reasons?: string[] };
    if (parsed.decision === undefined || !VALID.has(parsed.decision)) return null;
    return { decision: parsed.decision as VisualCritiqueResult["decision"], reasons: parsed.reasons ?? [] };
  } catch {
    return null;
  }
}
