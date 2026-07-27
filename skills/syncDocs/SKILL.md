---
name: syncDocs
description: Post-ship documentation updater — refreshes README, ARCHITECTURE.md, CHANGELOG, and CLAUDE.md to reflect recent changes.
argument-hint: "[release-id] [--scope readme,architecture,changelog,claude] [--since <ref>] [--commit]"
allowed-tools: Bash(git *), Bash(gh *), Bash(ls *), Bash(grep *), Bash(mkdir *), Bash(SHARED_DIR=*), Bash(source *), Agent, Read, Write, Edit, Glob, Grep, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---
<!-- MEMORY: SKIP -->

# Sync Documentation

Refreshes project documentation to reflect recent changes. Updates only the sections that are stale — does **not** rewrite entire files.

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

- **Release-id** (positional, optional) — canonical CD7 form `<ISO-date>-<short-sha>`. Passed by `/canary` on HEALTHY. The report in Step 5 is written **inside** `releases/<release-id>/` so the whole release stays in one folder.
- `--since <ref>` (optional) — the git ref the change range starts from. `/canary` passes the release's merge SHA so the docs sync covers exactly the shipped release, not an unrelated tag range.
- `--commit` (optional) — commit doc changes directly to the current branch. **Default (flag absent): branch + PR** (this toolkit ships a block-push-main hook; committing to main post-merge would be blocked anyway).
- `--scope` — accepted values (comma-separated, case-insensitive):

| Value | Target file |
|-------|-------------|
| `readme` | `README.md` |
| `architecture` | first match of `Glob("{,planning/,docs/}ARCHITECTURE.md")` |
| `changelog` | `CHANGELOG.md` |
| `claude` | `CLAUDE.md` |

Default (no `--scope` provided): all four documents.

If a target file does not exist in the repo, skip it and note it in the report.

## Step 2: Gather Changes

Determine the range of recent changes:

```bash
# --since <ref> wins; else last tag; else last 20 commits
LAST_REF="{--since ref if provided}"
[ -n "$LAST_REF" ] || LAST_REF=$(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")

git log --oneline "$LAST_REF"..HEAD    # commit summaries
git diff "$LAST_REF"..HEAD --stat      # file-level change stats
git diff "$LAST_REF"..HEAD             # detailed diff for context
```

Store this change context — all agents in Step 3 will receive it.

## Step 3: Spawn Update Agents

For each document in scope, spawn an **Agent** to update it. Spawn all applicable agents **simultaneously** in a single message.

Each agent receives:
- The full contents of the target document (read it first)
- The commit log and diff stats from Step 2
- Specific instructions per document type (below)

**Common rules (append to every agent prompt):** make targeted edits with the Edit tool — do NOT rewrite the entire file; if nothing needs updating, return `NO_CHANGES` (subject to the Step 3.5 post-check).

### README Agent

> You are updating `README.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Keep the existing document structure intact.
> - Update feature lists, badges, and setup instructions ONLY if the recent changes affect them.
> - Add new sections only if a major new feature was introduced.
> - Remove references to features/files that no longer exist.

### ARCHITECTURE Agent

> You are updating the resolved ARCHITECTURE.md (first match of `{,planning/,docs/}ARCHITECTURE.md`) to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Update the directory tree if files/directories were added, removed, or moved.
> - Update component descriptions if their responsibilities changed.
> - Update key rules or patterns if new ones were introduced or old ones changed.

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
> - `NO_CHANGES` is only valid when the range contains nothing meaningful (e.g., only CI/chore commits).

### CLAUDE.md Agent

> You are updating `CLAUDE.md` to reflect recent code changes. You have the current file contents and a list of recent commits with their diffs.
>
> Rules:
> - Update the architecture tree if files/directories were added, removed, or moved.
> - Update the commands section if new scripts were added or existing ones changed.
> - Update patterns section if new patterns were introduced.
> - Update tech stack if dependencies changed significantly.

## Step 3.5: NO_CHANGES Post-Check

An agent may not return `NO_CHANGES` unconditionally — verify it. From the Step 2 diff stats, collect **new paths and new scripts** (added files/directories; new entries in `package.json` `scripts`, `Makefile` targets, etc.). For each doc whose agent returned `NO_CHANGES`, grep the target doc for those additions **where that doc type should mention them** (README: commands/features; ARCHITECTURE: directory tree; CLAUDE.md: commands/structure; CHANGELOG: any non-chore commit). If a relevant addition is absent, the `NO_CHANGES` claim is a violation: **re-dispatch that agent once**, listing the specific missed paths/scripts. If it still returns `NO_CHANGES`, record the discrepancy in the report instead of silently accepting it.

## Step 4: Commit

After all agents complete, check if any files were actually modified:

```bash
git status --porcelain README.md CHANGELOG.md CLAUDE.md {resolved ARCHITECTURE path}
```

If no docs were changed, note "No updates needed" and skip to Step 5.

If docs were changed — **default path (no `--commit`)**: create a branch and open a PR (post-merge you are on the default branch, and this toolkit's block-push-main hook would reject a direct push anyway):

```bash
git checkout -b docs-sync-{release-id or timestamp}
git add README.md CHANGELOG.md CLAUDE.md {resolved ARCHITECTURE path} 2>/dev/null
git commit -m "docs: sync documentation with recent changes"
git push origin docs-sync-{release-id or timestamp}
gh pr create --title "docs: sync documentation" --body "Automated docs sync via /syncDocs for {release-id or ref range}."
```

**With `--commit`**: add + commit directly on the current branch (no push, no PR). Only add files that exist and were modified. Capture the commit SHA (or PR URL).

## Step 5: Report

Resolve the release dir and write the report **inside it** (one-folder-per-release invariant, CD7):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/syncDocs/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
RELEASE_DIR="$AW_DIR/releases/{release-id}"  # arg wins; else newest releases/<ISO-date>-<short-sha>/ dir; else mint from tip SHA
[ -n "{release-id}" ] || RELEASE_DIR=$(ls -1dt "$AW_DIR/releases/"*/ 2>/dev/null | head -1)
[ -n "$RELEASE_DIR" ] || RELEASE_DIR="$AW_DIR/releases/$(date +%F)-$(git rev-parse --short HEAD)"
mkdir -p "$RELEASE_DIR"
```

Write `$RELEASE_DIR/docs-sync.md`:

```markdown
# Documentation Sync

- **Date:** {ISO timestamp}
- **Release:** {release-id or "n/a (standalone)"}
- **Ref range:** {LAST_REF}..HEAD
- **Commit:** {SHA / PR URL / "no commit needed"}
- **NO_CHANGES post-check:** {clean / re-dispatched agents + outcome / recorded discrepancies}

## Documents Updated

| Document | Status | Changes |
|----------|--------|---------|
| README.md | {updated/skipped/not found} | {brief description or "—"} |
| {resolved ARCHITECTURE path} | {updated/skipped/not found} | {brief description or "—"} |
| CHANGELOG.md | {updated/created/skipped/not found} | {brief description or "—"} |
| CLAUDE.md | {updated/skipped/not found} | {brief description or "—"} |
```

Print a summary to the user:

```
Docs synced.
  Updated: {list of updated docs}
  Skipped: {list of skipped/unchanged docs}
  Commit:  {SHA | PR URL | "no changes"}
  Report:  {RELEASE_DIR}/docs-sync.md
```

## Next steps

- `/weeklyRetro` — if end of week, run the retrospective
