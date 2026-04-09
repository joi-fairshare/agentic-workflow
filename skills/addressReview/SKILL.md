---
name: addressReview
description: Address PR review comments by spawning domain-specific implementation agents in parallel. Reads from ~/.agentic-workflow/<repo-slug>/reviews/<pr>.json as source of truth, merges any new human GitHub comments, implements fixes, and updates the state file. Can be re-run to continue the review loop.
argument-hint: [pr-number-or-url]
allowed-tools: Bash(gh *), Bash(git *), Agent, Read, Edit
---

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

# Address PR Review

Implements fixes for outstanding review issues. The local state file is the source of truth — run this as many times as needed until all issues are resolved.

## Step 1: Resolve the PR

**If an argument was provided**, use it directly:
```bash
gh pr view <argument> --json number,title,headRefName,baseRefName,url,headRepository
```

**If no argument**, auto-detect from the current branch:
```bash
gh pr list --head $(git branch --show-current) --json number,title,url
```

If multiple PRs are found, list them and ask the user to pick one.

If no PRs are found: "No open PR found for the current branch. Use `/addressReview <number>` to specify one."

## Step 2: Load State File

Read `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`.

If the file does not exist:
> "No local review state found for PR #{number}. Run `/review` first."

## Step 3: Fetch New Human Comments from GitHub

Fetch all GitHub comments created **after** `reviewed_at` in the state file:

```bash
# Top-level issue comments
gh api repos/{owner}/{repo}/issues/{number}/comments \
  --jq '[.[] | select(.created_at > "{reviewed_at}") | {id, body, user: .user.login, created_at, path: null, diff_position: null, source: "human"}]'

# Inline PR review comments
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '[.[] | select(.created_at > "{reviewed_at}") | {id, body, user: .user.login, created_at, path, position, source: "human"}]'
```

Filter out comments posted by bots or CI systems (check `user.login` for `[bot]` suffix or known CI usernames).

Append any new comments to a `human_comments` array in the state file. Update `human_comments_fetched_at` to now.

## Step 4: Build the Issue List

Collect all unaddressed items:

**From state file** (`addressed: false`):
- All issues across all `reviewers[].issues` entries

**From new human comments** (all — humans comment when something needs attention):
- Each comment becomes a candidate issue for triage

**Filter by severity** (for structured issues):
- Default: `blocking` and `issue` only
- Pass `--all` to include `suggestion` and `nit`

Report to the user:
```
PR #{number}: "{title}"

Outstanding items:
  X blocking   (structured)
  Y issue      (structured)
  Z new human comments
  (W suggestions/nits skipped — pass --all to include)

Already addressed: N items
```

If everything is already addressed, stop:
> "All review items have been addressed. Consider running /postReview if you haven't published yet."

## Step 5: Triage for Implementation

Spawn a **general-purpose** subagent with the triage prompt from [address-triage-prompt.md](address-triage-prompt.md).

Inject:
- `{structured_issues}` — JSON array of unaddressed structured issues
- `{human_comments}` — JSON array of new human comments
- `{diff}` — output of `gh pr diff {number}`
- `{file_list}` — changed file paths

Parse the returned JSON array of implementation assignments.

## Step 6: Checkout and Spawn Parallel Implementers

Check out the PR branch:
```bash
gh pr checkout {number}
```

Then spawn **all implementation agents simultaneously** in a single message. Each receives the prompt from [implementer-prompt.md](implementer-prompt.md) with:
- `{agent}`, `{focus}`, `{issues}` — from triage output
- `{number}`, `{owner}`, `{repo}`, `{branch}` — PR coordinates
- `{REPO_SLUG}` — repo slug derived in the preamble

## Step 7: Update State File

After all implementers complete, update `~/.agentic-workflow/{REPO_SLUG}/reviews/{number}.json`:

For each issue that was addressed:
- Set `"addressed": true`
- Set `"addressed_at"` to current ISO timestamp
- Set `"addressed_by"` to the agent name
- Set `"fix_commit"` to the commit SHA the agent reported

For new human comments that were addressed, add them to the state file under `human_comments` with the same fields.

Update `"last_addressed_at"` at the top level.

Use the Edit tool to update the file.

## Step 8: Report

```
Address complete for PR #{number}: "{title}"

Implemented:
  • security-engineer — 2 issues fixed (commit abc1234)
  • typescript-pro — 1 issue fixed (commit def5678)

Still outstanding (if any):
  [blocking] src/auth.ts — JWT not verified (agent error — address manually)

Run /addressReview again to continue, or /postReview to publish.
```
