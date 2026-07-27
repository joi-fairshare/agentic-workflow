---
name: weeklyRetro
description: Weekly retrospective — analyzes git history for per-person breakdowns, shipping streaks, test health trends, and generates actionable insights.
argument-hint: "[--weeks N] [--team user1,user2,...]"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Bash(pytest *), Bash(cargo *), Bash(go *), Bash(bundle *), Bash(coverage *), Bash(date *), Bash(WEEKS=*), Bash(ls *), Bash(cat *), Bash(SHARED_DIR=*), Bash(source *), Read, Write, Glob, Grep, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Weekly Retrospective

Analyzes git history to produce per-person breakdowns, shipping streaks, test health trends, and actionable insights.

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

- `--weeks N` — number of weeks to analyze. Default: `1`.
- `--team user1,user2,...` — comma-separated list of contributors to include. Default: all contributors in the period.

Compute the `--since` date (substitute the parsed weeks count into `WEEKS` — never leave a placeholder):
```bash
WEEKS=1   # <- set from --weeks N (default 1)
SINCE_DATE=$(date -v-"${WEEKS}"w +%Y-%m-%d 2>/dev/null || date -d "${WEEKS} weeks ago" +%Y-%m-%d)
if [ -z "$SINCE_DATE" ]; then
  echo "ERROR: could not compute SINCE_DATE (both BSD and GNU date forms failed)."
fi
echo "since: $SINCE_DATE"
```

**If `SINCE_DATE` is empty, stop.** An empty `--since` would silently turn the retro into an all-history analysis — report the error to the user instead of proceeding.

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

For each contributor, find consecutive calendar days with ≥1 commit, the **longest streak** in the period, and the **current streak** (still active today?). A "day" is the author's commit date (not committer date).

```bash
# Get commit dates per author
git log --since="$SINCE_DATE" --no-merges --format="%an|%aI" | sort
```

## Step 5: Test Health

Run the project's test suite to capture current health:

1. Detect the test runner per `skills/_shared/test-runner-detection.md` (sets `TEST_CMD`). No runner detected ⇒ report test health as **"n/a — excluded"**, never as a failure.
2. Run `$TEST_CMD` and capture:
   - Total pass/fail count
   - Any test failures (names and messages)

3. Find test files added in the period:
   ```bash
   git log --since="$SINCE_DATE" --no-merges --diff-filter=A --name-only --format="" -- "*.test.*" "*.spec.*" "test_*" "*_test.*"
   ```

4. If a previous retro JSON exists, read the **most recent** `~/.agentic-workflow/<repo-slug>/retros/*-weekly.json` (excluding today's) and compare:
   - Tests that started failing since last retro
   - Change in total test count
   ```bash
   SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/weeklyRetro/SKILL.md")")/../_shared"
   source "$SHARED_DIR/repo-slug.sh"
   ls -1t "$AW_DIR/retros/"*-weekly.json 2>/dev/null | head -2
   ```

## Step 5.5: Pipeline Artifacts

Pull this period's skill-pipeline outputs into the retro (skip any dir that doesn't exist):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/weeklyRetro/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls -1dt "$AW_DIR/releases/"*/ 2>/dev/null | head -10          # release records: ship/deploy/canary/docs-sync
ls -1t "$AW_DIR/qa/"*.md 2>/dev/null | head -10               # bugHunt / bugReport outputs
ls -1t "$AW_DIR/verification/"*/pack.json 2>/dev/null | head -10  # evidence packs
```

Read the files whose timestamps fall in the period:
- `releases/<id>/` (`ship.md`, `deploy.md`, `canary.md`, `docs-sync.md`) → releases shipped + canary verdicts.
- `qa/*.md` → bugs found/fixed, health-score snapshots.
- `verification/*/pack.json` → count PASS / WARN / FAIL verdicts (verification trend).

## Step 6: Generate Insights

Analyze the collected data to produce:

### What Shipped
Group commits by area (top-level directory) and type (feat/fix). Summarize as bullet points:
- **area-name**: description of what changed (N commits)

Include releases from Step 5.5: `- release <id>: canary {verdict}`.

### Velocity Trend
If a previous retro JSON exists (Step 5, item 4):
- Compare total commits, lines changed, and contributors.
- Note if velocity is up, down, or steady.

If no previous retro exists, note "First retro — no baseline for comparison."

### Risk Areas
Identify files or directories that may need attention:
- **High churn**: files modified in 3+ separate commits by 2+ authors.
- **Large files**: any single file with 500+ lines changed.
- **Ownership gaps**: directories touched by only one person (bus factor = 1).

### Suggested Focus
Based on the data, suggest 2-3 concrete actions for the next week. **Every suggestion must cite the metric that motivates it**, in the form `(evidence: <metric>=<value> in <path>)` — a suggestion without computed evidence is dropped:
- Areas with high churn that might benefit from refactoring — e.g. `(evidence: commits=7 by 3 authors in src/ingestion/queue.ts)`
- Test coverage gaps, only if coverage data was actually captured — e.g. `(evidence: coverage=64% in verification/<run-id>/pack.json)`
- Knowledge sharing opportunities — e.g. `(evidence: authors=1 in mcp-bridge/src/transport/)`
- Verification failures to chase — e.g. `(evidence: verdict=FAIL in verification/<run-id>/pack.json)`

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

| Type | feat | fix | refactor | test | docs | chore | other |
|------|------|-----|----------|------|------|-------|-------|
| Count | {N} | {N} | {N} | {N} | {N} | {N} | {N} |

**Top areas:** {dir1}, {dir2}, {dir3}
**Longest streak:** {N} consecutive days
**Current streak:** {N} days (active/ended)

## Shipping Streaks

| Contributor | Longest | Current | Active? |
|-------------|---------|---------|---------|
| {name} | {N} days | {N} days | {yes/no} |

## Test Health

- **Suite:** {runner, or "n/a — no runner detected (excluded)"}
- **Result:** {pass}/{total} passed
- **New tests added:** {N}
- **Trend:** {+N tests since last retro / first retro}

## Verification & QA

- **Evidence packs this period:** {N} ({N} PASS / {N} WARN / {N} FAIL)
- **QA reports:** {N} ({paths})
- **Releases:** {list of releases/<id> with canary verdicts, or "none"}

## What Shipped

{bulleted list grouped by area}

## Velocity Trend

{comparison to previous retro or "First retro — no baseline."}

## Risk Areas

{bulleted list of high-churn files, large changes, ownership gaps}

## Suggested Focus for Next Week

{2-3 actionable suggestions}
```

**Also write the machine-readable sibling** `~/.agentic-workflow/<repo-slug>/retros/{date}-weekly.json` — this is what the next retro's trend comparison reads:

```json
{
  "schema": "weekly-retro/v1",
  "period": { "start": "{start_date}", "end": "{end_date}", "weeks": N },
  "totals": { "commits": N, "lines_added": N, "lines_removed": N, "contributors": N },
  "contributors": [ { "name": "...", "commits": N, "added": N, "removed": N, "files": N, "longest_streak": N } ],
  "tests": { "runner": "npm test | pytest | ... | n/a", "passed": N, "total": N, "new_tests": N },
  "verification": { "packs": N, "pass": N, "warn": N, "fail": N },
  "releases": [ "<release-id>" ],
  "qa_reports": N
}
```

Print a summary to the user:

```
Weekly retro complete ({start_date} to {end_date}).
  Contributors: {N}
  Total commits: {N}
  Test health:   {pass}/{total} passed (or n/a)
  Verification:  {N} packs ({N} FAIL)
  Report:        ~/.agentic-workflow/<repo-slug>/retros/{filename} (+ .json sibling)
```

## Next steps

- `/officeHours` — start the next cycle with a feature spec
- `/bugReport` — triage the risk areas surfaced above into a scored health report
- `/syncDocs` — refresh docs if the period shipped releases without a docs pass
