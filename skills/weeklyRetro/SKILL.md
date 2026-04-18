---
name: weeklyRetro
description: Weekly retrospective — analyzes git history for per-person breakdowns, shipping streaks, test health trends, and generates actionable insights.
---

# Weekly Retrospective

Analyzes git history to produce per-person breakdowns, shipping streaks, test health trends, and actionable insights.
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

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

1. Detect the test runner (same logic as `shipRelease` Step 3).
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
