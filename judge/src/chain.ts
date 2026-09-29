import type { AgentCliName, ContentClass, Provider, ProviderName } from "./types.js";

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

const TEXT_CLASSES = ["code", "diff", "brief", "transcript", "message-meta"] as const;

/**
 * The runtime chain (cli.ts): same shape as DEFAULT_CHAIN, with the agent-CLI
 * slot filled by whichever CLIs are installed, in priority order (detect.ts
 * resolveAgentClis). Text classes: jev (unless disabled) -> agent CLIs ->
 * rules. Image: agent CLIs -> rules (jev is text-only). With only claude
 * installed this is exactly DEFAULT_CHAIN.
 */
export function buildChain(opts: { agentClis: readonly AgentCliName[]; jev: boolean }): ChainSpec {
  const text: ProviderName[] = [...(opts.jev ? (["jev"] as const) : []), ...opts.agentClis, "rules"];
  const classes: Partial<Record<ContentClass, readonly ProviderName[]>> = {};
  for (const cls of TEXT_CLASSES) classes[cls] = text;
  classes.image = [...opts.agentClis, "rules"];
  return { classes };
}

export function providersFor(spec: ChainSpec, cls: ContentClass, all: readonly Provider[]): Provider[] {
  const names = spec.classes[cls] ?? [];
  return names
    .map((name) => all.find((p) => p.name === name))
    .filter((p): p is Provider => p !== undefined && p.classes.has(cls));
}
