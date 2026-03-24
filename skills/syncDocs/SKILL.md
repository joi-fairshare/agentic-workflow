---
name: syncDocs
description: Post-ship documentation updater — refreshes README, ARCHITECTURE.md, CHANGELOG, and CLAUDE.md to reflect recent changes.
argument-hint: "[--scope readme,architecture,changelog,claude]"
disable-model-invocation: true
allowed-tools: Bash(git *), Agent, Read, Write, Edit, Glob, Grep
---

# Sync Documentation

Refreshes project documentation to reflect recent changes. Updates only the sections that are stale — does **not** rewrite entire files.

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

## Step 1: Parse Scope

Parse the `--scope` argument. Accepted values (comma-separated, case-insensitive):

| Value | Target file |
|-------|-------------|
| `readme` | `README.md` |
| `architecture` | `planning/ARCHITECTURE.md` |
| `changelog` | `CHANGELOG.md` |
| `claude` | `CLAUDE.md` |

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

## Step 3: Spawn Update Agents

For each document in scope, spawn an **Agent** to update it. Spawn all applicable agents **simultaneously** in a single message.

Each agent receives:
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

### CLAUDE.md Agent

> You are updating `CLAUDE.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
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
git status --porcelain README.md planning/ARCHITECTURE.md CHANGELOG.md CLAUDE.md
```

If any docs were changed:

```bash
git add README.md planning/ARCHITECTURE.md CHANGELOG.md CLAUDE.md 2>/dev/null
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
| CLAUDE.md | {updated/skipped/not found} | {brief description or "—"} |
```

Print a summary to the user:

```
Docs synced.
  Updated: {list of updated docs}
  Skipped: {list of skipped/unchanged docs}
  Commit:  {SHA or "no changes"}
  Report:  ~/.agentic-workflow/{repo-slug}/releases/{filename}
```
