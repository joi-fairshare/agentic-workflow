import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { realDeps, type Deps, type JudgeDecisionRow } from "../src/deps.js";

export function tmpDir(prefix = "bugfix-state-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

/** A real git repo whose check (`check.sh`) fails until `fixed.txt` exists. */
export function makeRepo(): string {
  const repo = tmpDir("bugfix-repo-");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  fs.writeFileSync(path.join(repo, "check.sh"), "test -f fixed.txt\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  return repo;
}

export function commitFile(repo: string, file: string, contents: string, message = `add ${file}`): string {
  fs.writeFileSync(path.join(repo, file), contents);
  git(repo, "add", file);
  git(repo, "commit", "-qm", message);
  return git(repo, "rev-parse", "HEAD");
}

export const TICKET = {
  source: "text",
  id: null,
  title: "Saving a profile drops the phone number",
  brief: "Saving a profile drops the phone number.\nEdit profile, set phone, save, reload: phone is empty.",
  expected: "The phone number persists after save and reload.",
  actual: "The phone number is empty after reload.",
};

export function writeJson(dir: string, name: string, value: unknown): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

export const HANDOFF = `# Handoff: phone-dropped

status: diagnosed
report: /tmp/report.md
boundary: src/profile
repro: sh check.sh

## Hypotheses

| # | Hypothesis | Cause-site files | Likelihood | Result |
|---|-----------|------------------|------------|--------|
| 1 | PATCH body omits phone | \`src/profile/api.ts\` | High | confirmed |
| 2 | Form state drops phone on blur | \`src/profile/Form.tsx\`, \`src/profile/state.ts\` | Medium | untested |

## Root Cause
updateProfile() omits phone.
`;

/**
 * A stand-in for the ui-evidence CLI (run with node): writes summary.json
 * whose single step passes once fixed.txt exists, recording --app-build and
 * the script's sha256 like the real CLI does.
 */
export function fakeUiEvidence(): string {
  const file = path.join(tmpDir("fake-uie-"), "bin.js");
  fs.writeFileSync(
    file,
    `const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const [script, runDir, , appBuild] = process.argv.slice(2);
fs.mkdirSync(runDir, { recursive: true });
const status = fs.existsSync(path.join(process.cwd(), "fixed.txt")) ? "passed" : "failed";
const scriptSha256 = crypto.createHash("sha256").update(fs.readFileSync(script)).digest("hex");
fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify({ steps: [{ status }], appBuild, scriptSha256 }));
process.exit(status === "passed" ? 0 : 2);
`,
  );
  return file;
}

let tick = 0;
/** Real git/fs/process deps, a monotonically increasing clock, a stubbed judge lookup (mutable map), and a fake ui-evidence. */
export function testDeps(judge: Record<string, JudgeDecisionRow> = {}): Deps {
  return { ...realDeps(), now: () => new Date(Date.UTC(2026, 8, 29, 0, 0, tick++)), judgeWhy: (id) => judge[id] ?? null, uiEvidenceBin: fakeUiEvidence() };
}

/** A judge row for a resolution-check decision about the given input digest. */
export const judgeRow = (decision: string | null, inputDigest: string, extra: Partial<JudgeDecisionRow> = {}): JudgeDecisionRow => ({
  question: "resolution-check", decision, reason_code: "model", undone_at: null, ts: "2099-01-01T00:00:00Z", input_digest: inputDigest, ...extra,
});
