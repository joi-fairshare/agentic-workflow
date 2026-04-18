---
name: shipRelease
description: Ship a release — sync branch, run tests, audit coverage, push, open PR, then auto-invoke syncDocs to update documentation.
---

<!-- MEMORY: SKIP -->

# Ship Release

Syncs your branch, runs tests, audits coverage, pushes, opens a PR, and optionally invokes `syncDocs`.
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## Step 1: Pre-flight Checks

1. Confirm the working tree is clean:
   ```bash
   git status --porcelain
   ```
   If the output is non-empty, **stop** and ask the user to commit or stash their changes before continuing.

2. Parse arguments:
   - `--base <branch>` — the base branch to rebase onto and target for the PR. Default: `main`.
   - `--skip-docs` — if present, skip the `syncDocs` invocation in Step 7.

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
> "Rebase conflicts detected. Resolve them manually, then run `shipRelease` again."

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

Shipped via `shipRelease`.
PRBODY
)"
```

If a PR already exists for this branch, report the existing PR URL instead of creating a duplicate. Check first:
```bash
gh pr list --head {branch} --base {base} --json number,url
```

Capture the PR URL for the report.

## Step 7: Invoke syncDocs

Unless `--skip-docs` was passed, invoke the `syncDocs` skill to update documentation:

```
syncDocs
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
