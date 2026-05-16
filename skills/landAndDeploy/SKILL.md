---
name: landAndDeploy
description: "Wait for PR merge, run deploy command, poll health, run smoke tests, then auto-chain /canary. Configured by .agentic-workflow/deploy.json."
argument-hint: "[pr#] [--wait|--no-wait] [--setup]"
allowed-tools: Bash(gh *), Bash(git *), Bash(curl *), Bash(jq *), Read, Write, Skill
---

# Land and Deploy — Merge, Deploy, Smoke, Chain Canary

Bridges `/shipRelease` and `/canary`. Waits for PR merge, runs the user-defined deploy command, polls health, runs smoke tests, then auto-chains `/canary`.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 35 skills available. Run any as `/<name>`.
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios; do
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

## Overview

Reads `.agentic-workflow/deploy.json` for deploy command, health URL, smoke tests, and timeout. On invocation, resolves the target PR (arg or current branch), optionally polls for merge, executes deploy, verifies health, runs smoke tests, writes a release record, and auto-invokes `/canary` on success. Skipped or `--no-deploy` callers from `/shipRelease` bypass this step entirely.

## Inputs

- PR number (positional arg). If omitted, detect from current branch via `gh pr view --json number,state,mergedAt`.
- `--wait` / `--no-wait` flag:
  - Default `--wait` when invoked from `/shipRelease` auto-chain (PR may not yet be merged at chain time)
  - Default `--no-wait` when invoked standalone (user is at the terminal, expects fast feedback)
- `--setup` flag: run interactive wizard to write `.agentic-workflow/deploy.json`, then exit.
- Config file: `.agentic-workflow/deploy.json` in project root.

## Config schema (`.agentic-workflow/deploy.json`)

```json
{
  "command": "npm run deploy:prod",
  "healthUrl": "https://example.com/health",
  "smokeTests": ["curl -fsS https://example.com/api/ping"],
  "timeout": 600
}
```

- `command` — shell command to run for deploy. Streamed to stdout.
- `healthUrl` — URL polled after deploy; expects 200 OK.
- `smokeTests` — array of shell commands. Each must exit 0.
- `timeout` — seconds. Used for both deploy command and health polling.

## --setup Wizard

When invoked with `--setup`, prompt the user (one question per AskUserQuestion call):

1. Deploy command (e.g., `npm run deploy:prod`)
2. Health URL (e.g., `https://example.com/health`)
3. Smoke test commands (comma-separated; can be empty)
4. Timeout in seconds (default 600)

Write `.agentic-workflow/deploy.json` (create the dir if missing). Exit without deploying.

## Steps (normal mode)

1. If `--setup`: run wizard above and exit.

2. Resolve target PR:
   - Arg given → use it.
   - Else: `gh pr view --json number,state,mergedAt` on current branch. If no PR exists, error: "no PR on this branch; create one with /shipRelease first".

3. Determine wait mode (`--wait` vs `--no-wait`) per defaults above unless explicitly overridden.

4. If PR not merged:
   - `--wait`: poll `gh pr view --json mergedAt` every 30 s, max 30 min. Stop on merge.
   - `--no-wait`: error: "PR #N not merged; pass `--wait` to poll or merge manually first".

5. Load `.agentic-workflow/deploy.json`. If missing, suggest `--setup` and exit.

6. Compute release-id: `<ISO-date>-<short-sha>` where `<short-sha>` is the merge commit SHA.

7. Run `deploy.command`, stream output. Capture exit code.
   - On non-zero exit: write `releases/<release-id>/deploy.md` with FAILED status, suggest `/rootCause`, exit.

8. Poll `deploy.healthUrl` with exponential backoff (1s, 2s, 4s, … capped at 60s between probes; max total `deploy.timeout` seconds). Stop on 200 OK.
   - On timeout: mark deploy DEGRADED in the release record. Continue to smoke tests anyway.

9. Run each `deploy.smokeTests[]` command sequentially. Capture each exit code and stdout.
   - Any non-zero → mark deploy DEGRADED.

10. Write `~/.agentic-workflow/$REPO_SLUG/releases/<release-id>/deploy.md`:
    ```markdown
    # Deploy — <release-id>
    
    **PR:** #<num>
    **Merge SHA:** <full-sha>
    **Deployed:** <ISO date>
    **Verdict:** SUCCESS | DEGRADED | FAILED
    
    ## Deploy command
    `<deploy.command>` — exit <code> in <duration>s
    
    ## Health
    `<deploy.healthUrl>` — first OK at <Ns>, took <total>s
    
    ## Smoke tests
    | Test | Exit | Duration |
    |---|---|---|
    | <cmd> | 0 | <s> |
    
    ## Output excerpts
    <last 50 lines of deploy command output, smoke test stdout snippets>
    ```

11. On SUCCESS, auto-invoke `/canary` via the `Skill` tool, passing the release-id.

## Outputs

- `~/.agentic-workflow/$REPO_SLUG/releases/<release-id>/deploy.md`
- `.agentic-workflow/deploy.json` (only on `--setup`)

## Next steps

- `/canary` — auto-chained on SUCCESS
- `/rootCause` — if deploy or smoke fails
- `/shipRelease --no-deploy` — for next time if you want to skip the auto-chain (e.g., release-branch workflow)
