import path from "node:path";

export interface CliOptions {
  command: "report" | "probe" | "context-tokens";
  since: Date;
  until: Date;
  projectsDir: string;
  stateDir: string;
  // Whether --state-dir was actually passed on the command line, vs. left at
  // its home-dir default — needed so the judge-db path lookup (run.ts's
  // resolveJudgeDbPath) can give an explicit --state-dir priority over
  // AW_STATE_DIR, and AW_STATE_DIR priority over the bare default, rather
  // than only ever checking AW_STATE_DIR regardless of --state-dir.
  stateDirExplicit: boolean;
  prLookup: boolean;
  contextTokensPath: string | null;
}

type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

const UNIT_MS: Record<string, number> = { h: 3_600_000, d: 86_400_000 };

export function parseArgs(argv: string[], now: Date, home: string): ParseResult {
  const options: CliOptions = {
    command: "report",
    since: new Date(now.getTime() - UNIT_MS.d),
    until: now,
    projectsDir: path.join(home, ".claude", "projects"),
    stateDir: path.join(home, ".agentic-workflow"),
    stateDirExplicit: false,
    prLookup: true,
    contextTokensPath: null,
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift() as string;
    if (arg === "probe") { options.command = "probe"; continue; }
    if (arg === "context-tokens") {
      options.command = "context-tokens";
      const value = args.shift();
      if (value === undefined) return { ok: false, error: "context-tokens needs a path" };
      options.contextTokensPath = value;
      continue;
    }
    if (arg === "--no-pr-lookup") { options.prLookup = false; continue; }
    if (arg !== "--since" && arg !== "--projects-dir" && arg !== "--state-dir") return { ok: false, error: `unknown argument: ${arg}` };
    const value = args.shift();
    if (value === undefined) return { ok: false, error: `${arg} needs a value` };
    if (arg === "--projects-dir") options.projectsDir = value;
    if (arg === "--state-dir") { options.stateDir = value; options.stateDirExplicit = true; }
    if (arg === "--since") {
      const since = parseSince(value, now);
      if (typeof since === "string") return { ok: false, error: since };
      options.since = since;
    }
  }
  return { ok: true, options };
}

function parseSince(value: string, now: Date): Date | string {
  const rel = /^(\d+)([hd])$/.exec(value);
  const date = rel ? new Date(now.getTime() - Number(rel[1]) * UNIT_MS[rel[2]]) : new Date(value);
  if (Number.isNaN(date.getTime())) return `--since must be like 7d, 12h or an ISO date: ${value}`;
  if (date.getTime() >= now.getTime()) return `--since must be in the past: ${value}`;
  return date;
}
