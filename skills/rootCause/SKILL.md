---
name: rootCause
description: 4-phase systematic debugging — investigate, analyze, hypothesize, implement. Auto-freezes scope to the module boundary to prevent scope creep.
---

# Root Cause Analysis

4-phase systematic debugging with automatic scope freeze at the module boundary.
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## Step 1: Parse Input

Extract the error message or issue description from the argument. This is the starting point for the investigation.

## Phase 1: Investigate

Reproduce the error and collect evidence.

1. **Run the failing command or test.** If the argument contains a runnable command (e.g., `npm test`, a file path with a stack trace hint), execute it to reproduce the failure. Capture the full output including stack traces.
2. **If no runnable command**, use Grep and Glob to search for the error message in the codebase. Find related test files and run them.
3. **Collect artifacts:**
   - Full error output / stack trace
   - List of affected files (from the stack trace or search results)
   - Related test files

## Phase 2: Analyze

Read the relevant source and map the call chain.

1. **Read every file** identified in Phase 1. Follow imports and function calls from the error site back to the root cause.
2. **Map the call chain** — document the sequence of function calls from the entry point to the error site.
3. **Identify the module boundary.** The boundary is the smallest enclosing unit: a package (if monorepo), a directory with its own concern, or a namespace. Declare it explicitly:

> **SCOPE FREEZE:** Module boundary is `<path-or-package>`. All fixes in Phase 4 must stay within this boundary.

## Phase 3: Hypothesize

Generate 2-3 hypotheses ranked by likelihood.

For each hypothesis, document:
- **Hypothesis:** One-sentence description of the suspected cause.
- **Confirms if:** What evidence or test result would confirm this hypothesis.
- **Rules out if:** What evidence or test result would eliminate this hypothesis.
- **Likelihood:** High / Medium / Low.

## Phase 4: Implement

Fix the most likely cause first.

1. **Implement the fix** for hypothesis #1. All changes MUST stay within the declared module boundary.
2. **Run the original failing command** to verify the fix.
3. **If it still fails**, revert the change and move to hypothesis #2. Repeat up to hypothesis #3.
4. **If a fix requires changes outside the module boundary**, do NOT make the change. Instead, flag it:

> **SCOPE BREACH:** Fixing this requires changes in `<outside-path>`. Asking the user for permission before proceeding.

Then ask the user directly whether to expand the scope or stop.

## Step 6: Write Investigation Report

Write the report to `$HOME/.agentic-workflow/$REPO_SLUG/investigations/{timestamp}-{slug}.md` where:
- `{timestamp}` is `YYYYMMDD-HHmmss` format
- `{slug}` is a short kebab-case summary of the error (max 40 chars)

Report format:

```markdown
# Investigation: {short description}

**Date:** {ISO timestamp}
**Status:** {fixed | unfixed | scope-breach}

## Error Description

{Original error message and context}

## Module Boundary

`{declared boundary path}`

## Call Chain

{entry-point} -> {fn1} -> {fn2} -> {error-site}

## Hypotheses

| # | Hypothesis | Likelihood | Result |
|---|-----------|------------|--------|
| 1 | {description} | High | {confirmed/ruled-out/untested} |
| 2 | {description} | Medium | {confirmed/ruled-out/untested} |
| 3 | {description} | Low | {confirmed/ruled-out/untested} |

## Root Cause

{Confirmed root cause explanation}

## Fix Applied

{Description of the fix, with file paths and line numbers}

- `{file}:{line}` — {what changed}

## Verification

{Command run and its output — pass/fail}
```

## Step 7: Report to User

```
Root cause analysis complete.

Status: {fixed | unfixed | scope-breach}
Module boundary: {path}
Root cause: {one-line summary}
Report: ~/.agentic-workflow/{REPO_SLUG}/investigations/{filename}
```

### Sub-skill Dispatch

If Phase 4 ends with status `unfixed` or `scope-breach`:
Continue with [bugHunt](../bugHunt/SKILL.md) using `"<error slug from Step 1>"` only if the issue remains unresolved. Do not continue into `bugHunt` if the fix was already verified — rootCause's own report is sufficient on success.
