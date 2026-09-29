---
name: bugFixOrchestrator
description: Drive a bug ticket (Linear ID/URL or pasted text) to a proven resolution — investigate with /rootCause, have implementer subagents fix it, and call it resolved only when the same check that failed before the fix passes after it AND judge resolution-check agrees the reported problem is solved.
argument-hint: "<linear-issue-id-or-url | pasted ticket text>"
allowed-tools: Bash(git *), Bash(node *), Bash(npm *), Bash(npx *), Bash(jq *), Bash(judge *), Bash(bash *), Bash(source *), Bash(with_stack_lock_and_heavy_job_lock *), Bash(SHARED_DIR=*), Bash(TK=*), Bash(BFS_JS=*), Bash(REPO=*), Bash(STATE=*), Bash(echo *), Bash(mkdir *), Bash(cat *), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__claude_ai_Linear__get_issue, mcp__claude_ai_Linear__save_comment
---

<!-- preamble -->
**Before anything else:** read `$HOME/.agentic-workflow/toolkit/skills/_preamble.md` and follow it (skill index, provider capability map, bootstrap check, session context). Run its **Session Close** section when this skill finishes.

# Bug Fix Orchestrator

You are the **orchestrator**. You never edit product code yourself: you dispatch, read evidence, and
decide. "Tests pass" is never enough — a ticket is resolved only when:

1. the **same** check that failed on the unfixed code passes on the fixed code, and
2. `judge resolution-check` returns `resolved` for the ticket's brief as reported.

Every phase change goes through the `bugfix-state` helper, which owns the state file and **refuses**
(exit 3) any step the rules don't allow. On a refusal, report the reason to the user and follow it —
never work around the helper, edit `state.json`, or write or edit evidence files (`summary.json`,
test results, judge input) yourself. Evidence comes only from `bugfix-state run-ui` and `run-test`,
and the judge input only from `bugfix-state judge-input` — the helper refuses anything else.

Design: `$HOME/.agentic-workflow/toolkit/docs/superpowers/specs/2026-09-29-bug-fix-orchestrator-design.md`.

## Setup

Re-run this block at the top of every shell call (shell state does not persist):

```bash
TK="$HOME/.agentic-workflow/toolkit"
SHARED_DIR="$TK/skills/_shared"
source "$SHARED_DIR/repo-slug.sh"
source "$TK/skills/ui-evidence/scripts/lib/locks.sh"   # with_stack_lock_and_heavy_job_lock
BFS_JS="$TK/skills/bugFixOrchestrator/dist/bin.js"
REPO="$(git rev-parse --show-toplevel)"
STATE="$AW_DIR/bugfix/<ticket-slug>"   # <ticket-slug>: Linear id lowercased (eng-123) or a short kebab summary
mkdir -p "$STATE"
```

Call the helper as `node "$BFS_JS" <command> --state "$STATE" …`. If `dist/bin.js` is missing, run
`npm ci && npm run build` in `$TK/skills/bugFixOrchestrator` (or re-run `setup.sh`).

**Resume first:** if `$STATE/state.json` exists, run `node "$BFS_JS" resume --state "$STATE"` and
continue from the `next` action it prints. Its answer overrides your memory of where you were.

**One heavy job at a time:** every test run, `ui-evidence` run, or dependency install goes through
`with_stack_lock_and_heavy_job_lock 120 <command…>` — never two at once.

**Dispatch briefs:** the brief-scope gate reads each subagent prompt. Every dispatch below must
contain explicit `Goal:`, `Acceptance criteria:` and `Proof command:` lines.

## Phase 1 — Intake

1. Linear ID or URL → `mcp: linear/get_issue`. Otherwise use the pasted text.
2. Write `$STATE/ticket.json`:
   ```json
   { "source": "linear|text", "id": "ENG-123 or null", "title": "...",
     "brief": "<title + full description, VERBATIM — do not summarise or edit>",
     "expected": "<the expected behaviour>", "actual": "<the observed behaviour>" }
   ```
   If the ticket has no clear expected behaviour, **Ask the user** once for it — that sentence is the
   acceptance target for everything after it.
3. `node "$BFS_JS" init --state "$STATE" --ticket "$STATE/ticket.json"`

## Phase 2 — Investigate

1. **Invoke skill `rootCause`** with args `--investigate-only --depth 1 "<symptom from the brief>"`.
2. Take `handoff_path` from rootCause's final JSON block, then
   `node "$BFS_JS" advance investigate --state "$STATE" --evidence <handoff_path>`.
3. Refused with "no hypothesis is confirmed" (rootCause returned `unfixed`) → **Ask the user**:
   re-investigate with more context, or stop. Never fix an unconfirmed cause.

## Phase 3 — Reproduce (the check must FAIL first)

Create the working branch — **never commit to the base branch**: `git checkout -b bugfix/<ticket-slug>`.
The check is committed here; that commit is the **baseline**, and every candidate starts from it.

**UI bug** (rootCause's repro steps are navigate/click/fill against the web app):

1. `bash "$TK/skills/ui-evidence/scripts/doctor.sh"` — stop and tell the user if the stack is unhealthy.
2. **Spawn a subagent** of type `qa-runner`. It is read-only and returns a script plan as JSON; there
   is no PR diff, so give it rootCause's repro steps and the route map instead. Every step's
   `expectedState` must come from the ticket's **expected** behaviour, not the current behaviour.
3. Write the returned JSON to `$REPO/.ui-evidence/<ticket-slug>.json` and commit it.
4. Run it on the unfixed code through the helper, which runs ui-evidence itself (with
   `--app-build` set to `HEAD`) and registers the summary:
   `with_stack_lock_and_heavy_job_lock 120 node "$BFS_JS" run-ui --state "$STATE" --check .ui-evidence/<ticket-slug>.json --cwd "$REPO"`
   Evidence = the printed `evidence` path.

**Anything else:**

1. **Spawn a subagent** of type `lean-coder` to write **only** a regression test for the expected
   behaviour — no fix — and commit it on `bugfix/<ticket-slug>`. (`Goal:` a failing regression test
   for <expected behaviour>; `Acceptance criteria:` fails on the current code for the reported reason,
   committed, no product code changed; `Proof command:` the test command for that file.)
2. Run it through the helper, which executes the command itself and registers the result:
   `with_stack_lock_and_heavy_job_lock 120 node "$BFS_JS" run-test --state "$STATE" --check <test-file> --cwd "$REPO" -- <test command with the test file as its own argument>`
   Evidence = the printed `evidence` path. Use this **exact** command for every later run of the check.

Then: `node "$BFS_JS" advance reproduce --state "$STATE" --evidence <evidence> --check <script-or-test-file> --cwd "$REPO"`

- Refused because the check **passed** → the bug is not reproduced. **Ask the user**: refine the
  check, or stop. A check that already passes can never prove a fix.
- Refused because steps are **broken** (selector problem, no failed step) → have `qa-runner` repair
  the script once, commit, and re-run; if still broken, **Ask the user**.

From here on the check is **frozen**: the helper refuses any later run whose check file, executed
script, or test command differs from the baseline. Implementers must never edit it.

## Phase 4 — Fix

Choose the mode, then `node "$BFS_JS" start-attempt --state "$STATE" --mode <A|B|C>`:

| Mode | When | Dispatch |
|------|------|----------|
| **B** competing | A previous attempt failed **and** the handoff has ≥ 2 hypotheses not ruled out (the helper enforces both) | 2 implementers, each on a **different** open hypothesis, each in its own worktree — **Dispatch in parallel**. Re-dispatch the hypothesis whose fix just failed only if the failure reasons point at the implementation, not the hypothesis |
| **C** split | The confirmed hypothesis's cause-site files span more than one area (e.g. an API route and a UI component) | One implementer per area, **in sequence** on one worktree, each given the previous one's diff |
| **A** single | Otherwise | One implementer in one worktree |

Create each worktree from the **baseline commit** (`node "$BFS_JS" status --state "$STATE"` shows
`baseline.commit`), never from a failed attempt:

- A and C: `git worktree add -b bugfix/<ticket-slug>-a<attempt> <path> <baseline-commit>`
- B: `git worktree add -b bugfix/<ticket-slug>-a<attempt>-h<hypothesis#> <path> <baseline-commit>`

A fresh worktree has no installed dependencies. If the implementer needs them to run the check,
install once per worktree under `with_stack_lock_and_heavy_job_lock`.

Every implementer is a **Spawn a subagent** of type `lean-coder`. Its brief contains:

- `Goal:` make the frozen check pass by fixing <the confirmed cause / its area / its hypothesis>;
- `Acceptance criteria:` the check passes, the check file is untouched, the fix is committed on the
  worktree's branch, the working tree is clean;
- `Proof command:` the check command with the lock prefix, spelled out in full because the subagent's
  shell has none of the Setup block: `source "$HOME/.agentic-workflow/toolkit/skills/ui-evidence/scripts/lib/locks.sh" && with_stack_lock_and_heavy_job_lock 120 <check command>`
  (UI: the implementer runs ui-evidence against its worktree only to iterate; the recorded run is yours);
- whether the worktree needs a one-time dependency install (say so explicitly; the agent otherwise
  won't install);
- the ticket brief (verbatim) and expected behaviour, and the handoff path;
- on a retry: the previous candidate's diff and the exact failure reasons (failed steps/assertions,
  and the judge's `reasons`);
- run heavy checks once per commit, under the lock, not per edit.

When a candidate's implementer (in mode C, the **last** area's implementer) finishes:
`node "$BFS_JS" record-candidate --state "$STATE" --branch <branch> --cwd <worktree> [--hypothesis <n>]`
— once per candidate; `--hypothesis` is required in mode B. The helper reads the commit from
`--cwd`, and refuses a clean tree that is not a real change on top of the baseline. If the fix touches
the check, tests, fixtures, snapshots or test config, the helper refuses: **Ask the user** whether
those changes are legitimate, and only if they approve, re-run with `--allow-test-changes`.

## Phase 5 — Evaluate

Evaluate candidates **one at a time in the main checkout**, where dependencies and the running app
already are. The candidate's branch stays checked out in its worktree, so detach at its commit:

1. `git -C "$REPO" checkout --detach <candidate commit>`
2. Re-run the **same** check:
   - UI: restart the app from `$REPO` with the project's run recipe (`/run` or its dev command), run
     `doctor.sh`, then
     `with_stack_lock_and_heavy_job_lock 120 node "$BFS_JS" run-ui --state "$STATE" --check .ui-evidence/<ticket-slug>.json --cwd "$REPO"`.
     Rebuilding the served app from the detached checkout is what makes the recorded `appBuild` true —
     the helper can check the commit label, not what the server is running.
   - Test: the exact baseline `run-test` command, with `--cwd "$REPO"`.
3. `node "$BFS_JS" record-run <candidate> --state "$STATE" --evidence <evidence>`
   (refused for a broken run: repair the selector and re-run — it doesn't cost an attempt).
4. If the run **passed**, ask the judge. The helper builds the input from state (ticket text
   verbatim, the handoff's root cause, the diff stat) and records its digest:
   ```bash
   node "$BFS_JS" judge-input <candidate> --state "$STATE" --summary "<what the check asserts>"   # prints {input, digest}
   judge resolution-check < "$STATE/judge-<candidate>.json" > "$STATE/judge-<candidate>.out"; echo "exit $?"
   ```
   - Exit 0 → `node "$BFS_JS" record-judge <candidate> --state "$STATE" --decision-id "$(jq -r .id "$STATE/judge-<candidate>.out")"`
     (refused if the decision is about any other input).
   - Exit 2 (escalated; the output has `reason_code` and no `id`) →
     `node "$BFS_JS" record-judge <candidate> --state "$STATE" --escalated "$(jq -r .reason_code "$STATE/judge-<candidate>.out")"`,
     then **Ask the user**: start another attempt (add any context they give to the implementer brief),
     or stop as unresolved. The helper never records "resolved" without a `resolved` judge decision.
   - Exit 1 → report the error; the input file is the helper's, never edit it.
5. `git -C "$REPO" checkout bugfix/<ticket-slug>` before the next candidate or phase.

Outcome:

- A candidate with a passing run **and** a `resolved` decision → Phase 6. With two eligible B
  candidates, pick the smaller diff and say why.
- `partial` / `unresolved` / a failing run → back to Phase 4 with the failure reasons.
- Attempt cap reached (the helper refuses a 4th) → Phase 6 as unresolved.
- Remove every worktree except the winning candidate's once it is evaluated (`git worktree remove`);
  keep the branches until the ticket closes.

## Phase 6 — Report

1. `node "$BFS_JS" advance report --state "$STATE" --candidate <id>` (resolved) or `--unresolved`.
2. Write `$STATE/resolution.md`: ticket (id, title, link), root cause, the fix branch and commits,
   before/after evidence paths, the judge decision id and reasons, attempts and modes used. For an
   unresolved outcome, list every candidate with why it failed.
3. **Ask the user** before posting anything: offer to post `resolution.md` to the Linear issue with
   `mcp: linear/save_comment`. Screenshots and traces follow `ui-evidence`'s publish rules (approved
   uploader and `seeded` DB provenance only; otherwise local paths).
4. Do not open a PR. Leave the winning branch ready and suggest `/shipRelease`.

Report to the user:

```
Bug fix orchestration complete.
Ticket: {id} — {title}
Status: {resolved | unresolved}
Root cause: {one line}
Fix: {branch} @ {commit}   (attempts: {n}/3, modes: {A|B|C…})
Check: {ui-evidence script | test} — failed before, {passed | failed} after
Judge: {decision} ({decision id})
Report: {STATE}/resolution.md
```

## Next steps

- `/shipRelease` — open the PR for the resolved fix branch
- `/review` — review the fix before shipping
- `/rootCause` — if unresolved, re-investigate with what the failed attempts ruled out
