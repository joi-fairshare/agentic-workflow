---
name: bugHunt
description: Fix-and-verify loop with atomic commits and regression test generation. Three tiers — quick (lint+typecheck), standard (unit+integration), exhaustive (full suite + edge cases).
argument-hint: "[--tier quick|standard|exhaustive] [bug-description-or-test-command]"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Agent, Read, Write, Edit, Glob, Grep, Skill
---

# Bug Hunt

Fix-and-verify loop with atomic commits, regression test generation, and tiered verification.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 34 skills available. Run any as `/<name>`.
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
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios; do
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
- **Bug description or test command:** Everything after the tier flag (or the entire argument if no flag).

Tier definitions:
| Tier | Verification scope |
|------|-------------------|
| `quick` | Lint + typecheck only |
| `standard` | Specific test file + related test files |
| `exhaustive` | Full test suite + additional edge case tests |

## Step 2: Reproduce

Confirm the bug exists before attempting a fix.

1. **If argument contains a test command** (e.g., `npm test -- path/to/test`), run it directly.
2. **If argument is a description**, use Grep to search for related test files. Look for test files matching keywords from the description. Run the most relevant test(s).
3. **Capture the failure output.** If the command passes (no failure), inform the user:
   > "Could not reproduce the bug. The specified test/command passes. Please provide more detail or a failing test command."

   Stop here unless the user provides more context.

## Step 3: Locate

Find the bug in the source code.

1. Use Grep and Glob to search for code related to the failure — error messages, function names from stack traces, relevant module paths.
2. Use Agent to explore the codebase if the initial search is insufficient.
3. Read all relevant source files. Trace the logic to identify the defect.

## Step 3.5: Dark Factory Fix Pipeline (if enabled)

**Build the objective** from what you learned in Steps 2–3 — be specific about the root cause and the failing test command.

**Start the pipeline:**
```
mcp__prism-mcp__session_start_pipeline — project: REPO_SLUG,
  objective: "Fix the bug: <one-sentence description>. Root cause: <root cause from Step 3>. Reproduce with: <test command from Step 2>. The fix must: (1) make the failing test pass, (2) introduce no new test failures, (3) be minimal — only the identified defect is changed, (4) include a regression test for the specific edge case.",
  working_directory: "<absolute path to repo root>",
  max_iterations: 3
```

Store the returned `pipeline_id`.

**Poll until complete (check every 15s):**
```
mcp__prism-mcp__session_check_pipeline_status — pipeline_id: <pipeline_id>
```

Continue polling while `status` is `PENDING` or `RUNNING`. When `status` is:
- `COMPLETED` — pipeline succeeded. Read the fix summary from the pipeline output, then skip to Step 8 (Write QA Report) with status `fixed`.
- `FAILED` — pipeline exhausted iterations. Fall through to manual Step 4, using the evaluator's final critique as additional context for your fix attempt.
- `ABORTED` — skip to Step 8 with status `unfixed`.

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

Run verification based on the selected tier.

### Tier: quick
```bash
# Run linter (if available)
npm run lint 2>/dev/null || npx eslint . 2>/dev/null || echo "no linter configured"

# Run typecheck (if available)
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null || echo "no typecheck configured"
```

### Tier: standard
Run the specific test file that was failing, plus any related test files in the same directory or that import the same module:
```bash
# The originally failing test
npm test -- <test-file>

# Related tests (same directory or importing the fixed module)
npm test -- <related-test-files>
```

### Tier: exhaustive
```bash
# Full test suite
npm test

# If the agent identifies additional edge cases not covered by existing tests,
# write and run those too
```

## Step 7: Loop on Failure

If verification fails:

1. **Iteration count check.** If this is iteration 3 (max), skip to Step 8 with status `unfixed`.
2. **Analyze the new failure.** Read the output, determine if it is the same bug or a new issue introduced by the fix.
3. **Go back to Step 4.** Revert the broken fix if necessary (`git revert HEAD` or edit), then re-implement.

Track iteration count: `attempt 1/3`, `attempt 2/3`, `attempt 3/3`.

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
Report: ~/.agentic-workflow/{REPO_SLUG}/qa/{filename}
```

### Sub-skill Dispatch

If the fix-and-verify loop ends with status `unfixed` (all hypotheses exhausted):
> Skill tool: `bugReport`

Do not invoke bugReport on success — bugHunt's own Step 8 report is sufficient.
