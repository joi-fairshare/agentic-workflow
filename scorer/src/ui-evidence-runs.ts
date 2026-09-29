import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export const PHASES = ["planning", "selector-repair", "visual-critique"] as const;
export type Phase = (typeof PHASES)[number];

// null = the provider reported nothing. Kept distinct from 0 all the way to
// the rendered report.
export interface InvocationRecord {
  phase: Phase;
  ok: boolean;
  elapsedMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheHit: boolean;
}

export interface UiEvidenceRunRecord {
  ts: string;
  brokenSteps: number;
  visual: "unchecked" | "unchanged" | "looks-right" | "looks-off" | "sloppy";
  pr: string | null;
  route: string | null;
  invocations: InvocationRecord[];
}

const InvocationSchema = z.object({
  phase: z.enum(PHASES),
  ok: z.boolean(),
  elapsedMs: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheHit: z.boolean().optional(),
});

const RunSummarySchema = z.object({
  ts: z.string(),
  steps: z.array(z.object({ name: z.string(), status: z.enum(["passed", "failed", "broken"]), screenshot: z.string() })),
  visual: z.enum(["unchecked", "unchanged", "looks-right", "looks-off", "sloppy"]),
  visualReasons: z.array(z.string()),
  pr: z.string().optional(),
  route: z.string().optional(),
  invocations: z.array(InvocationSchema).optional(),
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
    const invocations = (parsed.data.invocations ?? []).map((i) => ({ ...i, cacheHit: i.cacheHit === true }));
    return [{ ts: parsed.data.ts, brokenSteps, visual: parsed.data.visual, pr: parsed.data.pr ?? null, route: parsed.data.route ?? null, invocations }];
  });
}
