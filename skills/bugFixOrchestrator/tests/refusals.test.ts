import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/cli.js";
import { nextAction } from "../src/commands.js";
import type { Deps } from "../src/deps.js";
import type { Candidate, State } from "../src/schema.js";
import { runsDir, saveState } from "../src/store.js";
import { HANDOFF, TICKET, commitFile, git, makeRepo, testDeps, tmpDir, writeJson } from "./helpers.js";

let repo: string;
let dir: string;
let scratch: string;
let deps: Deps;
let head: string;

const run = (...argv: string[]) => main(["--state", dir, ...argv], deps);
const refused = (res: { exitCode: number; stderr?: string }, text: string) => {
  expect(res.exitCode).toBe(3);
  expect(res.stderr).toContain(text);
};

function baseState(overrides: Partial<State> = {}): State {
  return {
    version: 1,
    ticket: { ...TICKET, source: "text" },
    phase: "intake",
    status: "active",
    attempt: 0,
    attemptMode: null,
    handoff: path.join(scratch, "handoff.md"),
    check: { kind: "test", path: "check.sh", sha256: deps.sha256(path.join(repo, "check.sh")) },
    baseline: { evidence: "b.json", commit: head },
    candidates: [],
    resolvedBy: null,
    history: [],
    ...overrides,
  };
}

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({ id: "c1", attempt: 1, mode: "A", branch: "main", cwd: repo, commit: head, run: null, judge: null, ...overrides });

function uiSummary(appBuild: string | null | undefined, status = "failed"): string {
  return writeJson(scratch, `ui-${String(appBuild)}-${status}.json`, { steps: [{ status }], ...(appBuild === undefined ? {} : { appBuild }) });
}

/** A helper-issued test result (inside runs/) with arbitrary fields. */
function testResult(fields: Record<string, unknown>): string {
  fs.mkdirSync(runsDir(dir), { recursive: true });
  return writeJson(runsDir(dir), `r-${Math.random()}.json`, { kind: "test", command: ["x"], exitCode: 1, commit: head, checkSha256: "h", log: "l", ...fields });
}

beforeEach(() => {
  repo = makeRepo();
  head = git(repo, "rev-parse", "HEAD");
  scratch = tmpDir();
  dir = path.join(tmpDir(), "state");
  deps = testDeps({
    wrongq: { question: "brief-scope", decision: "ready", reason_code: "model", undone_at: null },
    undone: { question: "resolution-check", decision: "resolved", reason_code: "model", undone_at: "2026-09-29" },
    nodecision: { question: "resolution-check", decision: null, reason_code: "below-threshold", undone_at: null },
    partial: { question: "resolution-check", decision: "partial", reason_code: "model", undone_at: null },
  });
  fs.writeFileSync(path.join(scratch, "handoff.md"), HANDOFF);
});

describe("init", () => {
  it("rejects unreadable and invalid tickets as bad usage", () => {
    expect(run("init", "--ticket", path.join(scratch, "none.json"))).toMatchObject({ exitCode: 1 });
    const res = run("init", "--ticket", writeJson(scratch, "t.json", { ...TICKET, brief: " " }));
    expect(res).toMatchObject({ exitCode: 1 });
    expect(res.stderr).toContain("brief: brief is empty");
  });

  it("replaces a finished bugfix for the same slug", () => {
    saveState(dir, baseState({ status: "resolved", phase: "report" }));
    expect(run("init", "--ticket", writeJson(scratch, "t.json", TICKET)).exitCode).toBe(0);
  });
});

describe("advance investigate", () => {
  it("refuses the wrong phase, an unreadable or malformed handoff, a non-diagnosed status, and no hypotheses", () => {
    saveState(dir, baseState({ phase: "fix" }));
    refused(run("advance", "investigate", "--evidence", path.join(scratch, "handoff.md")), "phase is fix");
    saveState(dir, baseState());
    refused(run("advance", "investigate", "--evidence", path.join(scratch, "nope.md")), "cannot read handoff");
    fs.writeFileSync(path.join(scratch, "bad.md"), "no status");
    refused(run("advance", "investigate", "--evidence", path.join(scratch, "bad.md")), "no status: line");
    fs.writeFileSync(path.join(scratch, "fixed.md"), HANDOFF.replace("status: diagnosed", "status: fixed"));
    refused(run("advance", "investigate", "--evidence", path.join(scratch, "fixed.md")), 'expected "diagnosed"');
    fs.writeFileSync(path.join(scratch, "empty.md"), "status: diagnosed\n## Hypotheses\n| # | H | F | L | R |\n|---|---|---|---|---|\n");
    refused(run("advance", "investigate", "--evidence", path.join(scratch, "empty.md")), "no hypotheses");
  });
});

describe("advance reproduce", () => {
  beforeEach(() => saveState(dir, baseState({ phase: "investigate", check: null, baseline: null })));
  const reproduce = (evidence: string, check = "check.sh") => run("advance", "reproduce", "--evidence", evidence, "--check", check, "--cwd", repo);

  it("accepts a failing ui-evidence run tied to HEAD and hashes the script itself", () => {
    const script = path.join(repo, "script.json");
    fs.writeFileSync(script, "{}");
    expect(JSON.parse(reproduce(uiSummary(head), "script.json").stdout)).toMatchObject({ check: "script.json", baselineCommit: head });
  });

  it("refuses the wrong phase, unreadable evidence, broken-only runs, runs without a commit, and stale commits", () => {
    saveState(dir, baseState({ phase: "intake" }));
    refused(reproduce(uiSummary(head)), "phase is intake");
    saveState(dir, baseState({ phase: "investigate" }));
    refused(reproduce(path.join(scratch, "none.json")), "cannot read evidence");
    refused(reproduce(uiSummary(head, "broken")), "broken selector is not a reproduction");
    refused(reproduce(uiSummary(undefined)), "records no commit");
    refused(reproduce(uiSummary("0000000")), `is at ${head}`);
  });

  it("refuses a missing check file, and a check edited after run-test", () => {
    refused(reproduce(uiSummary(head), "missing.sh"), "check file not found");
    refused(reproduce(testResult({ checkSha256: "different" })), "changed after the run");
  });
});

describe("start-attempt", () => {
  it("rejects an unknown mode as bad usage and refuses the wrong phase", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    expect(run("start-attempt", "--mode", "D")).toMatchObject({ exitCode: 1 });
    saveState(dir, baseState({ phase: "intake" }));
    refused(run("start-attempt", "--mode", "A"), "phase is intake");
  });

  it("refuses while a candidate already resolves the ticket", () => {
    saveState(dir, baseState({ phase: "evaluate", attempt: 1, candidates: [candidate({ run: { evidence: "e", passed: true, commit: head }, judge: { decisionId: "d", decision: "resolved", reasonCode: "m" } })] }));
    refused(run("start-attempt", "--mode", "A"), "already resolves the ticket");
  });
});

describe("record-candidate", () => {
  it("refuses the wrong phase, the wrong branch, a dirty tree, and no commits since the baseline", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "phase is reproduce");
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "C" }));
    refused(run("record-candidate", "--branch", "other", "--cwd", repo), "on branch main, not other");
    fs.writeFileSync(path.join(repo, "check.sh"), "dirty\n");
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "uncommitted changes");
    git(repo, "checkout", "--", "check.sh");
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "no commits since the baseline");
  });
});

describe("record-run", () => {
  const fixState = (c: Candidate, kind: "test" | "ui-evidence" = "test") =>
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A", candidates: [c], check: { kind, path: "check.sh", sha256: deps.sha256(path.join(repo, "check.sh")) } }));

  it("refuses the wrong phase and an already-recorded run; rejects an unknown candidate", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    refused(run("record-run", "c1", "--evidence", "x"), "phase is reproduce");
    fixState(candidate({ run: { evidence: "e", passed: false, commit: head } }));
    expect(run("record-run", "c9", "--evidence", "x")).toMatchObject({ exitCode: 1 });
    refused(run("record-run", "c1", "--evidence", "x"), "already recorded");
  });

  it("refuses unreadable evidence, a different check kind, and a ui run without a commit", () => {
    fixState(candidate());
    refused(run("record-run", "c1", "--evidence", path.join(scratch, "none.json")), "cannot read evidence");
    refused(run("record-run", "c1", "--evidence", uiSummary(head, "passed")), "baseline check was test");
    fixState(candidate(), "ui-evidence");
    refused(run("record-run", "c1", "--evidence", uiSummary(undefined, "passed")), "no recorded commit");
  });

  it("refuses a run-test result whose check hash differs from the baseline", () => {
    fixState(candidate());
    refused(run("record-run", "c1", "--evidence", testResult({ exitCode: 0, checkSha256: "different" })), "changed since the baseline");
  });

  it("records a ui-evidence pass for the candidate's commit", () => {
    fixState(candidate(), "ui-evidence");
    expect(JSON.parse(run("record-run", "c1", "--evidence", uiSummary(head, "passed")).stdout)).toMatchObject({ passed: true });
  });
});

describe("record-judge", () => {
  const passed = () => candidate({ run: { evidence: "e", passed: true, commit: head } });

  it("needs exactly one of --decision-id / --escalated", () => {
    expect(run("record-judge", "c1")).toMatchObject({ exitCode: 1 });
    expect(run("record-judge", "c1", "--decision-id", "a", "--escalated", "b")).toMatchObject({ exitCode: 1 });
  });

  it("refuses the wrong phase, unknown decisions, other questions, undone and outcome-less decisions", () => {
    saveState(dir, baseState({ phase: "fix", candidates: [passed()] }));
    refused(run("record-judge", "c1", "--decision-id", "partial"), "phase is fix");
    saveState(dir, baseState({ phase: "evaluate", candidates: [passed()] }));
    expect(run("record-judge", "c9", "--decision-id", "partial")).toMatchObject({ exitCode: 1 });
    refused(run("record-judge", "c1", "--decision-id", "nope"), "has no decision nope");
    refused(run("record-judge", "c1", "--decision-id", "wrongq"), "is for brief-scope");
    refused(run("record-judge", "c1", "--decision-id", "undone"), "was undone");
    refused(run("record-judge", "c1", "--decision-id", "nodecision"), "no usable outcome (null)");
    expect(JSON.parse(run("record-judge", "c1", "--decision-id", "partial").stdout)).toMatchObject({ decision: "partial" });
  });
});

describe("advance report", () => {
  it("needs exactly one of --candidate / --unresolved and a known candidate", () => {
    saveState(dir, baseState({ phase: "evaluate" }));
    expect(run("advance", "report")).toMatchObject({ exitCode: 1 });
    expect(run("advance", "report", "--candidate", "c1", "--unresolved")).toMatchObject({ exitCode: 1 });
    expect(run("advance", "report", "--candidate", "c1")).toMatchObject({ exitCode: 1 });
  });

  it("explains why a candidate isn't eligible", () => {
    saveState(dir, baseState({ phase: "evaluate", candidates: [candidate(), candidate({ id: "c2", run: { evidence: "e", passed: false, commit: head } })] }));
    refused(run("advance", "report", "--candidate", "c1"), "run: none, judge: none");
    refused(run("advance", "report", "--candidate", "c2"), "run: failed");
  });
});

describe("run-test", () => {
  beforeEach(() => saveState(dir, baseState()));

  it("needs a command, a clean tree, and an existing check file", () => {
    expect(run("run-test", "--check", "check.sh", "--cwd", repo)).toMatchObject({ exitCode: 1 });
    refused(run("run-test", "--check", "missing.sh", "--cwd", repo, "--", "true"), "check file not found");
    fs.writeFileSync(path.join(repo, "check.sh"), "dirty\n");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "true"), "uncommitted changes");
  });

  it("records the observed exit code, HEAD, and check hash, and writes a log", () => {
    commitFile(repo, "fixed.txt", "ok\n");
    const out = JSON.parse(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh").stdout) as { evidence: string };
    const result = JSON.parse(fs.readFileSync(out.evidence, "utf8")) as { exitCode: number; commit: string; checkSha256: string; log: string };
    expect(result).toMatchObject({ exitCode: 0, commit: git(repo, "rev-parse", "HEAD"), checkSha256: deps.sha256(path.join(repo, "check.sh")) });
    expect(fs.existsSync(result.log)).toBe(true);
  });
});

describe("nextAction", () => {
  it("names the next step for every phase", () => {
    expect(nextAction(baseState())).toContain("/rootCause --investigate-only");
    expect(nextAction(baseState({ phase: "investigate" }))).toContain("build the check");
    expect(nextAction(baseState({ phase: "reproduce" }))).toBe("start-attempt --mode A or C");
    expect(nextAction(baseState({ phase: "report" }))).toBe("done");
    expect(nextAction(baseState({ phase: "report", status: "unresolved" }))).toContain("done (unresolved)");
  });
});

describe("cli", () => {
  it("prints usage for a missing state, command, subcommand, or flag value", () => {
    expect(main(["status"], deps)).toMatchObject({ exitCode: 1 });
    expect(main(["--state", dir], deps)).toMatchObject({ exitCode: 1 });
    expect(run("advance", "sideways")).toMatchObject({ exitCode: 1 });
    expect(run("record-run")).toMatchObject({ exitCode: 1 });
    expect(run("record-judge")).toMatchObject({ exitCode: 1 });
    expect(run("teleport")).toMatchObject({ exitCode: 1 });
    expect(run("init", "--ticket")).toMatchObject({ exitCode: 1, stderr: expect.stringContaining("--ticket needs a value") });
    expect(run("init", "--ticket", "--cwd")).toMatchObject({ exitCode: 1 });
  });

  it("reports missing required flags", () => {
    saveState(dir, baseState());
    for (const argv of [["init"], ["advance", "investigate"], ["advance", "reproduce", "--evidence", "e"], ["start-attempt"], ["record-candidate"], ["record-run", "c1"], ["run-test"]]) {
      const res = run(...argv);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("missing --");
    }
  });

  it("shows status, and reports a missing state as bad usage", () => {
    expect(run("status")).toMatchObject({ exitCode: 1 });
    saveState(dir, baseState());
    expect(JSON.parse(run("status").stdout)).toMatchObject({ phase: "intake" });
  });

  it("defaults --cwd to the process cwd", () => {
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A" }));
    const res = run("record-candidate", "--branch", "definitely-not-this-branch");
    expect(res.exitCode).not.toBe(0);
  });
});
