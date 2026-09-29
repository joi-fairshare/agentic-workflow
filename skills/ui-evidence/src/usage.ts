// Cost-baseline records. A model invocation's token counts are null when the
// provider reports none — "unknown" is a distinct state, never coerced to 0.
export type InvocationPhase = "planning" | "selector-repair" | "visual-critique";

export interface ModelInvocation {
  phase: InvocationPhase;
  model: string | null;
  elapsedMs: number | null;
  ok: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheHit?: boolean;
}

export async function timed<T>(phase: InvocationPhase, record: (i: ModelInvocation) => void, fn: () => Promise<T | null>, now: () => number = Date.now): Promise<T | null> {
  const start = now();
  let result: T | null = null;
  try {
    result = await fn();
  } finally {
    record({ phase, model: null, elapsedMs: now() - start, ok: result !== null, inputTokens: null, outputTokens: null });
  }
  return result;
}
