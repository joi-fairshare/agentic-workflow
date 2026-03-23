---
name: shipRelease
description: Ship a release — sync branch, run tests, audit coverage, push, open PR, then auto-invoke /syncDocs to update documentation.
argument-hint: "[--base main] [--skip-docs]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *), Bash(npm *), Bash(npx *), Read, Glob, Grep, Skill
---

# Ship Release

Syncs your branch, runs tests, audits coverage, pushes, opens a PR, and optionally invokes `/syncDocs`.

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

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/releases"
```

---

## Step 1: Pre-flight Checks

1. Confirm the working tree is clean:
   ```bash
   git status --porcelain
   ```
   If the output is non-empty, **stop** and ask the user to commit or stash their changes before continuing.

2. Parse arguments:
   - `--base <branch>` — the base branch to rebase onto and target for the PR. Default: `main`.
   - `--skip-docs` — if present, skip the `/syncDocs` invocation in Step 7.

3. Derive the current branch name:
   ```bash
   git branch --show-current
   ```
   If on `main` (or the same as `--base`), **stop** and tell the user: "You are on the base branch. Check out a feature branch first."

## Step 2: Sync

Fetch the latest from origin and rebase on the base branch:

```bash
git fetch origin
git rebase origin/{base}
```

If the rebase encounters conflicts, **stop** immediately and tell the user:
> "Rebase conflicts detected. Resolve them manually, then run `/shipRelease` again."

Do **not** attempt to auto-resolve conflicts.

## Step 3: Test

Detect the project's test runner by checking for project files:

| Check | Runner |
|-------|--------|
| `package.json` exists | `npm test` |
| `pytest.ini`, `pyproject.toml` with `[tool.pytest]`, or `setup.cfg` with `[tool:pytest]` | `pytest` |
| `Cargo.toml` exists | `cargo test` |
| `go.mod` exists | `go test ./...` |
| `Gemfile` exists | `bundle exec rspec` |

Run the detected test command. If **any tests fail**, **stop** and report:
- Which test runner was used
- The full failure output
- A summary of which tests failed

Do not proceed to push or PR creation on test failure.

## Step 4: Coverage Audit

Check for available coverage tooling and run if found:

| Check | Coverage command |
|-------|-----------------|
| `package.json` has `nyc` or `c8` dependency | `npx c8 npm test` or `npx nyc npm test` |
| `package.json` has `vitest` | `npx vitest run --coverage` |
| Python project with `coverage` installed | `coverage run -m pytest && coverage report` |
| `Cargo.toml` with `cargo-tarpaulin` | `cargo tarpaulin` |
| `go.mod` exists | `go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out` |

If coverage tools are available:
- Run the coverage command.
- Report the overall coverage percentage.
- List any files below 80% coverage as warnings (do not fail the release for low coverage).

If no coverage tools are detected, note "Coverage: not available" and continue.

## Step 5: Push

Push the branch to origin:

```bash
git push origin {branch}
```

If the push fails (e.g., rejected due to non-fast-forward), report the error and stop.

## Step 6: Open PR

Generate the PR body from recent commits since divergence from base:

```bash
git log origin/{base}..HEAD --format="- %s" --no-merges
```

Create the PR:

```bash
gh pr create --base {base} --head {branch} --title "{branch}" --body "$(cat <<'PRBODY'
## Summary

{generated list of commits}

---

Shipped via `/shipRelease`.
PRBODY
)"
```

If a PR already exists for this branch, report the existing PR URL instead of creating a duplicate. Check first:
```bash
gh pr list --head {branch} --base {base} --json number,url
```

Capture the PR URL for the report.

## Step 7: Invoke /syncDocs

Unless `--skip-docs` was passed, invoke the `/syncDocs` skill to update documentation:

```
/syncDocs
```

Record whether docs were updated or skipped.

## Step 8: Report

Write the release report to `~/.agentic-workflow/$REPO_SLUG/releases/{timestamp}-{branch}.md` where `{timestamp}` is `YYYYMMDD-HHmmss` format:

```markdown
# Release: {branch}

- **Date:** {ISO timestamp}
- **Base:** {base}
- **Branch:** {branch}
- **Test result:** passed ({N} tests)
- **Coverage:** {percentage}% (or "not available")
- **Files below 80%:** {list or "none"}
- **PR:** {url}
- **Docs updated:** {yes/no/skipped}
```

Print a summary to the user:

```
Release shipped!
  Branch: {branch} → {base}
  Tests:  passed
  PR:     {url}
  Docs:   {updated/skipped}
  Report: ~/.agentic-workflow/{repo-slug}/releases/{filename}
```
