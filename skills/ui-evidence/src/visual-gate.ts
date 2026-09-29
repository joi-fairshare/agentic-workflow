// Decides whether a run needs an image-model call at all. Order of cost:
//   1. deterministic pixel compare vs the approved baseline (free)
//   2. verdict cache on the actual pixels (free)
//   3. one visual critique on the changed region (paid)
// Hard step failures are never softened here: a run with broken/failed steps
// always gets a critique so the reviewer sees a verdict, not silence.
import { cacheKey, lookup, store, type CacheContext, type CachedVerdict, type Manifest } from "./verdict-cache.js";
import type { DiffResult } from "./pixel-diff.js";
import type { ModelInvocation } from "./usage.js";

export type Visual = "unchecked" | "unchanged" | "looks-right" | "looks-off" | "sloppy";

export interface GateInput {
  after: string;
  baseline: string | null;
  hasFailedSteps: boolean;
  runId: string;
  ctx: CacheContext;
  manifest: Manifest;
  /** Compare after vs baseline; throws are treated as "changed". */
  compare: (after: string, baseline: string) => DiffResult;
  hash: (file: string) => string;
  /** Crop both images to the diff region; returns paths to send to the judge. */
  crop: (diff: DiffResult) => { after: string; baseline: string };
  critique: (after: string, baseline: string | null) => Promise<CachedVerdict | null>;
  record: (i: ModelInvocation) => void;
}

export interface GateOutput {
  visual: Visual;
  reasons: string[];
  diffScore: number | null;
  diff: DiffResult | null;
}

export async function decideVisual(input: GateInput): Promise<GateOutput> {
  let diff: DiffResult | null = null;
  if (input.baseline !== null) {
    try {
      diff = input.compare(input.after, input.baseline);
    } catch {
      diff = null; // unreadable image: fall through to the judge, never assume "unchanged"
    }
  }
  const diffScore = diff?.diffScore ?? null;

  if (diff !== null && !diff.changed && !input.hasFailedSteps) {
    return { visual: "unchanged", reasons: [], diffScore, diff };
  }

  const key = cacheKey(input.hash(input.after), input.baseline === null ? null : input.hash(input.baseline), input.ctx);
  const cached = lookup(input.manifest, key, input.ctx, input.runId);
  if (cached !== null) {
    input.record({ phase: "visual-critique", model: null, elapsedMs: 0, ok: true, inputTokens: null, outputTokens: null, cacheHit: true });
    return { visual: cached.decision, reasons: cached.reasons, diffScore, diff };
  }

  const region = diff !== null && diff.box !== null && input.baseline !== null ? input.crop(diff) : null;
  const verdict = await input.critique(region?.after ?? input.after, region?.baseline ?? input.baseline);
  if (verdict === null) return { visual: "unchecked", reasons: [], diffScore, diff };
  store(input.manifest, key, verdict, input.runId);
  return { visual: verdict.decision, reasons: verdict.reasons, diffScore, diff };
}
