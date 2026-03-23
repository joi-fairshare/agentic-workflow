---
name: bugHunt
description: Fix-and-verify loop with atomic commits and regression test generation. Three tiers — quick (lint+typecheck), standard (unit+integration), exhaustive (full suite + edge cases).
argument-hint: "[--tier quick|standard|exhaustive] [bug-description-or-test-command]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Agent, Read, Write, Edit, Glob, Grep
---

# Bug Hunt

Fix-and-verify loop with atomic commits, regression test generation, and tiered verification.

> **Agentic Workflow** — 21 skills available. Run any as `/<name>`.
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
> | `/officeHours` | YC-style brainstorming → design doc |
> | `/productReview` | Founder/product lens plan review |
> | `/archReview` | Engineering architecture plan review |
> | `/design-analyze` | Extract design tokens from reference sites |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Merge new reference into design language |
> | `/design-mockup` | Generate HTML mockup from design language |
> | `/design-implement` | Generate production code from mockup |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Screenshot diff implementation vs mockup |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
[ -f "$(dirname "$(readlink -f "$HOME/.claude/skills/review/SKILL.md" 2>/dev/null || echo /dev/null)")/../mcp-bridge/dist/mcp.js" ] 2>/dev/null && BRIDGE_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
```

If either check fails, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

Create the output directory for this skill:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/qa"
```

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
