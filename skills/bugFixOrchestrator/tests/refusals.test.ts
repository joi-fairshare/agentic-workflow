import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/cli.js";
import { nextAction } from "../src/commands.js";
import type { Deps } from "../src/deps.js";
import type { Candidate, State } from "../src/schema.js";
import { loadState, runsDir, saveState } from "../src/store.js";
import { HANDOFF, TICKET, commitFile, git, judgeRow, makeRepo, testDeps, tmpDir, writeJson } from "./helpers.js";

let repo: string;
let dir: string;
let scratch: string;
let deps: Deps;
let head: string;
let checkSha: string;

const run = (...argv: string[]) => main(["--state", dir, ...argv], deps);
const refused = (res: { exitCode: number; stderr?: string }, text: string) => {
  expect(res.stderr ?? "").toContain(text);
  expect(res.exitCode).toBe(3);
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
    investigation: {
      rootCause: "updateProfile() omits phone.",
      hypotheses: [
        { n: 1, text: "PATCH body omits phone", files: ["src/profile/api.ts"], result: "confirmed" },
        { n: 2, text: "Form state drops phone on blur", files: ["src/profile/Form.tsx", "src/profile/state.ts"], result: "untested" },
      ],
    },
    check: { kind: "test", path: "check.sh", sha256: checkSha, command: ["sh", "check.sh"] },
    baseline: { evidence: "b.json", commit: head },
    candidates: [],
    runs: [],
    resolvedBy: null,
    history: [],
    ...overrides,
  };
}

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({ id: "c1", attempt: 1, mode: "A", branch: "main", cwd: repo, commit: head, hypothesis: null, changedFiles: [], judgeInputDigest: null, run: null, judge: null, ...overrides });

/** A ui-evidence summary registered in the current state's run registry, as run-ui would leave it. */
function uiSummary(appBuild: string | null | undefined, status = "failed", scriptSha256: string | null = checkSha): string {
  const file = writeJson(scratch, `ui-${String(appBuild)}-${status}-${String(scriptSha256)}.json`, { steps: [{ status }], scriptSha256, ...(appBuild === undefined ? {} : { appBuild }) });
  const state = loadState(dir) as State;
  saveState(dir, { ...state, runs: [...state.runs, { evidence: file, sha256: deps.sha256(file) }] });
  return file;
}

/** A test result registered in the current state's run registry, as run-test would leave it. */
function registered(fields: Record<string, unknown>): string {
  fs.mkdirSync(runsDir(dir), { recursive: true });
  const file = writeJson(runsDir(dir), `r-${Math.random()}.json`, { kind: "test", command: ["sh", "check.sh"], exitCode: 1, commit: head, checkSha256: checkSha, log: "l", ...fields });
  const state = loadState(dir) as State;
  saveState(dir, { ...state, runs: [...state.runs, { evidence: file, sha256: deps.sha256(file) }] });
  return file;
}

beforeEach(() => {
  repo = makeRepo();
  head = git(repo, "rev-parse", "HEAD");
  scratch = tmpDir();
  dir = path.join(tmpDir(), "state");
  deps = testDeps({
    wrongq: judgeRow("ready", "dg", { question: "brief-scope" }),
    undone: judgeRow("resolved", "dg", { undone_at: "2026-09-29" }),
    nodecision: judgeRow(null, "dg"),
    stale: judgeRow("resolved", "dg", { ts: "2000-01-01T00:00:00Z" }),
    badts: judgeRow("resolved", "dg", { ts: "not a date" }),
    otherinput: judgeRow("resolved", "zz"),
    partial: judgeRow("partial", "dg"),
  });
  checkSha = deps.sha256(path.join(repo, "check.sh"));
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
  const investigate = (file: string) => run("advance", "investigate", "--evidence", path.join(scratch, file));

  it("refuses the wrong phase, an unreadable or malformed handoff, a non-diagnosed status, and no confirmed hypothesis", () => {
    saveState(dir, baseState({ phase: "fix" }));
    refused(investigate("handoff.md"), "phase is fix");
    saveState(dir, baseState());
    refused(investigate("nope.md"), "cannot read handoff");
    fs.writeFileSync(path.join(scratch, "bad.md"), "no status");
    refused(investigate("bad.md"), "no status: line");
    fs.writeFileSync(path.join(scratch, "fixed.md"), HANDOFF.replace("status: diagnosed", "status: fixed"));
    refused(investigate("fixed.md"), 'expected "diagnosed"');
    fs.writeFileSync(path.join(scratch, "unconfirmed.md"), HANDOFF.replace("| High | confirmed |", "| High | ruled-out |"));
    refused(investigate("unconfirmed.md"), "no hypothesis is confirmed");
    fs.writeFileSync(path.join(scratch, "no-rc.md"), HANDOFF.replace(/## Root Cause[\s\S]*$/, ""));
    refused(investigate("no-rc.md"), "no ## Root Cause text");
  });
});

describe("advance reproduce", () => {
  beforeEach(() => saveState(dir, baseState({ phase: "investigate", check: null, baseline: null })));
  const reproduce = (evidence: string, check = "check.sh") => run("advance", "reproduce", "--evidence", evidence, "--check", check, "--cwd", repo);

  it("accepts a failing ui-evidence run tied to HEAD that executed the committed script", () => {
    const sha = commitAndHash("script.json", "{}");
    expect(JSON.parse(reproduce(uiSummary(head, "failed", sha), "script.json").stdout)).toMatchObject({ check: "script.json", baselineCommit: head });
    expect((loadState(dir) as State).check).toMatchObject({ kind: "ui-evidence", command: null });
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

  it("refuses evidence without a check hash, or that executed a different check version", () => {
    refused(reproduce(uiSummary(head, "failed", null)), "records no check hash");
    refused(reproduce(uiSummary(head, "failed", "different")), "different version of the check file");
  });

  it("refuses a check that is missing, outside the repo, untracked, or modified", () => {
    refused(reproduce(uiSummary(head), "missing.sh"), "check file not found");
    const outside = path.join(scratch, "outside.sh");
    fs.writeFileSync(outside, "x");
    refused(reproduce(uiSummary(head), outside), "is outside the repo");
    fs.writeFileSync(path.join(repo, "new.sh"), "x");
    refused(reproduce(uiSummary(head), "new.sh"), "is not committed");
    fs.rmSync(path.join(repo, "new.sh"));
    fs.writeFileSync(path.join(repo, "check.sh"), "edited\n");
    refused(reproduce(uiSummary(head)), "has uncommitted changes");
  });

  it("refuses an unregistered or tampered test result", () => {
    const forged = writeJson(scratch, "forged.json", { kind: "test", command: ["sh", "check.sh"], exitCode: 1, commit: head, checkSha256: checkSha, log: "l" });
    refused(reproduce(forged), "not a registered, unmodified result");
    const unregisteredUi = writeJson(scratch, "hand-written-summary.json", { steps: [{ status: "failed" }], appBuild: head, scriptSha256: checkSha });
    refused(reproduce(unregisteredUi), "not a registered, unmodified result");
    const real = registered({});
    fs.writeFileSync(real, fs.readFileSync(real, "utf8").replace('"exitCode":1', '"exitCode":2'));
    refused(reproduce(real), "not a registered, unmodified result");
  });
});

function commitAndHash(file: string, contents: string): string {
  commitFile(repo, file, contents);
  head = git(repo, "rev-parse", "HEAD");
  return deps.sha256(path.join(repo, file));
}

describe("start-attempt", () => {
  it("rejects an unknown mode as bad usage and refuses the wrong phase", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    expect(run("start-attempt", "--mode", "D")).toMatchObject({ exitCode: 1 });
    saveState(dir, baseState({ phase: "intake" }));
    refused(run("start-attempt", "--mode", "A"), "phase is intake");
  });

  it("refuses while a candidate already resolves the ticket", () => {
    saveState(dir, baseState({ phase: "evaluate", attempt: 1, candidates: [candidate({ run: { evidence: "e", passed: true, commit: head, recordedAt: "t" }, judge: { decisionId: "d", decision: "resolved", reasonCode: "m" } })] }));
    refused(run("start-attempt", "--mode", "A"), "already resolves the ticket");
  });

  it("decides mode B from the snapshot taken at investigate, not the (mutable) handoff file", () => {
    const failed = [candidate({ run: { evidence: "e", passed: false, commit: head, recordedAt: "t" } })];
    fs.writeFileSync(path.join(scratch, "handoff.md"), "rewritten after investigate");
    saveState(dir, baseState({ phase: "evaluate", attempt: 1, candidates: failed }));
    expect(run("start-attempt", "--mode", "B").exitCode).toBe(0);
  });
});

describe("record-candidate", () => {
  it("refuses the wrong phase, the wrong branch, a dirty or untracked tree, and no commits since the baseline", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "phase is reproduce");
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "C" }));
    refused(run("record-candidate", "--branch", "other", "--cwd", repo), "on branch main, not other");
    fs.writeFileSync(path.join(repo, "check.sh"), "dirty\n");
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "uncommitted or untracked");
    git(repo, "checkout", "--", "check.sh");
    fs.writeFileSync(path.join(repo, "stray.txt"), "x");
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "uncommitted or untracked");
    fs.rmSync(path.join(repo, "stray.txt"));
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "no commits since the baseline");
  });

  it("refuses a commit that is already a candidate", () => {
    const fixed = commitFile(repo, "fixed.txt", "ok\n");
    saveState(dir, baseState({ phase: "evaluate", attempt: 2, attemptMode: "B", candidates: [candidate({ commit: fixed, run: { evidence: "e", passed: false, commit: fixed, recordedAt: "t" } })] }));
    refused(run("record-candidate", "--branch", "main", "--cwd", repo), "is already candidate c1");
  });
});

describe("record-run", () => {
  const fixState = (c: Candidate, kind: "test" | "ui-evidence" = "test") =>
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A", candidates: [c], check: { kind, path: "check.sh", sha256: checkSha, command: kind === "test" ? ["sh", "check.sh"] : null } }));

  it("refuses the wrong phase and an already-recorded run; rejects an unknown candidate", () => {
    saveState(dir, baseState({ phase: "reproduce" }));
    refused(run("record-run", "c1", "--evidence", "x"), "phase is reproduce");
    fixState(candidate({ run: { evidence: "e", passed: false, commit: head, recordedAt: "t" } }));
    expect(run("record-run", "c9", "--evidence", "x")).toMatchObject({ exitCode: 1 });
    refused(run("record-run", "c1", "--evidence", "x"), "already recorded");
  });

  it("refuses unreadable evidence, a different check kind, a broken run, and a ui run without a commit", () => {
    fixState(candidate());
    refused(run("record-run", "c1", "--evidence", path.join(scratch, "none.json")), "cannot read evidence");
    refused(run("record-run", "c1", "--evidence", uiSummary(head, "passed")), "baseline check was test");
    fixState(candidate(), "ui-evidence");
    refused(run("record-run", "c1", "--evidence", uiSummary(head, "broken")), "a broken run is not a verdict");
    refused(run("record-run", "c1", "--evidence", uiSummary(undefined, "passed")), "no recorded commit");
  });

  it("refuses a test run with a different command, or whose check hash differs from the baseline", () => {
    fixState(candidate());
    refused(run("record-run", "c1", "--evidence", registered({ exitCode: 0, command: ["sh", "-c", "true check.sh"] })), "differs from the baseline");
    refused(run("record-run", "c1", "--evidence", registered({ exitCode: 0, checkSha256: "different" })), "changed since the baseline");
  });

  it("refuses when the candidate tree is dirty or the check is gone", () => {
    fixState(candidate());
    const ev = registered({ exitCode: 0 });
    fs.writeFileSync(path.join(repo, "stray.txt"), "x");
    refused(run("record-run", "c1", "--evidence", ev), "uncommitted or untracked");
    fs.rmSync(path.join(repo, "stray.txt"));
    git(repo, "rm", "-q", "check.sh");
    git(repo, "commit", "-qm", "drop check");
    head = git(repo, "rev-parse", "HEAD");
    fixState(candidate());
    refused(run("record-run", "c1", "--evidence", registered({ exitCode: 0 })), "changed since the baseline");
  });

  it("records a ui-evidence pass for the candidate's commit", () => {
    fixState(candidate(), "ui-evidence");
    expect(JSON.parse(run("record-run", "c1", "--evidence", uiSummary(head, "passed")).stdout)).toMatchObject({ passed: true });
  });
});

describe("record-judge", () => {
  const passed = (judgeInputDigest: string | null = "dg") => candidate({ judgeInputDigest, run: { evidence: "e", passed: true, commit: head, recordedAt: "2026-09-29T00:00:00Z" } });

  it("needs exactly one of --decision-id / --escalated", () => {
    expect(run("record-judge", "c1")).toMatchObject({ exitCode: 1 });
    expect(run("record-judge", "c1", "--decision-id", "a", "--escalated", "b")).toMatchObject({ exitCode: 1 });
  });

  it("refuses a decision about a different input, or before judge-input ran", () => {
    saveState(dir, baseState({ phase: "evaluate", candidates: [passed()] }));
    refused(run("record-judge", "c1", "--decision-id", "otherinput"), "judged a different input");
    saveState(dir, baseState({ phase: "evaluate", candidates: [passed(null)] }));
    refused(run("record-judge", "c1", "--decision-id", "partial"), "run bugfix-state judge-input c1 first");
  });

  it("refuses the wrong phase, unknown, foreign, undone, stale, unparseable-time, outcome-less and reused decisions", () => {
    saveState(dir, baseState({ phase: "fix", candidates: [passed()] }));
    refused(run("record-judge", "c1", "--decision-id", "partial"), "phase is fix");
    saveState(dir, baseState({ phase: "evaluate", candidates: [passed(), candidate({ id: "c2", commit: "other", judge: { decisionId: "partial", decision: "partial", reasonCode: "m" } })] }));
    expect(run("record-judge", "c9", "--decision-id", "partial")).toMatchObject({ exitCode: 1 });
    refused(run("record-judge", "c1", "--decision-id", "partial"), "already recorded for c2");
    refused(run("record-judge", "c1", "--decision-id", "nope"), "has no decision nope");
    refused(run("record-judge", "c1", "--decision-id", "wrongq"), "is for brief-scope");
    refused(run("record-judge", "c1", "--decision-id", "undone"), "was undone");
    refused(run("record-judge", "c1", "--decision-id", "stale"), "does not postdate c1's run");
    refused(run("record-judge", "c1", "--decision-id", "badts"), "does not postdate c1's run");
    refused(run("record-judge", "c1", "--decision-id", "nodecision"), "no usable outcome (null)");
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
    saveState(dir, baseState({ phase: "evaluate", candidates: [candidate(), candidate({ id: "c2", run: { evidence: "e", passed: false, commit: head, recordedAt: "t" } })] }));
    refused(run("advance", "report", "--candidate", "c1"), "run: none, judge: none");
    refused(run("advance", "report", "--candidate", "c2"), "run: failed");
  });
});

describe("run-test", () => {
  beforeEach(() => saveState(dir, baseState()));

  it("needs a command that references the check, a clean tree, and a committed check file", () => {
    expect(run("run-test", "--check", "check.sh", "--cwd", repo)).toMatchObject({ exitCode: 1 });
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "true"), "must pass the check file (check.sh) as an argument");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "-c", "exit 0 # check.sh"), "as an argument");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "-c", "exit 0", "check.sh"), "inline code (`sh -c`)");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "bash", "-lc", "true", "check.sh"), "inline code (`bash -lc`)");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "/usr/bin/grep", "-q", "x", "check.sh"), "not `grep`");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "python3.12", "-c", "0", "check.sh"), "inline code");
    expect(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "./check.sh").exitCode).toBe(0);
    refused(run("run-test", "--check", "missing.sh", "--cwd", repo, "--", "sh", "missing.sh"), "check file not found");
    fs.writeFileSync(path.join(repo, "check.sh"), "dirty\n");
    refused(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh"), "uncommitted or untracked");
  });

  it("records the observed exit code, HEAD, and check hash, writes a log, and registers the result", () => {
    commitFile(repo, "fixed.txt", "ok\n");
    const out = JSON.parse(run("run-test", "--check", "check.sh", "--cwd", repo, "--", "sh", "check.sh").stdout) as { evidence: string };
    const result = JSON.parse(fs.readFileSync(out.evidence, "utf8")) as { exitCode: number; commit: string; checkSha256: string; log: string };
    expect(result).toMatchObject({ exitCode: 0, commit: git(repo, "rev-parse", "HEAD"), checkSha256: checkSha });
    expect(fs.existsSync(result.log)).toBe(true);
    expect((loadState(dir) as State).runs).toEqual([{ evidence: out.evidence, sha256: deps.sha256(out.evidence) }]);
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

  it("turns an unexpected failure (a non-repo --cwd) into a one-line bad-usage error", () => {
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A" }));
    const res = run("record-candidate", "--branch", "main", "--cwd", tmpDir());
    expect(res.exitCode).toBe(1);
    expect(res.stderr).not.toContain("\n");
    expect(res.stderr).toContain("not a git repository");
  });

  it("reports an Error without stderr by its first line", () => {
    const throwing: Deps = { ...deps, git: () => { throw new Error("first\nsecond"); } };
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A" }));
    expect(main(["--state", dir, "record-candidate", "--branch", "main", "--cwd", repo], throwing)).toMatchObject({ exitCode: 1, stderr: "first" });
  });

  it("reports a non-Error throw as a string", () => {
    const throwing: Deps = { ...deps, git: () => { throw "boom"; } };
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A" }));
    expect(main(["--state", dir, "record-candidate", "--branch", "main", "--cwd", repo], throwing)).toMatchObject({ exitCode: 1, stderr: "boom" });
  });

  it("defaults --cwd to the process cwd", () => {
    saveState(dir, baseState({ phase: "fix", attempt: 1, attemptMode: "A" }));
    expect(run("record-candidate", "--branch", "definitely-not-this-branch").exitCode).not.toBe(0);
  });
});
