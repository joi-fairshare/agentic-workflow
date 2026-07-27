---
name: bugHunt
description: Fix-and-verify loop with atomic commits and regression test generation. Three tiers — quick (lint+typecheck), standard (unit+integration), exhaustive (full suite + edge cases).
argument-hint: "[--tier quick|standard|exhaustive] [--from-report <path> --item N] [--from-investigation <path>] [--depth N] [bug-description-or-test-command]"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Bash(pytest *), Bash(cargo *), Bash(go *), Bash(bundle *), Bash(coverage *), Bash(SHARED_DIR=*), Bash(source *), Bash(cat *), Bash(echo *), Bash(mkdir *), Bash(ls *), Agent, Read, Write, Edit, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff, mcp__prism-mcp__session_task_route, mcp__prism-mcp__prism_infer
---

# Bug Hunt

Fix-and-verify loop with atomic commits, regression test generation, and tiered verification.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 44 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill family). Run any as `/<name>`.
>
> | Skill | Purpose |
> |-------|---------|
> | `/review` | Multi-agent PR code review |
> | `/postReview` | Publish review findings to GitHub |
> | `/addressReview` | Implement review fixes in parallel |
> | `/enhancePrompt` | Context-aware prompt rewriter |
> | `/bootstrap` | Generate repo planning docs + CLAUDE.md |
> | `/rootCause` | 4-phase systematic debugging |
> | `/bugHunt` | Fix-and-verify loop with regression tests |
> | `/bugReport` | Structured bug report with health scores |
> | `/shipRelease` | Sync, test, push, open PR |
> | `/syncDocs` | Post-ship doc updater |
> | `/weeklyRetro` | Weekly retrospective with shipping streaks |
> | `/officeHours` | Spec-driven brainstorming → EARS requirements + design doc |
> | `/productReview` | Founder/product lens plan review |
> | `/archReview` | Engineering architecture plan review |
> | `/withInterview` | Interview user to clarify requirements before executing |
> | `/design-analyze` | Detect web vs iOS, extract design tokens (dispatcher) |
> | `/design-analyze-web` | Extract design tokens from reference URLs (web) |
> | `/design-analyze-ios` | Extract design tokens from Swift/Xcode assets |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Detect web vs iOS, merge new reference into design language (dispatcher) |
> | `/design-evolve-web` | Merge new URL into design language (web) |
> | `/design-evolve-ios` | Merge Swift reference into design language (iOS) |
> | `/design-mockup` | Detect web vs iOS, generate mockup (dispatcher) |
> | `/design-mockup-web` | Generate HTML mockup from design language |
> | `/design-mockup-ios` | Generate SwiftUI preview mockup |
> | `/design-implement` | Detect web vs iOS, generate production code (dispatcher) |
> | `/design-implement-web` | Generate web production code (CSS/Tailwind/Next.js) |
> | `/design-implement-ios` | Generate SwiftUI components from design tokens |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Detect web vs iOS, screenshot diff vs mockup (dispatcher) |
> | `/design-verify-web` | Playwright screenshot diff vs mockup (web) |
> | `/design-verify-ios` | Simulator screenshot diff vs mockup (iOS) |
> | `/verify-app` | Detect web vs iOS, verify running app (dispatcher) |
> | `/verify-web` | Playwright browser verification of running web app |
> | `/verify-ios` | XcodeBuildMCP simulator verification of iOS app |
> | `/autoplan` | Plan meta-orchestrator (productReview + archReview + planDesignReview + planDevexReview + cso in parallel) |
> | `/planDesignReview` | Design-lens review of plan docs |
> | `/planDevexReview` | DX-lens review of plan docs |
> | `/cso` | OWASP Top 10 + STRIDE threat model (plan or PR diff) |
> | `/design-shotgun` | Generate 4–6 mockup variants in parallel |
> | `/landAndDeploy` | Merge → deploy → smoke → chain canary |
> | `/canary` | Post-deploy monitoring with custom probes |
> | `/prismStatus` | Health check for prism-mcp |
> | `/specToProvenPR` | Approved spec → proven, review-clean PRs, one shippable stage at a time |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`
>
> ### Meta-Orchestration Convention
>
> Every native pipeline skill ends its response with a `## Next steps` block listing 1–3 recommended successor skills with one-line reasons. This is the meta-orchestration layer — skills hand off through structured suggestions, not by importing each other's logic. Three stage orchestrators (`/autoplan`, `/design-refine`, `/shipRelease`) fan out subagents in parallel and consolidate findings.

## Codebase Navigation

Prefer **Serena** for all code exploration — LSP-based symbol lookup is faster and more precise than file scanning.

| Task | Tool |
|------|------|
| Find a function, class, or symbol | `serena: find_symbol` |
| What references symbol X? | `serena: find_referencing_symbols` |
| Module/file structure overview | `serena: get_symbols_overview` |
| Search for a string or pattern | `Grep` (fallback) |
| Read a full file | `Read` (fallback) |

## Preamble — Bootstrap Check

Before running this skill, verify the environment is set up:

```bash
# Derive repo slug
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE_URL" ]; then
  REPO_SLUG=$(echo "$REMOTE_URL" | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|;s|.*[:/]\([^/]*/[^/]*\)$|\1|' | tr '/' '-')
else
  REPO_SLUG=$(basename "$(pwd)")
fi
echo "repo-slug: $REPO_SLUG"

# Check bootstrap status
SKILLS_OK=true
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios autoplan planDesignReview planDevexReview cso design-shotgun landAndDeploy canary prismStatus specToProvenPR; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
lsof -i TCP:3100 -sTCP:LISTEN &>/dev/null && BRIDGE_OK=true

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-running: $BRIDGE_OK"
echo "rules-directory: $RULES_OK"
```

Domain rules in `.claude/rules/` load automatically per glob — no action needed if `rules-directory: true`.

If `SKILLS_OK=false` or `BRIDGE_OK=false`, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

If `RULES_OK=false` (and `SKILLS_OK` and `BRIDGE_OK` are both true), do not offer setup.sh. Instead, show:
> "Domain rules not found — run `/bootstrap` to generate `.claude/rules/` for this repo."

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG"
```

## Session Context

Load prior work state for this repo from prism-mcp before starting.

**1. Derive a topic string** — synthesize 3–5 words from the skill argument and task intent:
- `/officeHours add dark mode` → `"dark mode UI feature"`
- `/rootCause TypeError cannot read properties` → `"TypeError cannot read properties"`
- `/review 42` → use the PR title once fetched: `"PR {title} review"`
- No argument → use the most specific descriptor available: `"{REPO_SLUG} {skill-name}"`

**2. Load context from prism-mcp:**
```
mcp__prism-mcp__session_load_context — project: REPO_SLUG, level: "standard",
  toolAction: "Loading session context", toolSummary: "<skill-name> context recovery"
```

Store the returned `expected_version` — you will need it at Session Close.

**3. Surface results:**
- If the response contains a non-empty summary or prior decisions:
  > **Prior context:** {summary}
  Use this to inform your approach before continuing.
- If prism-mcp returns an error, surface it and stop:
  > "prism-mcp unavailable: {error}. Ensure prism-mcp is running and registered."

## Session Close

> **Run at the end of every skill**, after all work is complete and the report has been shown to the user.

Save a structured ledger entry and update the live handoff state for this repo.

**1. Save ledger entry (immutable audit trail):**
```
mcp__prism-mcp__session_save_ledger — project: REPO_SLUG,
  conversation_id: "<skill-name>-<ISO-timestamp, e.g. 2026-04-08T14:32:00Z>",
  summary: "<one paragraph describing what was accomplished this session>",
  todos: ["<any open items left incomplete>", ...],
  files_changed: ["<paths of files created or modified>", ...],
  decisions: ["<key decisions made during this skill run>", ...]
```

**2. Update handoff state (mutable live state for next session):**
```
mcp__prism-mcp__session_save_handoff — project: REPO_SLUG,
  expected_version: <value returned by session_load_context>,
  open_todos: ["<open items not yet completed>", ...],
  active_branch: "<current git branch from: git branch --show-current>",
  last_summary: "<one sentence: what this skill just did>",
  key_context: "<critical facts the next session must know — constraints, decisions, blockers>"
```

If either call fails, surface the error:
> "prism-mcp session save failed: {error}. Context may not persist to next session."

<!-- === PREAMBLE END === -->

## Step 1: Parse Arguments

Parse the argument string for:
- **Tier flag:** `--tier quick`, `--tier standard`, or `--tier exhaustive`. Default: `standard`.
- **`--from-report <path> --item N`** — entry from a `/bugReport` report: Read `<path>` and take row N of its `## Bugs` table as the bug description (severity, file, line, description). No manual re-description needed.
- **`--from-investigation <path>`** — entry from a `/rootCause` handoff (`investigations/<slug>/handoff.md`): Read `<path>` and adopt its root cause, module boundary, and repro command/journey. Skip re-deriving anything the handoff already answers in Steps 2–3.
- **`--depth N`** — dispatch-chain depth guard (default 0). If N ≥ 2, do not dispatch any sub-skill from this run — report instead. When dispatching, pass `--depth N+1`.
- **Bug description or test command:** Everything after the flags (or the entire argument if no flag).

Tier definitions:
| Tier | Verification scope |
|------|-------------------|
| `quick` | Lint + typecheck only |
| `standard` | Specific test file + related test files |
| `exhaustive` | Full test suite + additional edge case tests |

## Step 2: Reproduce

Confirm the bug exists before attempting a fix.

1. **Detect the runner** per `skills/_shared/test-runner-detection.md` (sets `TEST_CMD`). An undetected runner is "n/a" — fall back to the app path below; missing tooling is never itself the bug.
2. **If argument contains a test command** (e.g., `npm test -- path/to/test`), run it directly.
3. **If argument is a description**, use Grep to find related test files and **list every candidate test first** (file + why it matched) before running any. Then run the candidates, best match first.
4. **Capture the failure output.** If no candidate fails, do NOT conclude non-reproduction yet:
   - Show the full candidate list you tried.
   - For user-facing symptoms, try the app path: `Skill(skill="verify-app", args="--yes --journey <repro steps from the description>")`.
   - Only after both routes pass, ask via AskUserQuestion whether the user can provide more detail / a failing command, or wants to stop.

## Step 3: Locate

Find the bug in the source code.

1. Use Grep and Glob to search for code related to the failure — error messages, function names from stack traces, relevant module paths.
2. Use Agent to explore the codebase if the initial search is insufficient.
3. Read all relevant source files. Trace the logic to identify the defect.

## Step 3.5: Dark Factory (optional)

Follow `skills/_shared/dark-factory.md` — the gate (CD12), the route/infer/verify flow, and the **bugHunt fix objective template** are all preserved there. Fill the template with the root cause from Step 3 and the failing command from Step 2:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/bugHunt/SKILL.md")")/../_shared"
cat "$SHARED_DIR/dark-factory.md"
```

- Gate disabled or config absent ⇒ skip silently to Step 4 (don't mention dark factory).
- Delegated fix **verified by the host** (re-run `TEST_CMD` per the shared flow) ⇒ commit it as in Step 4.2, then **continue at Step 5 and Step 6** — a dark-factory fix never skips the regression test or tier verification.
- Unavailable, refused, or failed verification ⇒ manual Step 4.

## Step 4: Fix

Implement the fix and commit atomically.

1. **Edit the source file(s)** to fix the bug. Keep changes minimal — fix only the identified defect.
2. **Commit the fix:**
   ```bash
   git add <changed-files>
   git commit -m "fix: <short description of what was fixed>"
   ```

## Step 5: Generate Regression Test

Write a test that guards against this bug recurring.

1. **Identify the correct test file.** If a related test file exists, add the test there. Otherwise, create a new test file following the project's test conventions.
2. **Write a test** that:
   - Would **fail** on the original buggy code
   - **Passes** on the fixed code
   - Tests the specific edge case or condition that triggered the bug
3. **Commit the test:**
   ```bash
   git add <test-files>
   git commit -m "test: regression test for <short description>"
   ```

## Step 6: Verify by Tier

Detect `TEST_CMD` per `skills/_shared/test-runner-detection.md` (re-detect in each bash block — shell state does not persist). Undetected tooling reports "n/a", never a failure.

### Tier: quick
Lint + typecheck only, using the project's configured tools (JS example: `npm run lint || npx eslint .`, `npm run typecheck || npx tsc --noEmit`; use the detected stack's equivalents otherwise). Unconfigured ⇒ "n/a".

### Tier: standard
Run the originally failing test, plus related test files (same directory or importing the fixed module): `$TEST_CMD <test-file>` then `$TEST_CMD <related-test-files>`.

### Tier: exhaustive
Run the full suite (`$TEST_CMD`), write and run any additional edge-case tests you identify, and **Step 6.5 is mandatory for user-facing fixes**.

### Step 6.5: Verify in the running app (user-facing fixes)

If the fix touches user-facing code (routes, components, views, templates, styles):

> `Skill(skill="verify-app", args="--yes --journey <the repro steps from Step 2, as the journey>")`

- Recommended at `standard` tier; **mandated** at `exhaustive` tier — do not report `fixed` there without it.
- Record the resulting evidence pack (`skills/_shared/evidence-pack.md`) for the report:
  ```bash
  SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/bugHunt/SKILL.md")")/../_shared"
  source "$SHARED_DIR/repo-slug.sh"
  ls -1dt "$AW_DIR/verification/"*/ 2>/dev/null | head -1
  ```
- A `FAIL` verdict in the pack counts as verification failure → Step 7.

## Step 7: Loop on Failure

If verification fails:

1. **Persist and check the iteration counter** (survives context loss — never track it only in your head):
   ```bash
   SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/bugHunt/SKILL.md")")/../_shared"
   source "$SHARED_DIR/repo-slug.sh"
   mkdir -p "$AW_DIR/qa"
   COUNTER_FILE="$AW_DIR/qa/.bughunt-attempts-<slug>"
   ATTEMPT=$(( $(cat "$COUNTER_FILE" 2>/dev/null || echo 0) + 1 ))
   echo "$ATTEMPT" > "$COUNTER_FILE"
   echo "attempt $ATTEMPT/3"
   ```
   If `ATTEMPT` ≥ 3 (max), skip to Step 8 with status `unfixed`.
2. **Analyze the new failure.** Read the output, determine if it is the same bug or a new issue introduced by the fix.
3. **Go back to Step 4.** Revert the broken fix if necessary (`git revert HEAD` or edit), then re-implement.

## Step 8: Write QA Report

Write the report to `$HOME/.agentic-workflow/$REPO_SLUG/qa/{timestamp}-{slug}.md` where:
- `{timestamp}` is `YYYYMMDD-HHmmss` format
- `{slug}` is a short kebab-case summary of the bug (max 40 chars)

Report format:

```markdown
# Bug Hunt Report: {short description}

**Date:** {ISO timestamp}
**Tier:** {quick | standard | exhaustive}
**Status:** {fixed | unfixed}
**Attempts:** {n}/3

## Bug Description

{Original bug description or failing command}

## Root Cause

{What was actually wrong and why}

## Fix Summary

{Description of the fix}

### Changed Files
- `{file}:{line}` — {what changed}

### Commits
- `{sha}` — fix: {description}
- `{sha}` — test: regression test for {description}

## Regression Test

**File:** `{test-file-path}`
**Test name:** `{test name or describe block}`

## Verification Results

**Tier:** {tier}
**Result:** {pass | fail}

{Command output summary}

## Evidence

- **Runner:** {TEST_CMD or "n/a — no runner detected"}
- **Verification output:** {key lines from the tier run}
- **Evidence pack:** {`~/.agentic-workflow/<repo-slug>/verification/<run-id>/pack.json` from Step 6.5, or "n/a — not a user-facing fix"}
- **Pack verdict:** {PASS | WARN | FAIL | n/a}
```

## Step 9: Report to User

```
Bug hunt complete.

Status: {fixed | unfixed}
Tier: {tier}
Attempts: {n}/3
Root cause: {one-line summary}
Fix: {commit sha} — fix: {description}
Test: {commit sha} — test: regression test for {description}
Report: ~/.agentic-workflow/<repo-slug>/qa/{filename}
Evidence: {pack path or "n/a"}
```

### Sub-skill Dispatch

If the fix-and-verify loop ends with status `unfixed` (all hypotheses exhausted) **and** the depth guard allows (`--depth` < 2):
> `Skill(skill="bugReport", args="--depth <N+1> <scope>")`

Do not invoke bugReport on success — bugHunt's own Step 8 report is sufficient. At depth ≥ 2, report only.

## Next steps

- `/review` — verify fixes pass code review
- `/shipRelease` — if all bugs are fixed and tests pass
- `/weeklyRetro` — if this was part of a larger debugging push
