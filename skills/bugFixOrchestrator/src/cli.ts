import path from "node:path";

import {
  advanceInvestigate, advanceReport, advanceReproduce, init, judgeInput, recordCandidate, recordJudge, recordRun, resume, runTest, runUi, startAttempt, status,
  type Result,
} from "./commands.js";
import type { Deps } from "./deps.js";

const BOOLEAN_FLAGS = new Set(["unresolved", "allow-test-changes"]);

const USAGE = `usage: bugfix-state <command> --state <dir> [options]
  init --ticket <ticket.json>
  advance investigate --evidence <handoff.md>
  advance reproduce --evidence <run> --check <file> [--cwd <dir>]
  start-attempt --mode <A|B|C>
  record-candidate --branch <branch> [--cwd <dir>] [--hypothesis <n>] [--allow-test-changes]
  record-run <candidate> --evidence <run>
  judge-input <candidate>
  record-judge <candidate> (--decision-id <id> | --escalated <reason_code>)
  advance report (--candidate <id> | --unresolved)
  run-test --check <file> [--cwd <dir>] -- <command...>
  run-ui --check <script.json> [--cwd <dir>]
  status | resume`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
  rest: string[];
}

export function parseArgs(argv: string[]): Parsed | { error: string } {
  const parsed: Parsed = { positional: [], flags: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        parsed.flags[key] = true;
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `--${key} needs a value` };
      parsed.flags[key] = value;
      i++;
      continue;
    }
    parsed.positional.push(token);
  }
  return parsed;
}

export function main(argv: string[], deps: Deps): Result {
  // Any unexpected failure (not a git repo, unreadable file) is bad usage
  // with a one-line message, never a stack trace.
  try {
    return dispatch(argv, deps);
  } catch (e) {
    return { exitCode: 1, stdout: "", stderr: describe(e) };
  }
}

// git's reason ("fatal: not a git repository") is in the child's stderr; the
// message's first line is only the command that failed.
function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const stderr = String((e as { stderr?: unknown }).stderr ?? "").trim();
  const firstLine = e.message.split("\n")[0];
  return stderr === "" ? firstLine : `${firstLine}: ${stderr.split("\n")[0]}`;
}

function dispatch(argv: string[], deps: Deps): Result {
  const parsed = parseArgs(argv);
  if ("error" in parsed) return { exitCode: 1, stdout: "", stderr: `${parsed.error}\n${USAGE}` };
  const [cmd, sub] = parsed.positional;
  const flag = (k: string): string | undefined => (typeof parsed.flags[k] === "string" ? (parsed.flags[k] as string) : undefined);
  const stateArg = flag("state");
  if (cmd === undefined || stateArg === undefined) return { exitCode: 1, stdout: "", stderr: USAGE };
  const dir = path.resolve(stateArg);
  const cwd = flag("cwd") ?? process.cwd();
  const need = (...keys: string[]): string | null => {
    const missing = keys.filter((k) => flag(k) === undefined);
    return missing.length === 0 ? null : `missing ${missing.map((k) => `--${k}`).join(", ")}\n${USAGE}`;
  };
  const missing = (...keys: string[]): Result | null => {
    const m = need(...keys);
    return m === null ? null : { exitCode: 1, stdout: "", stderr: m };
  };

  switch (cmd) {
    case "init":
      return missing("ticket") ?? init(dir, flag("ticket") as string, deps);
    case "advance":
      if (sub === "investigate") return missing("evidence") ?? advanceInvestigate(dir, flag("evidence") as string, deps);
      if (sub === "reproduce") return missing("evidence", "check") ?? advanceReproduce(dir, flag("evidence") as string, flag("check") as string, cwd, deps);
      if (sub === "report") return advanceReport(dir, flag("candidate"), parsed.flags.unresolved === true, deps);
      return { exitCode: 1, stdout: "", stderr: USAGE };
    case "start-attempt":
      return missing("mode") ?? startAttempt(dir, flag("mode") as string, deps);
    case "record-candidate":
      return missing("branch") ?? recordCandidate(dir, flag("branch") as string, cwd, flag("hypothesis"), parsed.flags["allow-test-changes"] === true, deps);
    case "record-run":
      if (sub === undefined) return { exitCode: 1, stdout: "", stderr: USAGE };
      return missing("evidence") ?? recordRun(dir, sub, flag("evidence") as string, deps);
    case "record-judge":
      if (sub === undefined) return { exitCode: 1, stdout: "", stderr: USAGE };
      return recordJudge(dir, sub, flag("decision-id"), flag("escalated"), deps);
    case "judge-input":
      if (sub === undefined) return { exitCode: 1, stdout: "", stderr: USAGE };
      return judgeInput(dir, sub, deps);
    case "run-ui":
      return missing("check") ?? runUi(dir, flag("check") as string, cwd, deps);
    case "run-test":
      return missing("check") ?? runTest(dir, flag("check") as string, cwd, parsed.rest, deps);
    case "status":
      return status(dir);
    case "resume":
      return resume(dir);
    default:
      return { exitCode: 1, stdout: "", stderr: USAGE };
  }
}
