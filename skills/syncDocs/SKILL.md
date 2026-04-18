---
name: syncDocs
description: Post-ship documentation updater — refreshes README, ARCHITECTURE.md, CHANGELOG, and AGENTS.md to reflect recent changes.
---

<!-- MEMORY: SKIP -->

# Sync Documentation

Refreshes project documentation to reflect recent changes. Updates only the sections that are stale — does **not** rewrite entire files.
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

## Step 1: Parse Scope

Parse the `--scope` argument. Accepted values (comma-separated, case-insensitive):

| Value | Target file |
|-------|-------------|
| `readme` | `README.md` |
| `architecture` | `planning/ARCHITECTURE.md` |
| `changelog` | `CHANGELOG.md` |
| `agents` | `AGENTS.md` |

Default (no `--scope` provided): all four documents.

If a target file does not exist in the repo, skip it and note it in the report.

## Step 2: Gather Changes

Determine the range of recent changes:

```bash
# Find the last tag, or fall back to last 20 commits
LAST_REF=$(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")

# Commit summaries
git log --oneline "$LAST_REF"..HEAD

# File-level change stats
git diff "$LAST_REF"..HEAD --stat

# Detailed diff for context
git diff "$LAST_REF"..HEAD
```

Store this change context — all agents in Step 3 will receive it.

## Step 3: Update the Documents

If the user explicitly asked for delegated or parallel documentation work, spawn update sub-agents for the documents in scope. Otherwise, update the documents locally in the current session.

For each document you update, use:
- The full contents of the target document (read it first)
- The commit log and diff stats from Step 2
- Specific instructions per document type (below)

### README Agent

> You are updating `README.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Keep the existing document structure intact.
> - Update feature lists, badges, and setup instructions ONLY if the recent changes affect them.
> - Add new sections only if a major new feature was introduced.
> - Remove references to features/files that no longer exist.
> - Do NOT rewrite the entire file. Make targeted edits using the Edit tool.
> - If nothing needs updating, return "NO_CHANGES".

### ARCHITECTURE Agent

> You are updating `planning/ARCHITECTURE.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Update the directory tree if files/directories were added, removed, or moved.
> - Update component descriptions if their responsibilities changed.
> - Update key rules or patterns if new ones were introduced or old ones changed.
> - Do NOT rewrite the entire file. Make targeted edits using the Edit tool.
> - If nothing needs updating, return "NO_CHANGES".

### CHANGELOG Agent

> You are updating `CHANGELOG.md` to reflect recent changes. You have the current file contents and a list of recent commits.
>
> Rules:
> - Append a new entry at the top of the changelog (after the title/header).
> - Use today's date and the version from package.json, Cargo.toml, pyproject.toml, or similar if available. If no version file exists, use "Unreleased".
> - Categorize changes using Keep a Changelog format: Added, Changed, Fixed, Removed.
> - Derive entries from commit messages. Group related commits.
> - Do NOT modify existing entries.
> - If the changelog does not exist, create it with a standard header and the new entry.
> - If nothing meaningful needs updating (e.g., only CI/chore commits), return "NO_CHANGES".

### AGENTS.md Agent

> You are updating `AGENTS.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Update the architecture tree if files/directories were added, removed, or moved.
> - Update the commands section if new scripts were added or existing ones changed.
> - Update patterns section if new patterns were introduced.
> - Update tech stack if dependencies changed significantly.
> - Do NOT rewrite the entire file. Make targeted edits using the Edit tool.
> - If nothing needs updating, return "NO_CHANGES".

## Step 4: Commit

After all agents complete, check if any files were actually modified:

```bash
git status --porcelain README.md planning/ARCHITECTURE.md CHANGELOG.md AGENTS.md
```

If any docs were changed:

```bash
git add README.md planning/ARCHITECTURE.md CHANGELOG.md AGENTS.md 2>/dev/null
git commit -m "docs: sync documentation with recent changes"
```

Only add files that exist and were modified. Capture the commit SHA.

If no docs were changed, note "No updates needed" and skip the commit.

## Step 5: Report

Write the sync report to `~/.agentic-workflow/$REPO_SLUG/releases/{timestamp}-docs-sync.md` where `{timestamp}` is `YYYYMMDD-HHmmss` format:

```markdown
# Documentation Sync

- **Date:** {ISO timestamp}
- **Ref range:** {LAST_REF}..HEAD
- **Commit:** {SHA or "no commit needed"}

## Documents Updated

| Document | Status | Changes |
|----------|--------|---------|
| README.md | {updated/skipped/not found} | {brief description or "—"} |
| planning/ARCHITECTURE.md | {updated/skipped/not found} | {brief description or "—"} |
| CHANGELOG.md | {updated/created/skipped/not found} | {brief description or "—"} |
| AGENTS.md | {updated/skipped/not found} | {brief description or "—"} |
```

Print a summary to the user:

```
Docs synced.
  Updated: {list of updated docs}
  Skipped: {list of skipped/unchanged docs}
  Commit:  {SHA or "no changes"}
  Report:  ~/.agentic-workflow/{repo-slug}/releases/{filename}
```
