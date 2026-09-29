import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/cli.js";
import type { Deps } from "../src/deps.js";
import { StateSchema, type State } from "../src/schema.js";
import { HANDOFF, TICKET, commitFile, git, makeRepo, testDeps, tmpDir, writeJson } from "./helpers.js";

let repo: string;
let state: string;
let scratch: string;
let deps: Deps;

const run = (...argv: string[]) => main(["--state", state, ...argv], deps);
const readState = (): State => StateSchema.parse(JSON.parse(fs.readFileSync(path.join(state, "state.json"), "utf8")));
const out = <T>(res: { exitCode: number; stdout: string; stderr?: string }): T => {
  expect(res.stderr ?? "").toBe("");
  return JSON.parse(res.stdout) as T;
};

/** init → investigate with the given handoff text. */
function investigated(handoff = HANDOFF): void {
  out(run("init", "--ticket", writeJson(scratch, "ticket.json", TICKET)));
  fs.writeFileSync(path.join(scratch, "handoff.md"), handoff);
  out(run("advance", "investigate", "--evidence", path.join(scratch, "handoff.md")));
}

/** Commits a ui-evidence script and reproduces through run-ui (fixed.txt absent → the step fails). */
function reproducedWithUi(): string {
  commitFile(repo, "script.json", '{"steps":[]}');
  const baseline = out<{ evidence: string; exitCode: number }>(run("run-ui", "--check", "script.json", "--cwd", repo));
  expect(baseline.exitCode).toBe(2);
  out(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "script.json", "--cwd", repo));
  return git(repo, "rev-parse", "HEAD");
}

beforeEach(() => {
  repo = makeRepo();
  scratch = tmpDir();
  state = path.join(tmpDir(), "bugfix", "phone");
  deps = testDeps();
});

describe("run-ui", { timeout: 30_000 }, () => {
  it("runs ui-evidence on the committed script, registers its summary, and drives the UI path to a passing run", () => {
    investigated();
    const base = reproducedWithUi();
    expect(readState().check).toMatchObject({ kind: "ui-evidence", path: "script.json", command: null });
    out(run("start-attempt", "--mode", "A"));
    git(repo, "checkout", "-q", "-b", "fix", base);
    commitFile(repo, "fixed.txt", "ok\n");
    out(run("record-candidate", "--branch", "fix", "--cwd", repo));
    const after = out<{ evidence: string; exitCode: number }>(run("run-ui", "--check", "script.json", "--cwd", repo));
    expect(after.exitCode).toBe(0);
    expect(out(run("record-run", "c1", "--evidence", after.evidence))).toMatchObject({ passed: true });
  });

  it("refuses a dirty tree or a missing check, and reports a run that wrote no summary", () => {
    investigated();
    fs.writeFileSync(path.join(repo, "stray.txt"), "x");
    expect(run("run-ui", "--check", "check.sh", "--cwd", repo).stderr).toContain("uncommitted or untracked");
    fs.rmSync(path.join(repo, "stray.txt"));
    expect(run("run-ui", "--check", "missing.json", "--cwd", repo).stderr).toContain("check file not found");
    deps = { ...deps, uiEvidenceBin: path.join(scratch, "does-not-exist.js") };
    const res = run("run-ui", "--check", "check.sh", "--cwd", repo);
    expect(res.exitCode).toBe(3);
    expect(res.stderr).toContain("ui-evidence wrote no summary");
  });
});

describe("record-candidate gates", { timeout: 30_000 }, () => {
  beforeEach(() => {
    investigated();
    const baseline = out<{ evidence: string }>(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh"));
    out(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "check.sh", "--cwd", repo));
    out(run("start-attempt", "--mode", "A"));
  });

  it("refuses a commit that doesn't build on the baseline", () => {
    git(repo, "checkout", "-q", "--orphan", "elsewhere");
    commitFile(repo, "fixed.txt", "ok\n", "unrelated root");
    expect(run("record-candidate", "--branch", "elsewhere", "--cwd", repo).stderr).toContain("does not build on the baseline");
  });

  it("refuses an empty commit whose tree equals the baseline's", () => {
    git(repo, "commit", "-q", "--allow-empty", "-m", "nothing");
    expect(run("record-candidate", "--branch", "main", "--cwd", repo).stderr).toContain("identical to the baseline's");
  });

  it("refuses fixture/test/config changes unless the user approved them", () => {
    fs.mkdirSync(path.join(repo, "tests", "fixtures"), { recursive: true });
    commitFile(repo, "fixed.txt", "ok\n");
    commitFile(repo, "tests/fixtures/user.json", "{}");
    commitFile(repo, "vitest.config.ts", "export default {}");
    const res = run("record-candidate", "--branch", "main", "--cwd", repo);
    expect(res.stderr).toContain("tests/fixtures/user.json, vitest.config.ts");
    out(run("record-candidate", "--branch", "main", "--cwd", repo, "--allow-test-changes"));
    expect(readState().candidates[0].changedFiles).toEqual(["fixed.txt", "tests/fixtures/user.json", "vitest.config.ts"]);
  });

  it("treats files beside a check in a subdirectory as protected", () => {
    // A fresh bugfix whose check lives in checks/.
    state = path.join(tmpDir(), "bugfix", "sub");
    fs.mkdirSync(path.join(repo, "checks"));
    commitFile(repo, "checks/phone.sh", "test -f fixed.txt\n");
    investigated();
    const baseline = out<{ evidence: string }>(run("run-test", "--check", "checks/phone.sh", "--cwd", repo, "--", "sh", "checks/phone.sh"));
    out(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "checks/phone.sh", "--cwd", repo));
    out(run("start-attempt", "--mode", "A"));
    commitFile(repo, "checks/helper.sh", "true\n");
    commitFile(repo, "fixed.txt", "ok\n");
    expect(run("record-candidate", "--branch", "main", "--cwd", repo).stderr).toContain("(checks/helper.sh)");
  });

  it("validates --hypothesis against the handoff", () => {
    commitFile(repo, "fixed.txt", "ok\n");
    expect(run("record-candidate", "--branch", "main", "--cwd", repo, "--hypothesis", "x")).toMatchObject({ exitCode: 1 });
    expect(run("record-candidate", "--branch", "main", "--cwd", repo, "--hypothesis", "9").stderr).toContain("has no hypothesis 9");
    out(run("record-candidate", "--branch", "main", "--cwd", repo, "--hypothesis", "2"));
    expect(readState().candidates[0].hypothesis).toBe(2);
  });

  it("refuses a ruled-out hypothesis", () => {
    fs.writeFileSync(path.join(scratch, "handoff.md"), HANDOFF.replace("| Medium | untested |", "| Medium | ruled-out |"));
    commitFile(repo, "fixed.txt", "ok\n");
    expect(run("record-candidate", "--branch", "main", "--cwd", repo, "--hypothesis", "2").stderr).toContain("hypothesis 2 was ruled out");
    fs.writeFileSync(path.join(scratch, "handoff.md"), "garbage");
    expect(run("record-candidate", "--branch", "main", "--cwd", repo, "--hypothesis", "1").stderr).toContain("has no hypothesis 1");
  });
});

describe("judge-input", { timeout: 30_000 }, () => {
  function evaluated(handoff = HANDOFF): { base: string; commit: string } {
    investigated(handoff);
    const baseline = out<{ evidence: string }>(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh"));
    out(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "check.sh", "--cwd", repo));
    const base = git(repo, "rev-parse", "HEAD");
    out(run("start-attempt", "--mode", "A"));
    const commit = commitFile(repo, "fixed.txt", "ok\n");
    out(run("record-candidate", "--branch", "main", "--cwd", repo));
    return { base, commit };
  }

  it("builds the judge input from state in schema order and records the digest judge will store", () => {
    const { base, commit } = evaluated();
    expect(run("judge-input", "c1", "--summary", "s").stderr).toContain("phase is fix");
    out(run("record-run", "c1", "--evidence", out<{ evidence: string }>(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh")).evidence));
    const res = out<{ input: string; digest: string }>(run("judge-input", "c1", "--summary", "check.sh passes"));
    const text = fs.readFileSync(res.input, "utf8");
    const input = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(input)).toEqual(["brief", "expected", "actual", "rootCause", "checkKind", "checkSummary", "beforePassed", "afterPassed", "diffStat"]);
    expect(input).toMatchObject({ brief: TICKET.brief, rootCause: "updateProfile() omits phone.", checkKind: "test", beforePassed: false, afterPassed: true });
    expect(input.diffStat).toBe(git(repo, "diff", "--stat", base, commit));
    expect(res.digest).toBe(createHash("sha256").update(text).digest("hex").slice(0, 16));
    expect(readState().candidates[0].judgeInputDigest).toBe(res.digest);
  });

  const passingRun = () => out<{ evidence: string }>(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh")).evidence;

  it("rejects an unknown candidate and missing arguments, and tolerates a handoff with no Root Cause section", () => {
    evaluated(HANDOFF.replace(/## Root Cause[\s\S]*$/, ""));
    out(run("record-run", "c1", "--evidence", passingRun()));
    expect(run("judge-input", "c9", "--summary", "s")).toMatchObject({ exitCode: 1 });
    expect(run("judge-input")).toMatchObject({ exitCode: 1 });
    expect(run("judge-input", "c1").stderr).toContain("missing --summary");
    const res = out<{ input: string }>(run("judge-input", "c1", "--summary", "s"));
    expect(JSON.parse(fs.readFileSync(res.input, "utf8"))).toMatchObject({ rootCause: "" });
  });

  it("refuses a candidate whose run failed", () => {
    investigated();
    const baseline = out<{ evidence: string }>(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh"));
    out(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "check.sh", "--cwd", repo));
    out(run("start-attempt", "--mode", "A"));
    commitFile(repo, "wrong.txt", "x\n");
    out(run("record-candidate", "--branch", "main", "--cwd", repo));
    expect(out(run("record-run", "c1", "--evidence", passingRun()))).toMatchObject({ passed: false });
    expect(run("judge-input", "c1", "--summary", "s").stderr).toContain("no passing run");
  });
});
