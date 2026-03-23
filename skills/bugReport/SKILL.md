---
name: bugReport
description: Report-only variant of bugHunt — produces a structured bug report with health scores but does NOT fix the bugs. Use for triage and prioritization.
argument-hint: "[area-or-module-to-audit]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Agent, Read, Glob, Grep, Write
---

# Bug Report

Read-only audit that produces a structured bug report with health scores. This skill **never modifies source code** — it is purely diagnostic.

<!-- === PREAMBLE START === -->

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
> | `/officeHours` | Spec-driven brainstorming → EARS requirements + design doc |
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

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
echo "rules-directory: $RULES_OK"
```

Domain rules in `.claude/rules/` load automatically per glob — no action needed if `rules-directory: true`.

If `SKILLS_OK=false` or `BRIDGE_OK=false`, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

If `RULES_OK=false` (and `SKILLS_OK` and `BRIDGE_OK` are both true), do not offer setup.sh. Instead, show:
> "Domain rules not found — run `/bootstrap` to generate `.claude/rules/` for this repo."

Create the output directory for this skill:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/qa"
```

<!-- === PREAMBLE END === -->

**IMPORTANT: This skill is read-only. Do NOT modify any source code, test files, or configuration. Only write the output report.**

## Step 1: Parse Scope

Parse the area or module from the argument.

- **If an argument is provided**, scope the audit to that directory, package, or module.
- **If no argument is provided**, audit the entire project.

## Step 2: Scan

Run all available quality tools and collect their output. Do not stop on failure — collect everything.

```bash
# Typecheck
npm run typecheck 2>&1 || npx tsc --noEmit 2>&1 || echo "SKIP: no typecheck configured"

# Lint
npm run lint 2>&1 || npx eslint . 2>&1 || echo "SKIP: no linter configured"

# Tests
npm test 2>&1 || echo "SKIP: no tests configured"
```

If the scope is a specific module/directory, pass the path to the tools where supported (e.g., `npx eslint <path>`, `npm test -- <path>`).

Capture and store:
- **Test output:** pass count, fail count, skip count, coverage percentage (if reported)
- **Typecheck output:** error count, list of errors with file and line
- **Lint output:** error count, warning count, list of issues with file and line

## Step 3: Investigate

For each failure, warning, or error found in Step 2:

1. **Read the relevant source file** at the reported line using Read.
2. **Understand the context** — what is the code doing, why is it failing?
3. **Classify** each item as one of:

| Classification | Meaning |
|---------------|---------|
| `bug` | Actual defect that causes incorrect behavior |
| `tech-debt` | Code smell, complexity issue, or pattern violation — not currently broken |
| `test-gap` | Missing test coverage for an important code path |
| `false-positive` | Tool is wrong — the code is correct |

## Step 4: Score

Compute health scores on a 0-100 scale.

### Test Health (weight: 40%)
```
score = (pass_count / total_count) * 100
```
If coverage data is available, blend it: `score = (pass_rate * 0.6) + (coverage_pct * 0.4)`.
If no tests exist, score = 0.

### Type Health (weight: 30%)
```
score = max(0, 100 - (error_count * 5))
```
Each typecheck error deducts 5 points. Floor at 0. If no typecheck is configured, score = 50 (unknown).

### Lint Health (weight: 30%)
```
score = max(0, 100 - (error_count * 3) - (warning_count * 1))
```
Each error deducts 3 points, each warning deducts 1. Floor at 0. If no linter is configured, score = 50 (unknown).

### Overall Health
```
overall = (test_health * 0.4) + (type_health * 0.3) + (lint_health * 0.3)
```

## Step 5: Write Report

Write the report to `$HOME/.agentic-workflow/$REPO_SLUG/qa/{timestamp}-audit-{slug}.md` where:
- `{timestamp}` is `YYYYMMDD-HHmmss` format
- `{slug}` is the scoped module name in kebab-case, or `full-project` if no scope

Report format:

```markdown
# Bug Report: {scope or "Full Project Audit"}

**Date:** {ISO timestamp}
**Scope:** {module path or "entire project"}

## Health Score Dashboard

| Metric | Score | Details |
|--------|-------|---------|
| Test Health | {score}/100 | {pass}/{total} tests passing, {coverage}% coverage |
| Type Health | {score}/100 | {n} typecheck errors |
| Lint Health | {score}/100 | {n} errors, {n} warnings |
| **Overall** | **{score}/100** | |

## Bugs

| # | Severity | File | Line | Description |
|---|----------|------|------|-------------|
| 1 | {critical/high/medium/low} | `{file}` | {line} | {description} |

{If no bugs found: "No bugs detected."}

## Tech Debt

| # | File | Line | Description |
|---|------|------|-------------|
| 1 | `{file}` | {line} | {description} |

{If none: "No tech debt items identified."}

## Test Gaps

| # | Area | Description |
|---|------|-------------|
| 1 | `{file or module}` | {what is untested} |

{If none: "Test coverage appears adequate for the scoped area."}

## False Positives

{Count} items classified as false positives (suppressed from bug list).

## Recommended Fix Priority

Based on severity and impact, address issues in this order:

1. {highest priority item — why}
2. {next item — why}
3. {next item — why}
...
```

## Step 6: Report to User

```
Bug report complete.

Scope: {module or "full project"}
Overall health: {score}/100
  Test:  {score}/100
  Type:  {score}/100
  Lint:  {score}/100

Found: {n} bugs, {n} tech debt items, {n} test gaps
Report: ~/.agentic-workflow/{REPO_SLUG}/qa/{filename}

Run /bugHunt to fix individual bugs.
```
