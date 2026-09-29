import fs from "node:fs";
import path from "node:path";

import type { AgentCliName } from "./types.js";

export const AGENT_CLI_BINARIES: Readonly<Record<AgentCliName, string>> = {
  "claude-cli": "claude",
  "codex-cli": "codex",
  "cursor-cli": "cursor-agent",
};

// Default preference when AW_PROVIDER doesn't name one: claude-cli (fastest
// measured, ~3s), codex-cli (~3.4s), cursor-cli (~8-11s, mostly CLI startup).
export const DEFAULT_AGENT_CLI_ORDER: readonly AgentCliName[] = ["claude-cli", "codex-cli", "cursor-cli"];

export function isAgentCliName(value: unknown): value is AgentCliName {
  return typeof value === "string" && (DEFAULT_AGENT_CLI_ORDER as readonly string[]).includes(value);
}

function defaultIsExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function isOnPath(bin: string, env: NodeJS.ProcessEnv, isExecutable: (file: string) => boolean = defaultIsExecutable): boolean {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter((d) => d !== "");
  return dirs.some((dir) => isExecutable(path.join(dir, bin)));
}

// AW_PROVIDER names the host the calling session runs in ("claude", "codex",
// "cursor"; the "-cli" provider names are accepted too).
export function agentCliFromEnv(value: string | undefined): AgentCliName | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  const candidate = normalized.endsWith("-cli") ? normalized : `${normalized}-cli`;
  return isAgentCliName(candidate) ? candidate : undefined;
}

/**
 * Which agent CLIs the chain uses, in priority order. An explicit config list
 * wins outright (still filtered to installed binaries); otherwise the default
 * order, with the AW_PROVIDER host moved to the front.
 */
export function resolveAgentClis(opts: {
  available: (name: AgentCliName) => boolean;
  awProvider?: string;
  configured?: readonly AgentCliName[];
}): AgentCliName[] {
  let order: readonly AgentCliName[] = DEFAULT_AGENT_CLI_ORDER;
  if (opts.configured !== undefined) {
    order = opts.configured;
  } else {
    const preferred = agentCliFromEnv(opts.awProvider);
    if (preferred !== undefined) order = [preferred, ...DEFAULT_AGENT_CLI_ORDER.filter((n) => n !== preferred)];
  }
  return [...new Set(order)].filter((name) => opts.available(name));
}
