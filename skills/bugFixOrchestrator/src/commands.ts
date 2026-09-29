import fs from "node:fs";
import path from "node:path";

import type { Deps } from "./deps.js";
import { readRunEvidence, type RunEvidence } from "./evidence.js";
import { parseHandoff } from "./handoff.js";
import { MAX_ATTEMPTS, TicketSchema, type Candidate, type Mode, type Phase, type State } from "./schema.js";
import { loadState, runsDir, saveState, stateFile } from "./store.js";

export interface Result {
  exitCode: 0 | 1 | 3;
  stdout: string;
  stderr?: string;
}

const ok = (stdout: unknown): Result => ({ exitCode: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout) });
const refuse = (reason: string): Result => ({ exitCode: 3, stdout: "", stderr: `refused: ${reason}` });
const bad = (reason: string): Result => ({ exitCode: 1, stdout: "", stderr: reason });

function transition(dir: string, state: State, deps: Deps, command: string, to: Phase, evidence: string | null): State {
  const next: State = { ...state, phase: to, history: [...state.history, { at: deps.now().toISOString(), command, from: state.phase, to, evidence }] };
  saveState(dir, next);
  return next;
}

function withState(dir: string, fn: (state: State) => Result): Result {
  const state = loadState(dir);
  if ("error" in state) return bad(state.error);
  return fn(state);
}

function requirePhase(state: State, allowed: readonly Phase[]): Result | null {
  if (allowed.includes(state.phase)) return null;
  return refuse(`phase is ${state.phase}; this step needs ${allowed.join(" or ")}`);
}

function isInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function readRun(dir: string, evidencePath: string): RunEvidence | Result {
  const ev = readRunEvidence(evidencePath);
  if ("error" in ev) return refuse(ev.error);
  // A test result only counts when the helper itself ran the command.
  if (ev.kind === "test" && !isInside(evidencePath, runsDir(dir))) return refuse(`test evidence must come from bugfix-state run-test (under ${runsDir(dir)})`);
  return ev;
}

const isEvaluated = (c: Candidate): boolean => c.run !== null && (!c.run.passed || c.judge !== null);
const isEligible = (c: Candidate): boolean => c.run?.passed === true && c.judge?.decision === "resolved";

export function init(dir: string, ticketFile: string, deps: Deps): Result {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(ticketFile, "utf8"));
  } catch {
    return bad(`cannot read ticket JSON: ${ticketFile}`);
  }
  const ticket = TicketSchema.safeParse(raw);
  if (!ticket.success) return bad(`invalid ticket: ${ticket.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const existing = loadState(dir);
  if (!("error" in existing) && (existing.status === "active" || existing.status === "needs-human")) {
    return refuse(`an unfinished bugfix already exists at ${stateFile(dir)} (status ${existing.status}); resume it instead`);
  }
  const state: State = {
    version: 1,
    ticket: ticket.data,
    phase: "intake",
    status: "active",
    attempt: 0,
    attemptMode: null,
    handoff: null,
    check: null,
    baseline: null,
    candidates: [],
    resolvedBy: null,
    history: [{ at: deps.now().toISOString(), command: "init", from: null, to: "intake", evidence: path.resolve(ticketFile) }],
  };
  saveState(dir, state);
  return ok({ state: stateFile(dir) });
}

export function advanceInvestigate(dir: string, handoffPath: string, deps: Deps): Result {
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["intake"]);
    if (wrongPhase) return wrongPhase;
    let md: string;
    try {
      md = fs.readFileSync(handoffPath, "utf8");
    } catch {
      return refuse(`cannot read handoff: ${handoffPath}`);
    }
    const handoff = parseHandoff(md);
    if ("error" in handoff) return refuse(handoff.error);
    if (handoff.status !== "diagnosed") return refuse(`handoff status is "${handoff.status}", expected "diagnosed" (run /rootCause --investigate-only)`);
    if (handoff.hypotheses.length === 0) return refuse("handoff has no hypotheses");
    const abs = path.resolve(handoffPath);
    transition(dir, { ...state, handoff: abs }, deps, "advance investigate", "investigate", abs);
    return ok({ phase: "investigate", hypotheses: handoff.hypotheses.length });
  });
}

export function advanceReproduce(dir: string, evidencePath: string, checkPath: string, cwd: string, deps: Deps): Result {
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["investigate"]);
    if (wrongPhase) return wrongPhase;
    const ev = readRun(dir, evidencePath);
    if ("exitCode" in ev) return ev;
    if (ev.outcome === "passed") return refuse("the baseline check passed on the unfixed code — the bug is not reproduced, so this check cannot prove a fix");
    if (ev.outcome === "broken") return refuse("the baseline run has broken steps and no failed step — a broken selector is not a reproduction; repair the script and re-run");
    if (ev.commit === null) return refuse("the evidence records no commit — pass --app-build $(git rev-parse HEAD) to ui-evidence");
    const head = deps.git(cwd, ["rev-parse", "HEAD"]);
    if (ev.commit !== head) return refuse(`the evidence ran against ${ev.commit}, but ${cwd} is at ${head}`);
    // realpath both sides: git reports the resolved toplevel (/private/var on
    // macOS) while cwd may be a symlinked spelling (/var).
    const root = fs.realpathSync(deps.git(cwd, ["rev-parse", "--show-toplevel"]));
    const resolvedCheck = path.resolve(cwd, checkPath);
    if (!fs.existsSync(resolvedCheck)) return refuse(`check file not found: ${resolvedCheck}`);
    const absCheck = fs.realpathSync(resolvedCheck);
    const sha256 = deps.sha256(absCheck);
    if (ev.checkSha256 !== null && ev.checkSha256 !== sha256) return refuse("the check file changed after the run");
    const abs = path.resolve(evidencePath);
    transition(
      dir,
      { ...state, check: { kind: ev.kind, path: path.relative(root, absCheck), sha256 }, baseline: { evidence: abs, commit: ev.commit } },
      deps,
      "advance reproduce",
      "reproduce",
      abs,
    );
    return ok({ phase: "reproduce", check: path.relative(root, absCheck), baselineCommit: ev.commit });
  });
}

export function startAttempt(dir: string, mode: string, deps: Deps): Result {
  if (mode !== "A" && mode !== "B" && mode !== "C") return bad(`--mode must be A, B or C (got "${mode}")`);
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["reproduce", "evaluate"]);
    if (wrongPhase) return wrongPhase;
    const current = state.candidates.filter((c) => c.attempt === state.attempt);
    const eligible = current.find(isEligible);
    if (eligible) return refuse(`candidate ${eligible.id} already resolves the ticket; run advance report --candidate ${eligible.id}`);
    const pending = current.find((c) => !isEvaluated(c));
    if (pending) return refuse(`candidate ${pending.id} has not been evaluated yet`);
    if (state.attempt >= MAX_ATTEMPTS) return refuse(`attempt cap (${MAX_ATTEMPTS}) reached; run advance report --unresolved`);
    if (mode === "B") {
      if (state.attempt === 0) return refuse("mode B (competing implementers) is the escalation after a failed attempt");
      const handoff = parseHandoff(fs.readFileSync(state.handoff as string, "utf8"));
      const open = "error" in handoff ? 0 : handoff.hypotheses.filter((h) => h.result !== "ruled-out").length;
      if (open < 2) return refuse(`mode B needs at least 2 hypotheses not ruled out; the handoff has ${open}`);
    }
    const attempt = state.attempt + 1;
    transition(dir, { ...state, attempt, attemptMode: mode as Mode, status: "active" }, deps, `start-attempt ${mode}`, "fix", null);
    return ok({ phase: "fix", attempt, mode });
  });
}

export function recordCandidate(dir: string, branch: string, cwd: string, deps: Deps): Result {
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["fix"]);
    if (wrongPhase) return wrongPhase;
    const mode = state.attemptMode as Mode;
    const inAttempt = state.candidates.filter((c) => c.attempt === state.attempt).length;
    const cap = mode === "B" ? 2 : 1;
    if (inAttempt >= cap) return refuse(`mode ${mode} allows ${cap} candidate(s) per attempt`);
    const actualBranch = deps.git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (actualBranch !== branch) return refuse(`${cwd} is on branch ${actualBranch}, not ${branch}`);
    if (deps.git(cwd, ["status", "--porcelain", "--untracked-files=no"]) !== "") return refuse(`${cwd} has uncommitted changes; commit the fix first`);
    const commit = deps.git(cwd, ["rev-parse", "HEAD"]);
    if (commit === (state.baseline as { commit: string }).commit) return refuse("no commits since the baseline — nothing to evaluate");
    const candidate: Candidate = { id: `c${state.candidates.length + 1}`, attempt: state.attempt, mode, branch, cwd: path.resolve(cwd), commit, run: null, judge: null };
    transition(dir, { ...state, candidates: [...state.candidates, candidate] }, deps, `record-candidate ${candidate.id}`, "fix", null);
    return ok({ candidate: candidate.id, commit });
  });
}

function updateCandidate(state: State, next: Candidate): State {
  return { ...state, candidates: state.candidates.map((c) => (c.id === next.id ? next : c)) };
}

export function recordRun(dir: string, candidateId: string, evidencePath: string, deps: Deps): Result {
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["fix", "evaluate"]);
    if (wrongPhase) return wrongPhase;
    const candidate = state.candidates.find((c) => c.id === candidateId);
    if (candidate === undefined) return bad(`unknown candidate: ${candidateId}`);
    if (candidate.run !== null) return refuse(`a run is already recorded for ${candidateId}`);
    const ev = readRun(dir, evidencePath);
    if ("exitCode" in ev) return ev;
    const check = state.check as NonNullable<State["check"]>;
    if (ev.kind !== check.kind) return refuse(`the baseline check was ${check.kind}, this evidence is ${ev.kind}`);
    if (ev.commit !== candidate.commit) return refuse(`the evidence ran against ${ev.commit ?? "no recorded commit"}, not ${candidateId}'s commit ${candidate.commit}`);
    const head = deps.git(candidate.cwd, ["rev-parse", "HEAD"]);
    if (head !== candidate.commit) return refuse(`${candidateId}'s branch moved to ${head} after record-candidate; record a new candidate`);
    const root = deps.git(candidate.cwd, ["rev-parse", "--show-toplevel"]);
    const sha = deps.sha256(path.join(root, check.path));
    // The frozen-check rule: an implementer must not "fix" the bug by
    // weakening the check.
    if (sha !== check.sha256 || (ev.checkSha256 !== null && ev.checkSha256 !== check.sha256)) return refuse(`the check file ${check.path} changed since the baseline`);
    const abs = path.resolve(evidencePath);
    const passed = ev.outcome === "passed";
    transition(dir, updateCandidate(state, { ...candidate, run: { evidence: abs, passed, commit: candidate.commit } }), deps, `record-run ${candidateId}`, "evaluate", abs);
    return ok({ candidate: candidateId, passed, next: passed ? "judge resolution-check, then record-judge" : "start-attempt with the failure reasons" });
  });
}

export function recordJudge(dir: string, candidateId: string, decisionId: string | undefined, escalated: string | undefined, deps: Deps): Result {
  if ((decisionId === undefined) === (escalated === undefined)) return bad("pass exactly one of --decision-id <id> or --escalated <reason_code>");
  return withState(dir, (state) => {
    const wrongPhase = requirePhase(state, ["evaluate"]);
    if (wrongPhase) return wrongPhase;
    const candidate = state.candidates.find((c) => c.id === candidateId);
    if (candidate === undefined) return bad(`unknown candidate: ${candidateId}`);
    if (candidate.run?.passed !== true) return refuse(`${candidateId} has no passing run; judge only runs after the check passes`);
    if (candidate.judge !== null) return refuse(`a judge decision is already recorded for ${candidateId}`);
    if (escalated !== undefined) {
      transition(dir, { ...updateCandidate(state, { ...candidate, judge: { decisionId: null, decision: "escalated", reasonCode: escalated } }), status: "needs-human" }, deps, `record-judge ${candidateId}`, "evaluate", null);
      return ok({ candidate: candidateId, decision: "escalated", status: "needs-human" });
    }
    const row = deps.judgeWhy(decisionId as string);
    if (row === null) return refuse(`judge has no decision ${decisionId}`);
    if (row.question !== "resolution-check") return refuse(`decision ${decisionId} is for ${row.question}, not resolution-check`);
    if (row.undone_at !== null) return refuse(`decision ${decisionId} was undone`);
    const decision = row.decision;
    if (decision !== "resolved" && decision !== "partial" && decision !== "unresolved") return refuse(`decision ${decisionId} has no usable outcome (${String(decision)})`);
    transition(dir, updateCandidate(state, { ...candidate, judge: { decisionId: decisionId as string, decision, reasonCode: row.reason_code } }), deps, `record-judge ${candidateId}`, "evaluate", null);
    return ok({ candidate: candidateId, decision });
  });
}

export function advanceReport(dir: string, candidateId: string | undefined, unresolved: boolean, deps: Deps): Result {
  if ((candidateId === undefined) === !unresolved) return bad("pass exactly one of --candidate <id> or --unresolved");
  return withState(dir, (state) => {
    if (state.phase === "report") return refuse(`already reported (status ${state.status})`);
    if (unresolved) {
      transition(dir, { ...state, status: "unresolved" }, deps, "advance report --unresolved", "report", null);
      return ok({ phase: "report", status: "unresolved" });
    }
    const candidate = state.candidates.find((c) => c.id === candidateId);
    if (candidate === undefined) return bad(`unknown candidate: ${candidateId}`);
    if (!isEligible(candidate)) return refuse(`${candidateId} needs a passing run and a "resolved" judge decision (run: ${candidate.run === null ? "none" : candidate.run.passed ? "passed" : "failed"}, judge: ${candidate.judge?.decision ?? "none"})`);
    transition(dir, { ...state, status: "resolved", resolvedBy: candidate.id }, deps, `advance report ${candidate.id}`, "report", candidate.run!.evidence);
    return ok({ phase: "report", status: "resolved", candidate: candidate.id });
  });
}

export function runTest(dir: string, checkPath: string, cwd: string, argv: string[], deps: Deps): Result {
  if (argv.length === 0) return bad("usage: bugfix-state run-test --state <dir> --check <file> [--cwd <dir>] -- <command...>");
  if (deps.git(cwd, ["status", "--porcelain", "--untracked-files=no"]) !== "") return refuse(`${cwd} has uncommitted changes; commit before running the check so the result maps to a commit`);
  const absCheck = path.resolve(cwd, checkPath);
  if (!fs.existsSync(absCheck)) return refuse(`check file not found: ${absCheck}`);
  const checkSha256 = deps.sha256(absCheck);
  const commit = deps.git(cwd, ["rev-parse", "HEAD"]);
  fs.mkdirSync(runsDir(dir), { recursive: true });
  const stamp = deps.now().toISOString().replace(/[:.]/g, "-");
  const log = path.join(runsDir(dir), `${stamp}-test.log`);
  const exitCode = deps.run(argv, cwd, log);
  const evidence = path.join(runsDir(dir), `${stamp}-test-result.json`);
  fs.writeFileSync(evidence, JSON.stringify({ kind: "test", command: argv, exitCode, commit, checkSha256, log }, null, 2) + "\n");
  return ok({ evidence, exitCode, commit });
}

export function status(dir: string): Result {
  return withState(dir, (state) => ok(JSON.stringify(state, null, 2)));
}

export function nextAction(state: State): string {
  if (state.status === "resolved" || state.status === "unresolved") return `done (${state.status}); write resolution.md if not written`;
  if (state.status === "needs-human") return "ask the user how to proceed: start-attempt, or advance report --unresolved";
  switch (state.phase) {
    case "intake":
      return "run /rootCause --investigate-only, then advance investigate --evidence <handoff.md>";
    case "investigate":
      return "build the check (ui-evidence script or regression test), run it on the unfixed code, then advance reproduce";
    case "reproduce":
      return "start-attempt --mode A or C";
    case "fix": {
      const current = state.candidates.filter((c) => c.attempt === state.attempt);
      if (current.length === 0) return "dispatch the implementer(s), then record-candidate";
      return "run the same check on each candidate, then record-run";
    }
    case "evaluate": {
      const current = state.candidates.filter((c) => c.attempt === state.attempt);
      const eligible = current.find(isEligible);
      if (eligible) return `advance report --candidate ${eligible.id}`;
      const needsRun = current.find((c) => c.run === null);
      if (needsRun) return `run the same check on ${needsRun.id}, then record-run`;
      const needsJudge = current.find((c) => !isEvaluated(c));
      if (needsJudge) return `judge resolution-check for ${needsJudge.id}, then record-judge`;
      if (state.attempt < MAX_ATTEMPTS) return "start-attempt with the failure reasons";
      return "advance report --unresolved";
    }
    default:
      return "done";
  }
}

export function resume(dir: string): Result {
  return withState(dir, (state) => ok({ phase: state.phase, status: state.status, attempt: state.attempt, next: nextAction(state) }));
}
