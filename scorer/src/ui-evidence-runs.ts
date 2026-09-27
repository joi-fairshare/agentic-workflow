import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export interface UiEvidenceRunRecord {
  ts: string;
  brokenSteps: number;
  visual: "unchecked" | "looks-right" | "looks-off" | "sloppy";
}

const RunSummarySchema = z.object({
  ts: z.string(),
  steps: z.array(z.object({ name: z.string(), status: z.enum(["passed", "failed", "broken"]), screenshot: z.string() })),
  visual: z.enum(["unchecked", "looks-right", "looks-off", "sloppy"]),
  visualReasons: z.array(z.string()),
  lintFindings: z.array(z.object({ rule: z.string(), selector: z.string(), detail: z.string() })),
});

// Mirrors probe/analyze.ts's readProbeDir shape (tolerate a missing dir, a
// missing/malformed/mismatched file per run — never throw the whole report
// over one bad run) but reads a directory of run-id subdirectories, each
// holding its own summary.json (skills/ui-evidence/src/publish.ts's
// RunSummary), not a flat JSONL log.
export function readUiEvidenceRuns(dir: string): UiEvidenceRunRecord[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const file = path.join(dir, entry.name, "summary.json");
    if (!fs.existsSync(file)) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return [];
    }
    const parsed = RunSummarySchema.safeParse(raw);
    if (!parsed.success) return [];
    const brokenSteps = parsed.data.steps.filter((s) => s.status === "broken").length;
    return [{ ts: parsed.data.ts, brokenSteps, visual: parsed.data.visual }];
  });
}
