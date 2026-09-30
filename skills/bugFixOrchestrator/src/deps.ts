import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

// The fields of a `judge why <id>` decision row the gate reads.
export const JudgeDecisionRowSchema = z.object({
  question: z.string(),
  decision: z.string().nullable(),
  reason_code: z.string(),
  undone_at: z.string().nullable(),
  ts: z.string(),
  input_digest: z.string(),
});
export type JudgeDecisionRow = z.infer<typeof JudgeDecisionRowSchema>;

/** A test command that hangs must not hang the orchestrator; a timeout kill counts as a failing run. */
export const RUN_TIMEOUT_MS = 30 * 60_000;
/** judge walks a provider chain with per-provider budgets; bound the whole call. */
export const JUDGE_TIMEOUT_MS = 5 * 60_000;

export interface Deps {
  now: () => Date;
  /** Runs `git -C <cwd> <args>` and returns trimmed stdout; throws on failure. */
  git: (cwd: string, args: string[]) => string;
  sha256: (file: string) => string;
  /** Runs argv in cwd with stdout+stderr sent to logFile; returns the exit code. */
  run: (argv: string[], cwd: string, logFile: string) => number;
  /** Looks up a stored judge decision; null when judge doesn't know the id or returns something unexpected. */
  judgeWhy: (id: string) => JudgeDecisionRow | null;
  /** Runs `judge resolution-check` with the given JSON on stdin. */
  judgeRun: (input: string) => { status: number; stdout: string; stderr: string };
  /** The ui-evidence CLI (dist/bin.js) that run-ui executes. */
  uiEvidenceBin: string;
}

// Installed side by side under the toolkit's skills/ directory.
const siblingUiEvidence = (): string => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "ui-evidence", "dist", "bin.js");

// judgeBin is fixed to `judge` on PATH in bin.ts (no env override: an agent
// could otherwise point the lookup at a script that forges decisions).
export function realDeps(judgeBin = "judge"): Deps {
  return {
    now: () => new Date(),
    git: (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
    sha256: (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    run: (argv, cwd, logFile) => {
      const fd = fs.openSync(logFile, "w");
      try {
        const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: ["ignore", fd, fd], timeout: RUN_TIMEOUT_MS });
        // A command that can't start (ENOENT), times out, or dies on a signal
        // has no status: count it as a failing run, never a passing one.
        return r.status ?? 1;
      } finally {
        fs.closeSync(fd);
      }
    },
    uiEvidenceBin: siblingUiEvidence(),
    judgeRun: (input) => {
      const r = spawnSync(judgeBin, ["resolution-check"], { input, encoding: "utf8", timeout: JUDGE_TIMEOUT_MS });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    judgeWhy: (id) => {
      const r = spawnSync(judgeBin, ["why", id], { encoding: "utf8" });
      if (r.status !== 0) return null;
      try {
        const row = JudgeDecisionRowSchema.safeParse(JSON.parse(r.stdout));
        return row.success ? row.data : null;
      } catch {
        return null;
      }
    },
  };
}
