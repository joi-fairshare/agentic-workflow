import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import type { CliOptions } from "./args.js";
import type { HealthStatus } from "./format-health.js";
import type { PrStateLookup } from "./pr-state.js";
import { readFiresLog } from "./context-guard-fires.js";
import { readOutboxState } from "./outbox.js";
import { readUiEvidenceRuns } from "./ui-evidence-runs.js";
import { openDb } from "./db.js";
import { verdict } from "./format-health.js";
import { ingestAll } from "./ingest.js";
import { judgeSection, type JudgeReportRow } from "./judge-section.js";
import { computeMetrics } from "./metrics.js";
import { refreshPrStates } from "./pr-state.js";
import { renderReport } from "./render.js";
import { discoverFiles } from "./transcript/discover.js";

export interface RunDeps {
  lookup: PrStateLookup;
  log: (line: string) => void;
  judgeDbPath?: string; // override for tests; defaults to the real per-box path
}

export interface RunResult {
  markdownPath: string;
  jsonPath: string;
  status: HealthStatus;
}

// Mirrors judge/src/config.ts's judgeStateDir/judgeDbPath (duplicated rather
// than imported across packages, since scorer's tsconfig rootDir can't
// include judge's src) — the real judge db is process-wide state, and
// AW_STATE_DIR overrides ~/.agentic-workflow wholesale for both packages.
function defaultJudgeDbPath(): string {
  const override = process.env.AW_STATE_DIR;
  const stateDir = override !== undefined && override !== "" ? override : path.join(os.homedir(), ".agentic-workflow");
  return path.join(stateDir, "judge", "decisions.sqlite");
}

// Precedence for the judge db path, given a parsed CLI invocation: an
// explicit --state-dir wins outright (the person typed it, most specific);
// otherwise AW_STATE_DIR (the sandbox/session-wide override); otherwise the
// bare default. Before this, the judge db path was read from AW_STATE_DIR
// alone regardless of --state-dir, so `scorer --state-dir $SB/state` (with
// AW_STATE_DIR unset) silently read the real ~/.agentic-workflow/judge
// instead of $SB/state/judge.
export function resolveJudgeDbPath(options: CliOptions): string {
  const override = process.env.AW_STATE_DIR;
  const stateDir = options.stateDirExplicit
    ? options.stateDir
    : override !== undefined && override !== ""
      ? override
      : options.stateDir;
  return path.join(stateDir, "judge", "decisions.sqlite");
}

function readJudgeRows(sinceIso: string, dbPathOverride?: string): JudgeReportRow[] {
  const dbPath = dbPathOverride ?? defaultJudgeDbPath();
  if (!fs.existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return judgeSection(db, sinceIso);
  } finally {
    db.close();
  }
}

export async function runReport(options: CliOptions, deps: RunDeps): Promise<RunResult> {
  const scorerDir = path.join(options.stateDir, "scorer");
  const reportsDir = path.join(scorerDir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const db = openDb(path.join(scorerDir, "scorer.sqlite"));
  try {
    const files = discoverFiles(options.projectsDir);
    const health = ingestAll(db, files);
    const looked = options.prLookup ? await refreshPrStates(db, deps.lookup, options.until) : 0;
    deps.log(`scorer: ${health.files} files, ${health.lines} new lines, ${looked} PR states looked up`);
    const v = verdict(health);
    const firesLog = readFiresLog(path.join(options.stateDir, "context-guard"));
    const uiEvidenceRuns = readUiEvidenceRuns(path.join(options.stateDir, "ui-evidence", "runs"));
    const outboxState = readOutboxState(path.join(options.stateDir, "judge", "outbox"));
    const metrics = computeMetrics(db, options.since, options.until, firesLog, uiEvidenceRuns, outboxState);
    const judgeRows = readJudgeRows(options.since.toISOString(), deps.judgeDbPath);
    const day = options.until.toISOString().slice(0, 10);
    const markdownPath = path.join(reportsDir, `${day}.md`);
    const jsonPath = path.join(reportsDir, `${day}.json`);
    fs.writeFileSync(markdownPath, renderReport(metrics, v, judgeRows));
    fs.writeFileSync(jsonPath, `${JSON.stringify({ verdict: v, health, metrics, judge: judgeRows }, null, 2)}\n`);
    deps.log(`scorer: wrote ${markdownPath}`);
    return { markdownPath, jsonPath, status: v.status };
  } finally {
    db.close();
  }
}
