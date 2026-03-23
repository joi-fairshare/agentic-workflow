---
name: weeklyRetro
description: Weekly retrospective — analyzes git history for per-person breakdowns, shipping streaks, test health trends, and generates actionable insights.
argument-hint: "[--weeks N] [--team user1,user2,...]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Read, Write, Glob, Grep
---

# Weekly Retrospective

Analyzes git history to produce per-person breakdowns, shipping streaks, test health trends, and actionable insights.

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

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/retros"
```

---

<!-- === PREAMBLE END === -->

## Step 1: Parse Arguments

- `--weeks N` — number of weeks to analyze. Default: `1`.
- `--team user1,user2,...` — comma-separated list of contributors to include. Default: all contributors in the period.

Compute the `--since` date:
```bash
SINCE_DATE=$(date -v-{N}w +%Y-%m-%d 2>/dev/null || date -d "{N} weeks ago" +%Y-%m-%d)
```

## Step 2: Gather Data

Run the following git commands to collect raw data:

```bash
# Commits by author (summary)
git shortlog -sne --since="$SINCE_DATE" --no-merges

# Commit details: hash, author name, author email, subject, ISO date
git log --since="$SINCE_DATE" --no-merges --format="%H|%an|%ae|%s|%aI"

# File change stats per commit
git log --since="$SINCE_DATE" --no-merges --stat --format=""

# Lines changed by author (numstat format)
git log --since="$SINCE_DATE" --no-merges --format="%an" --numstat
```

If `--team` was specified, filter all data to only include the listed contributors.

## Step 3: Per-Person Breakdown

For each contributor, compute:

| Metric | How |
|--------|-----|
| **Commits** | Count of commits by this author |
| **Lines added** | Sum of additions from `--numstat` |
| **Lines removed** | Sum of deletions from `--numstat` |
| **Files touched** | Unique file paths from `--numstat` |
| **Top areas** | Top 3 directories by number of files changed |
| **Commit types** | Breakdown by conventional commit prefix: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `other` |

Format as a table per person.

## Step 4: Shipping Streaks

For each contributor, analyze their commit dates to find:

- **Consecutive days** with at least one commit.
- **Longest streak** in the period.
- **Current streak** (is it still active as of today?).

A "day" is defined by the author's commit date (not committer date). Use calendar days.

```bash
# Get commit dates per author
git log --since="$SINCE_DATE" --no-merges --format="%an|%aI" | sort
```

## Step 5: Test Health

Run the project's test suite to capture current health:

1. Detect the test runner (same logic as `/shipRelease` Step 3).
2. Run tests and capture:
   - Total pass/fail count
   - Any test failures (names and messages)

3. Check for newly added tests in the period:
   ```bash
   git diff --since="$SINCE_DATE" --no-merges --diff-filter=A -- "**/*.test.*" "**/*.spec.*" "**/test_*" "**/*_test.*"
   ```
   Use `git log` to find test files added in the period:
   ```bash
   git log --since="$SINCE_DATE" --no-merges --diff-filter=A --name-only --format="" -- "*.test.*" "*.spec.*" "test_*" "*_test.*"
   ```

4. If a previous retro report exists in `~/.agentic-workflow/$REPO_SLUG/retros/`, compare current results to the most recent one to identify:
   - Tests that started failing since last retro
   - Change in total test count

## Step 6: Generate Insights

Analyze the collected data to produce:

### What Shipped
Group commits by area (top-level directory) and type (feat/fix). Summarize as bullet points:
- **area-name**: description of what changed (N commits)

### Velocity Trend
If a previous retro exists in the `retros/` directory:
- Compare total commits, lines changed, and contributors.
- Note if velocity is up, down, or steady.

If no previous retro exists, note "First retro — no baseline for comparison."

### Risk Areas
Identify files or directories that may need attention:
- **High churn**: files modified in 3+ separate commits by 2+ authors.
- **Large files**: any single file with 500+ lines changed.
- **Ownership gaps**: directories touched by only one person (bus factor = 1).

### Suggested Focus
Based on the data, suggest 2-3 concrete actions for the next week:
- Areas with high churn that might benefit from refactoring
- Test coverage gaps (if coverage data is available)
- Knowledge sharing opportunities (bus factor = 1 areas)

## Step 7: Write Report

Write the retrospective report to `~/.agentic-workflow/$REPO_SLUG/retros/{date}-weekly.md` where `{date}` is `YYYY-MM-DD` format:

```markdown
# Weekly Retrospective: {start_date} to {end_date}

## Team Summary

| Contributor | Commits | Lines +/- | Files | Top Area | Streak |
|-------------|---------|-----------|-------|----------|--------|
| {name} | {N} | +{add}/-{del} | {N} | {dir} | {N} days |

## Per-Person Details

### {Name}

| Type | Count |
|------|-------|
| feat | {N} |
| fix | {N} |
| refactor | {N} |
| test | {N} |
| docs | {N} |
| chore | {N} |
| other | {N} |

**Top areas:** {dir1}, {dir2}, {dir3}
**Longest streak:** {N} consecutive days
**Current streak:** {N} days (active/ended)

## Shipping Streaks

| Contributor | Longest | Current | Active? |
|-------------|---------|---------|---------|
| {name} | {N} days | {N} days | {yes/no} |

## Test Health

- **Suite:** {runner}
- **Result:** {pass}/{total} passed
- **New tests added:** {N}
- **Trend:** {+N tests since last retro / first retro}

## What Shipped

{bulleted list grouped by area}

## Velocity Trend

{comparison to previous retro or "First retro — no baseline."}

## Risk Areas

{bulleted list of high-churn files, large changes, ownership gaps}

## Suggested Focus for Next Week

{2-3 actionable suggestions}
```

Print a summary to the user:

```
Weekly retro complete ({start_date} to {end_date}).
  Contributors: {N}
  Total commits: {N}
  Test health:   {pass}/{total} passed
  Report:        ~/.agentic-workflow/{repo-slug}/retros/{filename}
```
