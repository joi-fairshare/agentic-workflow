# Bug Fix Orchestrator — Design

**Date:** 2026-09-29
**Status:** Approved 2026-09-29; implemented on `feat/bug-fix-orchestrator`

## Goal

A `/bugFixOrchestrator` skill that takes a bug ticket and drives it to a **proven** resolution. The
orchestrating agent never edits product code. It investigates with `/rootCause`, dispatches
implementer subagents to fix, and decides "resolved" only when:

1. the same check that failed on the unfixed code (a `ui-evidence` script, or a regression test)
   passes on the fixed code, **and**
2. a new `judge` question, `resolution-check`, agrees that the passing check plus the diff resolve
   the problem **as reported in the ticket's brief**.

"Tests pass" alone is never enough to call a ticket resolved.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Investigator | `/rootCause` with a new `--investigate-only` flag (`bugReport` is a health audit and has no symptom input; `bugHunt` fixes the bug itself) |
| D2 | Who decides "resolved" | Both: the hard check is the gate; `judge resolution-check` is a required second opinion |
| D3 | Ticket source | Linear issue ID/URL (via Linear MCP) or pasted text; the report goes back to Linear, ask-first |
| D4 | Implementer strategy | Serial by default (A), split by area (C), competing implementers as the escalation (B); 3 attempts total |
| D5 | Non-UI bugs | A regression test that fails before and passes after replaces the `ui-evidence` script |
| D6 | Build shape | Prose `SKILL.md` + a `bugfix-state` TypeScript CLI that owns the state file and enforces the phase rules |
| D7 | Check is frozen | The check must be byte-identical between REPRODUCE and EVALUATE (enforced by sha256) |

## Components

```
 ticket (Linear ID/URL or text)
        │
        ▼
 ┌──────────────────────── /bugFixOrchestrator (SKILL.md, prose) ─────────────────────────┐
 │  every phase change goes through ──►  bugfix-state CLI (TS, owns state.json)           │
 │                                                                                         │
 │  1 INTAKE ─► 2 INVESTIGATE ─► 3 REPRODUCE ─► 4 FIX ─► 5 EVALUATE ─► 6 REPORT           │
 │   Linear MCP   /rootCause       ui-evidence     implementer(s)  same check passes      │
 │   or text      --investigate-   script, or      mode A / C / B  + judge                 │
 │                only             failing test                    resolution-check        │
 │                                 MUST FAIL ───────────────────────┘ fail & attempt<3 ─► 4│
 └─────────────────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
 resolution.md (local) ──ask-first──► Linear comment
```

| Unit | Location | Responsibility |
|------|----------|----------------|
| Orchestrator skill | `skills/bugFixOrchestrator/SKILL.md` | Phase instructions; dispatches subagents; reads evidence; never edits product code |
| State CLI | `skills/bugFixOrchestrator/src/` (bin `bugfix-state`) | Sole writer of `state.json`; validates evidence; refuses disallowed phase changes |
| Judge question | `judge/src/questions/resolution-check.ts` | Second opinion: does the passing check plus the diff resolve the reported problem? |
| rootCause flag | `skills/rootCause/SKILL.md` | `--investigate-only`: stop after Phase 3.5 and emit a hypotheses table in the handoff |

## rootCause `--investigate-only`

- Runs Phases 0–3.5. Temporary instrumentation added to confirm a hypothesis (log lines, narrowed
  test runs) is reverted before the skill exits; the working tree is left as it was.
- Skips Phase 4. Final status is `diagnosed`. Never dispatches `bugHunt` (Sub-skill Dispatch is off).
- The handoff (`investigations/<slug>/handoff.md`) gains a table:

  ```markdown
  ## Hypotheses
  | # | Hypothesis | Cause-site files | Likelihood | Result |
  |---|-----------|------------------|------------|--------|
  | 1 | ... | `path/a.ts`, `path/b.tsx` | High | confirmed |
  ```

  `Result` is one of `confirmed | ruled-out | untested`.
- The JSON tail's `status` gains the value `diagnosed`.
- Without the flag, rootCause behaves exactly as it does today.

## Phases

### 1. INTAKE
- Linear ID/URL → fetch the issue via Linear MCP. Otherwise use the pasted text.
- Store `ticket.title` and `ticket.brief` **verbatim** (the title plus the full description as
  reported, unedited).
- Extract `expected` and `actual` behaviour. If the ticket has no clear expected behaviour, ask the
  user once; that sentence is the acceptance target.
- `bugfix-state init --ticket <json>`.

### 2. INVESTIGATE
- Invoke `/rootCause --investigate-only --depth 1 "<symptom from brief>"`.
- `bugfix-state advance investigate --evidence <handoff.md>`. The helper requires that the handoff
  parses, has status `diagnosed`, and has at least one hypothesis row.

### 3. REPRODUCE
- **UI bug** (rootCause produced navigate/click/fill repro steps against the web app): dispatch the
  `qa-runner` agent to write a `ui-evidence` script from the repro steps, with each `expectedState`
  taken from the ticket's **expected** behaviour. Run it on the unfixed code, always passing
  `--app-build $(git rev-parse HEAD)`.
- **Otherwise:** dispatch one implementer to write **only** a regression test (no fix) and commit
  it. The orchestrator then runs it through the helper:
  `bugfix-state run-test --check <test-file> -- <command>`. The helper executes the command itself
  and writes `test-result.json` `{ command, exitCode, commit, checkSha256 }` from what it observed,
  so the result is never agent-reported.
- `bugfix-state advance reproduce --evidence <summary.json | test-result.json>`. The helper records
  the check's path and sha256 and **refuses unless the run failed**.
- A passing baseline means the bug was not reproduced: set `status: needs-human` and ask the user.
- A `ui-evidence` run that exits 2 only because a step is `broken` (a selector problem, not a failed
  expectation) is not a reproduction. `qa-runner` repairs the script once; if it's still broken,
  ask the user.

### 4. FIX
Mode selection, in order:

| Mode | When | What |
|------|------|------|
| B — competing | A previous attempt failed **and** the handoff has ≥ 2 hypotheses not `ruled-out` | 2 implementers in separate worktrees, one per hypothesis. Code-writing runs in parallel; every heavy step (tests, `ui-evidence`) runs under `with_stack_lock_and_heavy_job_lock`, so only one heavy job runs at a time |
| C — split | The confirmed hypothesis's cause-site files span > 1 area (distinct top-level packages or app layers, e.g. API route and UI component) | One implementer per area, in sequence; each gets the previous one's diff. One evaluation at the end |
| A — single | Otherwise | One implementer |

- Each implementer brief contains: the ticket brief, the handoff, the failing check, its assigned
  area or hypothesis, and on a retry the previous diff plus the exact failure reasons (failed
  steps/assertions and the judge's reasoning). Implementers may not modify the check file.
- Dispatches set `skillInternal: true` so the `brief-scope` gate treats them as the skill's own
  approved steps.
- Implementers run heavy checks once per commit, not per edit.
- `bugfix-state start-attempt --mode <A|B|C>` opens the attempt (the helper increments `attempt` and
  refuses a 4th); `bugfix-state record-candidate --branch <b> --cwd <worktree>` records each candidate.
- Every candidate branch starts from the baseline commit (`bugfix/<ticket-slug>-a<attempt>[-c<n>]`),
  never from a failed attempt. The check itself is committed on `bugfix/<ticket-slug>` — never on the
  base branch.

### 5. EVALUATE
For each candidate:
1. Re-run the **same** check on the candidate's branch (`ui-evidence … --app-build <head>`, or
   `bugfix-state run-test`).
2. `bugfix-state record-run <candidate> --evidence <path>`. The helper requires that the check's
   sha256 still matches the baseline, and that the run's commit equals the candidate's head commit.
3. If the run passed: `judge resolution-check`, then
   `bugfix-state record-judge <candidate> --decision-id <id>` (the helper fetches the decision
   through `judge why` instead of trusting the agent's copy), or `--escalated <reason_code>` when the
   judge escalated (exit 2, no decision id).
4. Outcome:
   - check passed **and** judge `resolved` → candidate eligible.
   - judge `partial | unresolved`, or check failed → back to Phase 4 with the reasons.
   - judge escalated (below threshold or timeout) → `status: needs-human`; the user decides.

With B, the first eligible candidate wins; if both are eligible, the orchestrator picks the smaller
diff and records why. The losing worktree is removed and its branch kept until the ticket closes.

### 6. REPORT
- `bugfix-state advance report --evidence <candidate-id>`. For `resolved`, the helper requires the
  candidate to have a passed run and a judge decision of `resolved`.
- Write `resolution.md`: ticket, root cause, fix commits, before/after evidence paths, the judge
  decision ID, attempts, and the modes used.
- Offer to post it to Linear as a comment (ask-first). Artifact upload follows `ui-evidence`'s
  existing rules (approved uploader, `seeded` DB provenance only).
- The branch is left ready for `/shipRelease`. No PR is opened automatically.
- On 3 failed attempts: `status: unresolved`; every candidate and all evidence are kept, and the
  report is still offered.

## State file

`~/.agentic-workflow/<repo-slug>/bugfix/<ticket-slug>/state.json`, Zod-validated, written only by
`bugfix-state` (temp file + rename).

```jsonc
{
  "version": 1,
  "ticket": { "source": "linear|text", "id": "ENG-123", "title": "...", "brief": "<verbatim>",
              "expected": "...", "actual": "..." },
  "phase": "intake|investigate|reproduce|fix|evaluate|report",
  "status": "active|resolved|unresolved|needs-human",
  "attempt": 0,
  "handoff": "<path>",
  "check": { "kind": "ui-evidence|test", "path": "<script.json|test file>", "sha256": "..." },
  "baseline": { "evidence": "<path>", "failed": true, "commit": "<sha>" },
  "candidates": [
    { "id": "c1", "attempt": 1, "mode": "A|B|C", "branch": "...", "cwd": "<worktree or repo>",
      "commit": "<sha>", "run": { "evidence": "...", "passed": true },
      "judge": { "decisionId": "...", "decision": "resolved|partial|unresolved|escalated" } }
  ],
  "history": [ { "at": "<iso>", "from": "fix", "to": "evaluate", "evidence": "..." } ]
}
```

## `bugfix-state` CLI

Exit codes: `0` allowed, `3` refused (reason on stderr), `1` bad usage or invalid state.

| Command | Enforces |
|---------|----------|
| `init --ticket <json>` | Ticket has a non-empty `brief` and `expected`; no unfinished (`active` / `needs-human`) state for the slug |
| `advance investigate --evidence <handoff>` | Phase `intake`; handoff parses, has status `diagnosed`, has ≥ 1 hypothesis |
| `run-test --check <file> [--cwd <dir>] -- <cmd…>` | Clean tracked tree in `--cwd`; runs the command itself and writes `runs/<ts>-test-result.json` (observed exit code, `HEAD`, check sha256) plus a log |
| `advance reproduce --evidence <run> --check <file> [--cwd <dir>]` | Phase `investigate`; run **failed** (not passed, not broken-only); run commit equals `HEAD` of `--cwd`; records the check path, sha256, and baseline commit |
| `start-attempt --mode <A\|B\|C>` | Phase `reproduce` or `evaluate`; no eligible candidate; every candidate of the current attempt evaluated; `attempt` < 3; B only after a failed attempt and with ≥ 2 hypotheses not ruled out. Increments `attempt`, clears `needs-human` |
| `record-candidate --branch <b> [--cwd <dir>]` | Phase `fix`; one candidate per A/C attempt, two per B attempt; `--cwd` is on `<b>`, has a clean tracked tree, and `HEAD` differs from the baseline. The commit is read from `--cwd`, not passed in |
| `record-run <candidate> --evidence <run>` | Phase `fix` or `evaluate`; no run recorded yet; same check kind as the baseline; run commit equals the candidate's commit, which is still the candidate's `HEAD`; check sha256 unchanged |
| `record-judge <candidate> (--decision-id <id> \| --escalated <reason_code>)` | Phase `evaluate`; the candidate has a passing run and no judge decision; the decision exists (`judge why`), is for `resolution-check`, is not undone, and has an outcome. `--escalated` sets `status: needs-human` |
| `advance report (--candidate <id> \| --unresolved)` | Not already reported; `--candidate` needs a passing run and a `resolved` judge decision |
| `status` / `resume` | — (print the state / the current phase and the next action) |

Test evidence only counts when it lives under `<state>/runs/`, i.e. when `run-test` produced it.
ui-evidence runs are tied to a commit through `summary.json`'s `appBuild`.

The orchestrator must report any refusal and may not work around it. After context loss it runs
`bugfix-state resume`.

## `judge` question: `resolution-check`

- **Input:** `{ brief, expected, actual, rootCause, checkKind, checkSummary, beforePassed, afterPassed, diffStat }`
  - `brief`: the ticket title plus description, verbatim, capped at ~8k characters; if cut, a
    `[truncated N chars]` marker is appended.
  - `rootCause`: the confirmed root-cause paragraph from the handoff.
- **Outputs:** `resolved | partial | unresolved`
- **Content class:** `brief` · **threshold:** 0.8 · **time budget:** 15 000 ms
- **preRules:**
  - `afterPassed === false` → `unresolved`
  - `beforePassed === true` → `unresolved` (the check never reproduced the bug)
  - empty `brief` → escalate (nothing to judge against)
- **Prompt:** leads with the brief, then the expected behaviour, the root cause, the check summary
  and the diff stat, and asks: does the passing check, together with this diff, resolve *the problem
  as reported in the brief*? Reply `partial` if any part of the brief is not covered by the check,
  or if the diff hides the symptom without addressing the root cause.
- It never defaults to `resolved`. A timeout or low confidence escalates.

## Error handling

| Situation | Behaviour |
|-----------|-----------|
| Baseline check passes | Not reproduced → `needs-human`, ask the user |
| `ui-evidence` step `broken` | One `qa-runner` repair, then ask the user |
| Helper refuses (exit 3) | Report the reason; never work around it |
| Judge escalates | `needs-human`; the user decides |
| 3 attempts exhausted | `unresolved`; keep all evidence; still offer the report |
| Context loss | `bugfix-state resume` |
| Local stack unhealthy (`doctor.sh`) | Stop before REPRODUCE; UI bugs need a healthy local stack |

## Testing

Vitest, no `/* v8 ignore */`, following `.agents/rules/testing.md`.

- **`bugfix-state`:** a table test covering every allowed and refused transition: baseline passed →
  refused; broken-only `ui-evidence` summary → not a reproduction; check sha256 changed → refused;
  run commit ≠ candidate commit → refused; 4th attempt → refused; `report(resolved)` without a
  `resolved` judge decision → refused. Plus atomic writes, and `resume` output after each phase.
  Uses real temp directories; the state logic is not mocked. The `judge why` lookup goes through
  a thin injected executor, stubbed in tests.
- **`resolution-check`:** each `preRules` branch; the prompt contains the brief verbatim and the
  truncation marker when capped; output enum; threshold and escalation through the existing judge
  test helpers.
- **`rootCause --investigate-only`:** a text-level check that the flag, the `diagnosed` status, and
  the `## Hypotheses` handoff table are documented.
- **`providers/tests/install.test.sh`:** `bugFixOrchestrator` is linked, and the skill-package build
  step runs (and is skipped in dry-run).

## Change to `ui-evidence`

`summary.json` gains `appBuild` (the `--app-build` value, or `null`). Today the value is used only
for the verdict-cache key and is not written out, so a run cannot be tied to a commit. The helper
requires `appBuild` to equal the candidate's head commit (or the baseline commit for REPRODUCE).

## Install, merge gate, docs

- `setup.sh`: add `bugFixOrchestrator` to `MANAGED_SKILLS`; add a step that runs
  `npm ci && npm run build` in `skills/ui-evidence` and `skills/bugFixOrchestrator` (dry-run prints
  it). This also fixes an existing gap: `ui-evidence` needs `dist/bin.js`, but `setup.sh` never
  builds it.
- AGENTS.md merge gate: add typecheck and test for both skill packages.
- Skill counts in AGENTS.md, README.md, `planning/ARCHITECTURE.md` and `.agents/rules/skills.md`;
  a "Bug fixing" line in the `setup.sh` summary.
- `planning/ARCHITECTURE.md`: a short section on the orchestrator → state CLI → judge flow.
- `skills/judge/SKILL.md`: list `resolution-check`.

## Out of scope

- iOS evidence packs (non-web bugs use the regression-test path).
- Opening PRs automatically.
- More than 2 competing implementers.
- Changes to `bugHunt` or `bugReport`.
