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

const row = (decision: string) => ({ question: "resolution-check", decision, reason_code: "model", undone_at: null, ts: "2099-01-01T00:00:00Z" });
const judgeRows = { "d-resolved": row("resolved"), "d-partial-1": row("partial"), "d-partial-2": row("partial"), "d-partial-3": row("partial") };

const run = (...argv: string[]) => main(["--state", state, ...argv], deps);
const readState = (): State => StateSchema.parse(JSON.parse(fs.readFileSync(path.join(state, "state.json"), "utf8")));
const stateBytes = () => fs.readFileSync(path.join(state, "state.json"), "utf8");
const runTest = (cwd = repo) => JSON.parse(run("run-test", "--check", "check.sh", "--cwd", cwd, "--", "sh", "check.sh").stdout) as { evidence: string; exitCode: number; commit: string };

/** Drives a fresh state to phase `reproduce` with a failing baseline. */
function toReproduced(): void {
  expect(run("init", "--ticket", writeJson(scratch, "ticket.json", TICKET)).exitCode).toBe(0);
  fs.writeFileSync(path.join(scratch, "handoff.md"), HANDOFF);
  expect(run("advance", "investigate", "--evidence", path.join(scratch, "handoff.md")).exitCode).toBe(0);
  const baseline = runTest();
  expect(baseline.exitCode).not.toBe(0);
  expect(run("advance", "reproduce", "--evidence", baseline.evidence, "--check", "check.sh", "--cwd", repo).exitCode).toBe(0);
}

/** Starts an attempt and records a candidate that creates fixed.txt on a branch. */
function fixCandidate(branch: string, mode = "A"): string {
  expect(run("start-attempt", "--mode", mode).exitCode).toBe(0);
  git(repo, "checkout", "-q", "-B", branch, "main");
  commitFile(repo, "fixed.txt", "ok\n", `fix on ${branch}`);
  const res = run("record-candidate", "--branch", branch, "--cwd", repo);
  expect(res.exitCode).toBe(0);
  return (JSON.parse(res.stdout) as { candidate: string }).candidate;
}

beforeEach(() => {
  repo = makeRepo();
  scratch = tmpDir();
  state = path.join(tmpDir(), "bugfix", "phone");
  deps = testDeps(judgeRows);
});

describe("bugfix-state journey", () => {
  it("walks intake → report(resolved) and records one history entry per transition", () => {
    toReproduced();
    expect(readState().baseline?.commit).toBe(git(repo, "rev-parse", "HEAD"));
    const c = fixCandidate("bugfix/phone");
    const after = runTest();
    expect(after.exitCode).toBe(0);
    expect(after.commit).toBe(git(repo, "rev-parse", "HEAD"));
    expect(JSON.parse(run("record-run", c, "--evidence", after.evidence).stdout)).toMatchObject({ passed: true });
    expect(JSON.parse(run("resume").stdout)).toMatchObject({ phase: "evaluate", next: `judge resolution-check for ${c}, then record-judge` });
    expect(run("record-judge", c, "--decision-id", "d-resolved").exitCode).toBe(0);
    expect(JSON.parse(run("resume").stdout).next).toBe(`advance report --candidate ${c}`);
    expect(JSON.parse(run("advance", "report", "--candidate", c).stdout)).toMatchObject({ status: "resolved" });
    const final = readState();
    expect(final).toMatchObject({ phase: "report", status: "resolved", resolvedBy: c });
    expect(final.history.map((h) => h.to)).toEqual(["intake", "investigate", "reproduce", "fix", "fix", "evaluate", "evaluate", "report"]);
    expect(final.ticket.brief).toBe(TICKET.brief);
    expect(JSON.parse(run("resume").stdout).next).toContain("done (resolved)");
    expect(run("advance", "report", "--unresolved")).toMatchObject({ exitCode: 3 });
  });

  it("refuses a baseline that passes on the unfixed code, without writing state", () => {
    run("init", "--ticket", writeJson(scratch, "ticket.json", TICKET));
    fs.writeFileSync(path.join(scratch, "handoff.md"), HANDOFF);
    run("advance", "investigate", "--evidence", path.join(scratch, "handoff.md"));
    commitFile(repo, "fixed.txt", "already\n");
    const evidence = runTest().evidence;
    const before = stateBytes();
    const res = run("advance", "reproduce", "--evidence", evidence, "--check", "check.sh", "--cwd", repo);
    expect(res).toMatchObject({ exitCode: 3 });
    expect(res.stderr).toContain("not reproduced");
    expect(stateBytes()).toBe(before);
  });

  it("refuses a run whose check file changed since the baseline", () => {
    toReproduced();
    const c = fixCandidate("bugfix/phone");
    git(repo, "checkout", "-q", "-b", "weakened");
    commitFile(repo, "check.sh", "true\n", "weaken the check");
    const res = run("record-run", c, "--evidence", runTest().evidence);
    expect(res).toMatchObject({ exitCode: 3 });
    expect(res.stderr).toContain(`not ${c}'s commit`);
  });

  it("refuses when the candidate branch rewrites the check itself", () => {
    toReproduced();
    expect(run("start-attempt", "--mode", "A").exitCode).toBe(0);
    git(repo, "checkout", "-q", "-B", "cheat", "main");
    commitFile(repo, "check.sh", "true\n", "weaken the check");
    run("record-candidate", "--branch", "cheat", "--cwd", repo);
    const evidence = runTest().evidence;
    const before = stateBytes();
    const res = run("record-run", "c1", "--evidence", evidence);
    expect(res).toMatchObject({ exitCode: 3 });
    expect(res.stderr).toContain("changed since the baseline");
    expect(stateBytes()).toBe(before);
  });

  it("refuses evidence from a commit other than the candidate's, and a branch that moved", () => {
    toReproduced();
    const c = fixCandidate("bugfix/phone");
    const stale = runTest();
    commitFile(repo, "extra.txt", "x\n");
    expect(run("record-run", c, "--evidence", runTest().evidence).stderr).toContain(`not ${c}'s commit`);
    expect(run("record-run", c, "--evidence", stale.evidence).stderr).toContain("moved to");
  });

  it("refuses a hand-written test result outside the helper's runs dir", () => {
    toReproduced();
    const c = fixCandidate("bugfix/phone");
    const forged = writeJson(scratch, "forged.json", { kind: "test", command: ["true"], exitCode: 0, commit: git(repo, "rev-parse", "HEAD"), checkSha256: "x", log: "x" });
    expect(run("record-run", c, "--evidence", forged).stderr).toContain("must come from bugfix-state run-test");
  });

  it("caps attempts at 3 and then only allows an unresolved report", () => {
    toReproduced();
    for (let i = 1; i <= 3; i++) {
      const c = fixCandidate(`try-${i}`);
      run("record-run", c, "--evidence", runTest().evidence);
      expect(run("record-judge", c, "--decision-id", `d-partial-${i}`).exitCode).toBe(0);
      expect(run("advance", "report", "--candidate", c)).toMatchObject({ exitCode: 3 });
    }
    expect(JSON.parse(run("resume").stdout).next).toBe("advance report --unresolved");
    const res = run("start-attempt", "--mode", "A");
    expect(res).toMatchObject({ exitCode: 3 });
    expect(res.stderr).toContain("attempt cap (3)");
    expect(JSON.parse(run("advance", "report", "--unresolved").stdout)).toMatchObject({ status: "unresolved" });
  });

  it("allows mode B only after a failed attempt with two open hypotheses, and two candidates per B attempt", () => {
    toReproduced();
    expect(run("start-attempt", "--mode", "B").stderr).toContain("escalation after a failed attempt");
    // Attempt 1 (A): the fix doesn't work — check still fails.
    run("start-attempt", "--mode", "A");
    git(repo, "checkout", "-q", "-B", "a1", "main");
    commitFile(repo, "wrong.txt", "x\n");
    run("record-candidate", "--branch", "a1", "--cwd", repo);
    expect(run("record-candidate", "--branch", "a1", "--cwd", repo).stderr).toContain("mode A allows 1");
    expect(JSON.parse(run("resume").stdout).next).toBe("run the same check on each candidate, then record-run");
    expect(JSON.parse(run("record-run", "c1", "--evidence", runTest().evidence).stdout)).toMatchObject({ passed: false });
    expect(run("record-judge", "c1", "--decision-id", "d-resolved").stderr).toContain("no passing run");
    expect(JSON.parse(run("resume").stdout).next).toBe("start-attempt with the failure reasons");
    // Attempt 2 (B): two competing candidates.
    expect(run("start-attempt", "--mode", "B").exitCode).toBe(0);
    expect(JSON.parse(run("resume").stdout).next).toBe("dispatch the implementer(s), then record-candidate");
    git(repo, "checkout", "-q", "-B", "b1", "main");
    commitFile(repo, "fixed.txt", "ok\n");
    expect(run("record-candidate", "--branch", "b1", "--cwd", repo).exitCode).toBe(0);
    git(repo, "checkout", "-q", "-B", "b2", "main");
    commitFile(repo, "fixed.txt", "ok too\n");
    expect(run("record-candidate", "--branch", "b2", "--cwd", repo).exitCode).toBe(0);
    expect(run("record-candidate", "--branch", "b2", "--cwd", repo).stderr).toContain("mode B allows 2");
    // b2 (c3) is checked out, so evaluate it; b1 (c2) is still pending.
    expect(JSON.parse(run("record-run", "c3", "--evidence", runTest().evidence).stdout)).toMatchObject({ passed: true });
    expect(JSON.parse(run("resume").stdout).next).toBe("run the same check on c2, then record-run");
    expect(run("start-attempt", "--mode", "A").stderr).toContain("c2 has not been evaluated");
  });

  it("refuses mode B when fewer than two hypotheses remain open", () => {
    run("init", "--ticket", writeJson(scratch, "ticket.json", TICKET));
    fs.writeFileSync(path.join(scratch, "handoff.md"), HANDOFF.replace("| Medium | untested |", "| Medium | ruled-out |"));
    run("advance", "investigate", "--evidence", path.join(scratch, "handoff.md"));
    run("advance", "reproduce", "--evidence", runTest().evidence, "--check", "check.sh", "--cwd", repo);
    run("start-attempt", "--mode", "A");
    git(repo, "checkout", "-q", "-B", "a1", "main");
    commitFile(repo, "wrong.txt", "x\n");
    run("record-candidate", "--branch", "a1", "--cwd", repo);
    expect(JSON.parse(run("record-run", "c1", "--evidence", runTest().evidence).stdout)).toMatchObject({ passed: false });
    expect(run("start-attempt", "--mode", "B").stderr).toContain("the handoff has 1");
    fs.writeFileSync(path.join(scratch, "handoff.md"), "garbage");
    expect(run("start-attempt", "--mode", "B").stderr).toContain("the handoff has 0");
  });

  it("records an escalated judge as needs-human, and a new attempt clears it", () => {
    toReproduced();
    const c = fixCandidate("bugfix/phone");
    run("record-run", c, "--evidence", runTest().evidence);
    expect(JSON.parse(run("record-judge", c, "--escalated", "below-threshold").stdout)).toMatchObject({ status: "needs-human" });
    expect(JSON.parse(run("resume").stdout).next).toContain("ask the user");
    expect(run("record-judge", c, "--decision-id", "d-resolved").stderr).toContain("already recorded");
    expect(run("init", "--ticket", writeJson(scratch, "t2.json", TICKET)).stderr).toContain("unfinished bugfix");
    expect(JSON.parse(run("start-attempt", "--mode", "A").stdout)).toMatchObject({ attempt: 2 });
    expect(readState().status).toBe("active");
  });
});
