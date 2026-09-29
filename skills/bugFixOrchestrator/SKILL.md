---
name: bugFixOrchestrator
description: Drive a bug ticket (Linear ID/URL or pasted text) to a proven resolution — investigate with /rootCause, have implementer subagents fix it, and call it resolved only when the same check that failed before the fix passes after it AND judge resolution-check agrees the reported problem is solved.
argument-hint: "<linear-issue-id-or-url | pasted ticket text>"
allowed-tools: Bash(git *), Bash(node *), Bash(npm *), Bash(npx *), Bash(judge *), Bash(bash *), Bash(SHARED_DIR=*), Bash(source *), Bash(mkdir *), Bash(cat *), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__claude_ai_Linear__get_issue, mcp__claude_ai_Linear__save_comment
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
never work around the helper, edit `state.json`, or hand-write evidence.

Design: `docs/superpowers/specs/2026-09-29-bug-fix-orchestrator-design.md`.

## Setup

Re-run this block at the top of every shell call (shell state does not persist):

```bash
SHARED_DIR="$HOME/.agentic-workflow/toolkit/skills/_shared"
source "$SHARED_DIR/repo-slug.sh"
BFS="node $HOME/.agentic-workflow/toolkit/skills/bugFixOrchestrator/dist/bin.js"
STATE="$AW_DIR/bugfix/<ticket-slug>"   # <ticket-slug>: Linear id lowercased (eng-123) or a short kebab summary
```

If `dist/bin.js` is missing, run `npm ci && npm run build` in
`$HOME/.agentic-workflow/toolkit/skills/bugFixOrchestrator` (or re-run `setup.sh`).

**Resume first:** if `$STATE/state.json` exists, run `$BFS resume --state "$STATE"` and continue from
the `next` action it prints. Its answer overrides your memory of where you were.

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
3. `$BFS init --state "$STATE" --ticket "$STATE/ticket.json"`

## Phase 2 — Investigate

1. **Invoke skill `rootCause`** with args `--investigate-only --depth 1 "<symptom from the brief>"`.
2. `$BFS advance investigate --state "$STATE" --evidence <handoff.md path from rootCause's JSON tail dir>`

## Phase 3 — Reproduce (the check must FAIL first)

Create the working branch first — **never commit to the base branch**:
`git checkout -b bugfix/<ticket-slug>`. The check is committed here; that commit is the **baseline**.

Pick the check:

- **UI bug** (rootCause's repro steps are navigate/click/fill against the web app): run
  `bash "$HOME/.agentic-workflow/toolkit/skills/ui-evidence/scripts/doctor.sh"` — stop and tell the
  user if the local stack is unhealthy. **Spawn a subagent** of type `qa-runner` to write a
  `ui-evidence` script from the repro steps, with every step's `expectedState` taken from the
  ticket's **expected** behaviour (not the current behaviour). Commit the script on `bugfix/<ticket-slug>`,
  then run it per `skills/ui-evidence/SKILL.md` step 3, always with `--app-build $(git rev-parse HEAD)`.
  Evidence = `<run-dir>/summary.json`.
- **Anything else:** **Spawn a subagent** (type `lean-coder`, `skillInternal: true` on the dispatch)
  to write **only** a regression test for the expected behaviour — no fix — and commit it on
  `bugfix/<ticket-slug>`. Then run it
  through the helper, which records the result itself:
  `$BFS run-test --state "$STATE" --check <test-file> --cwd <repo> -- <test command for that file>`.
  Evidence = the printed `evidence` path.

Then: `$BFS advance reproduce --state "$STATE" --evidence <evidence> --check <script-or-test-file> --cwd <repo>`

- Refused because the check **passed** → the bug is not reproduced. **Ask the user**: refine the
  check, or stop. A check that already passes can never prove a fix.
- Refused because steps are **broken** (selector problem, no failed step) → have `qa-runner` repair
  the script once and re-run; if still broken, **Ask the user**.

From here on the check file is **frozen**: the helper hashes it and refuses any later run where it
changed. Implementers must never edit it.

## Phase 4 — Fix

Choose the mode, then `$BFS start-attempt --state "$STATE" --mode <A|B|C>`:

| Mode | When | Dispatch |
|------|------|----------|
| **B** competing | A previous attempt failed **and** the handoff has ≥ 2 hypotheses not ruled out (the helper enforces both) | 2 implementers, one per hypothesis, each in its own worktree — **Dispatch in parallel** |
| **C** split | The confirmed hypothesis's cause-site files span more than one area (e.g. an API route and a UI component) | One implementer per area, **in sequence**, each given the previous one's diff, all on one branch |
| **A** single | Otherwise | One implementer |

Every candidate starts from the **baseline commit**, never from a failed attempt:
`git worktree add -b bugfix/<ticket-slug>-a<attempt>[-c<n>] <worktree-path> <baseline-commit>`
(`$BFS status --state "$STATE"` shows `baseline.commit`). One worktree per candidate; A and C use one.

Every implementer is a **Spawn a subagent** of type `lean-coder` with `skillInternal: true` on the
dispatch (the brief-scope gate treats it as this skill's own approved step). The brief contains:

- the ticket brief (verbatim) and expected behaviour;
- the handoff path, and its assigned area (C) or hypothesis (B);
- the failing check and how to run it; the rule that the check file must not be modified;
- on a retry: the previous candidate's diff and the exact failure reasons (failed steps/assertions,
  and the judge's `reasons`);
- run heavy checks once per commit, not per edit; commit the fix before finishing.

**One heavy job at a time:** in mode B the implementers write code in parallel, but every test run or
`ui-evidence` run goes through `with_stack_lock_and_heavy_job_lock` — never two at once.

After each candidate's implementer finishes:
`$BFS record-candidate --state "$STATE" --branch <branch> --cwd <worktree-or-repo>`
(the helper reads the commit from `--cwd`; the tree must be clean).

## Phase 5 — Evaluate

For each candidate (serially):

1. Re-run the **same** check in the candidate's worktree: `ui-evidence … --app-build $(git -C <cwd> rev-parse HEAD)`,
   or `$BFS run-test --state "$STATE" --check <test-file> --cwd <cwd> -- <command>`.
2. `$BFS record-run <candidate> --state "$STATE" --evidence <evidence>`
3. If the run **passed**, ask the judge. Write the input and run it:
   ```bash
   cat > "$STATE/judge-<candidate>.json" <<'JSON'
   { "brief": "<ticket.brief, verbatim>", "expected": "...", "actual": "...",
     "rootCause": "<the handoff's Root Cause paragraph>",
     "checkKind": "ui-evidence|test", "checkSummary": "<what the check asserts>",
     "beforePassed": false, "afterPassed": true,
     "diffStat": "<git -C <cwd> diff --stat <baseline-commit>..HEAD>" }
   JSON
   judge resolution-check < "$STATE/judge-<candidate>.json"
   ```
   - Exit 0 → `$BFS record-judge <candidate> --state "$STATE" --decision-id <id from the output>`
   - Exit 2 (escalated) → `$BFS record-judge <candidate> --state "$STATE" --escalated <reason_code>`,
     then **Ask the user**: start another attempt (add any context they give to the implementer
     brief), or stop as unresolved. The helper never records "resolved" without a `resolved` judge
     decision.

Outcome:

- A candidate with a passing run **and** a `resolved` decision → Phase 6. With two eligible B
  candidates, pick the smaller diff and say why. Remove the losing worktree (`git worktree remove`);
  keep its branch until the ticket closes.
- `partial` / `unresolved` / a failing run → back to Phase 4 with the failure reasons.
- Attempt cap reached (the helper refuses a 4th) → Phase 6 as unresolved.
- Remove every worktree that is not the winning candidate's once it is evaluated.

## Phase 6 — Report

1. `$BFS advance report --state "$STATE" --candidate <id>` (resolved) or `--unresolved`.
2. Write `$STATE/resolution.md`: ticket (id, title, link), root cause, the fix branch and commits,
   before/after evidence paths, the judge decision id and reasons, attempts and modes used. For an
   unresolved outcome, list every candidate with why it failed.
3. **Ask the user** before posting anything: offer to post `resolution.md` to the Linear issue with
   `mcp: linear/save_comment`. Screenshots and traces follow `ui-evidence`'s publish rules (approved
   uploader and `seeded` DB provenance only; otherwise local paths).
4. Do not open a PR. Leave the branch ready and suggest `/shipRelease`.

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
