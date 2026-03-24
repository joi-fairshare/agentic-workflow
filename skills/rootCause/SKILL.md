---
name: rootCause
description: 4-phase systematic debugging — investigate, analyze, hypothesize, implement. Auto-freezes scope to the module boundary to prevent scope creep.
argument-hint: "[error-message-or-issue-description]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Edit, Glob, Grep
---

# Root Cause Analysis

4-phase systematic debugging with automatic scope freeze at the module boundary.

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

<!-- === PREAMBLE END === -->

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

Then ask the user via AskUserQuestion whether to expand the scope or stop.

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
