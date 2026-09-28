import type { ContentClass, Provider, ProviderName } from "./types.js";

export interface ChainSpec {
  classes: Partial<Record<ContentClass, readonly ProviderName[]>>;
}

// Content-class routing (spec F2). Every class ends its provider list with
// "rules" so a filled-in rules fallback can always decide when every model
// provider is unavailable or fails — otherwise "rules" would be unreachable.
// `image` routes to claude-cli (Plan 6, Task 5 — verified 2026-09-27 that
// `claude -p` can read an image via the Read tool), falling back to rules.
// `jev` is primary on every text class now that TypeSafe has passed vendor
// review for company code (spec F2); `claude-cli` stays as the fallback when
// jev is unavailable/errors. `image` is excluded — Jev is text-only.
export const DEFAULT_CHAIN: ChainSpec = {
  classes: {
    code: ["jev", "claude-cli", "rules"],
    diff: ["jev", "claude-cli", "rules"],
    brief: ["jev", "claude-cli", "rules"],
    transcript: ["jev", "claude-cli", "rules"],
    "message-meta": ["jev", "claude-cli", "rules"],
    image: ["claude-cli", "rules"],
  },
};

export function providersFor(spec: ChainSpec, cls: ContentClass, all: readonly Provider[]): Provider[] {
  const names = spec.classes[cls] ?? [];
  return names
    .map((name) => all.find((p) => p.name === name))
    .filter((p): p is Provider => p !== undefined && p.classes.has(cls));
}
