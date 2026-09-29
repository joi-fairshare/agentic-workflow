import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

/** The fields of a `judge why --json`-style decision row the gate reads. */
export interface JudgeDecisionRow {
  question: string;
  decision: string | null;
  reason_code: string;
  undone_at: string | null;
}

export interface Deps {
  now: () => Date;
  /** Runs `git -C <cwd> <args>` and returns trimmed stdout; throws on failure. */
  git: (cwd: string, args: string[]) => string;
  sha256: (file: string) => string;
  /** Runs argv in cwd with stdout+stderr sent to logFile; returns the exit code. */
  run: (argv: string[], cwd: string, logFile: string) => number;
  /** Looks up a stored judge decision; null when judge doesn't know the id. */
  judgeWhy: (id: string) => JudgeDecisionRow | null;
}

export function realDeps(judgeBin = "judge"): Deps {
  return {
    now: () => new Date(),
    git: (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
    sha256: (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    run: (argv, cwd, logFile) => {
      const fd = fs.openSync(logFile, "w");
      try {
        const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: ["ignore", fd, fd] });
        // A command that can't start (ENOENT) or dies on a signal has no
        // status: count it as a failing run, never a passing one.
        return r.status ?? 1;
      } finally {
        fs.closeSync(fd);
      }
    },
    judgeWhy: (id) => {
      const r = spawnSync(judgeBin, ["why", id], { encoding: "utf8" });
      if (r.status !== 0) return null;
      try {
        return JSON.parse(r.stdout) as JudgeDecisionRow;
      } catch {
        return null;
      }
    },
  };
}
