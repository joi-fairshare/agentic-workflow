import type { Provider } from "../types.js";

/**
 * The rules fallback provider (spec: "the model chain... then falls back to
 * rules"). This plan ships no question-specific rules table yet — wake-gate's
 * own pre-rules (Task 6) already cover its fast paths before the chain runs,
 * so there is nothing left for this provider to decide for it. It exists so
 * later questions can register a fallback without changing the chain shape.
 */
export function makeRulesProvider(): Provider {
  return {
    name: "rules",
    classes: new Set(["code", "diff", "brief", "transcript", "message-meta", "image"]),
    decide: async () => ({ status: "unavailable", reason_code: "no-rules-fallback-configured" }),
  };
}
