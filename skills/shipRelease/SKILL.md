---
name: shipRelease
description: "Ship a release — sync branch, run tests, audit coverage, push, open PR, then auto-chain → /landAndDeploy → /canary → /syncDocs (skip the deploy chain with --no-deploy)."
argument-hint: "[--base main] [--skip-docs] [--no-deploy] [--min-coverage <pct>]"
allowed-tools: Bash(git *), Bash(gh *), Bash(npm *), Bash(npx *), Bash(pytest *), Bash(cargo *), Bash(go *), Bash(bundle *), Bash(coverage *), Bash(ls *), Bash(cat *), Bash(mkdir *), Bash(test *), Bash(SHARED_DIR=*), Bash(source *), Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---
<!-- MEMORY: SKIP -->

# Ship Release

Syncs your branch, runs tests, audits coverage, pushes, opens a PR, and optionally invokes `/syncDocs`.

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

## Step 1: Pre-flight Checks

1. Confirm the working tree is clean:
   ```bash
   git status --porcelain
   ```
   If the output is non-empty, **stop** and ask the user to commit or stash their changes before continuing.

2. Parse arguments:
   - `--base <branch>` — the base branch to rebase onto and target for the PR. Default: `main`.
   - `--skip-docs` — if present, skip the `/syncDocs` invocation in the final auto-chain step.
   - `--no-deploy` — if present, skip the `/landAndDeploy` auto-chain (Step 7) and fall through directly to `/syncDocs`. Use for release-branch workflows where merge happens elsewhere or deployment is manual.
   - `--min-coverage <pct>` — optional. If coverage is measurable and below this threshold, **stop** before push and report.

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

Resolve the shared dir from this skill's own symlink, then detect the runner:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/shipRelease/SKILL.md")")/../_shared"
```

Read `$SHARED_DIR/test-runner-detection.md` and set `TEST_CMD` from its runner table. If no runner is detected, report "tests: n/a — excluded from scoring" and continue (never score an undetected runner as a failure).

Run `TEST_CMD`. If **any tests fail**, **stop** and report:
- Which test runner was used
- The full failure output
- A summary of which tests failed

Do not proceed to push or PR creation on test failure.

## Step 4: Coverage Audit

Set `COVERAGE_CMD` from the coverage table in `$SHARED_DIR/test-runner-detection.md` (already read in Step 3).

If coverage tooling is available:
- Run `COVERAGE_CMD` and report the overall coverage percentage.
- List any files below 80% coverage as warnings (do not fail the release for low coverage).
- If `--min-coverage` was passed and overall coverage is below it, **stop** and report the shortfall.

If no coverage tools are detected, note "Coverage: not available" and continue.

## Step 4.5: App Verification (user-facing diffs)

Check whether the diff touches UI or routes:

```bash
git diff origin/{base}..HEAD --name-only
```

If any changed file is a UI component, page, route, template, or stylesheet:

1. Invoke `Skill(skill="verify-app", args="--yes auto")` — auto mode infers screens from the diff; `--yes` skips the confirmation re-prompt. A `FAIL` verdict **blocks the push**: stop and report the evidence-pack path.
2. **Baseline check:** if `~/.agentic-workflow/$REPO_SLUG/design/screens.json` exists and any of its screens match the changed files/routes, also invoke `Skill(skill="design-verify")`. A FAIL diff (>10%) blocks the push.

If the diff is not user-facing, note "verification: n/a (no UI/route changes)" and continue.

## Step 5: Push

Push the branch to origin:

```bash
git push origin {branch}
```

If the push fails (e.g., rejected due to non-fast-forward), report the error and stop.

## Step 6: Open PR

**Duplicate check first.** If a PR already exists for this branch, report its URL and skip creation:
```bash
gh pr list --head {branch} --base {base} --json number,url
```

Build the PR body from the template in `$SHARED_DIR/pr-body.md` (Read it; re-source `SHARED_DIR` as in Step 3 — shell state does not persist between Bash calls):

- `## Summary` — commits since divergence: `git log origin/{base}..HEAD --format="- %s" --no-merges`, plus the "why".
- `## Evidence` — pull the **newest verification pack**:
  ```bash
  source "$SHARED_DIR/repo-slug.sh"
  ls -1dt "$AW_DIR/verification/"*/ 2>/dev/null | head -1
  ```
  Embed the pack's `evidence` text per `$SHARED_DIR/evidence-pack.md`: the verdict line, journey table, mockup diff %, and cross-check raw output — plus artifact paths. Never just a pointer.
- `## Tests` — runner + counts from Step 3. `## Coverage` — % from Step 4 (or "not available") + files below 80%.
- `## Key decisions` / `## Review resolution` per the template (`None.` when empty).

**Draft-only rule (CD13):** if the diff is user-facing (Step 4.5) and the verification pack is **missing or its verdict is FAIL**, do NOT open a ready PR — create it with `--draft` and a warning checkbox noting the missing/failed evidence.

Create the PR with `gh pr create --base {base} --head {branch} --title "{branch}" --body "..."` (adding `--draft` when the rule above applies). Capture the PR URL and number for the report and the next step.

## Step 7: Auto-chain `/landAndDeploy`

Unless `--no-deploy` was passed, first write the structured ship→deploy handoff (read + deleted by `/landAndDeploy`):

```bash
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/releases"
cat > "$AW_DIR/releases/.pending-ship.json" <<EOF
{ "branch": "{branch}", "base": "{base}", "tip_sha": "{short-sha}",
  "pr": {number}, "pr_url": "{url}", "tests": "passed ({N} tests)",
  "coverage": "{pct}% | not available", "evidence_pack": "{newest pack dir or null}",
  "shipped_at": "{ISO timestamp}" }
EOF
```

Then invoke `/landAndDeploy --wait --chained-from-ship` via the `Skill` tool, passing the PR number captured in Step 6. If the user passed `--skip-docs` to `shipRelease`, also pass `--skip-docs` to `/landAndDeploy`.

The `--chained-from-ship` flag tells `/landAndDeploy` to graceful-degrade if `deploy.json` is missing (a first-time user's `shipRelease` shouldn't hard-fail because the deploy wizard hasn't been run yet). It also tells `/landAndDeploy` to fold the ship-phase metadata from `.pending-ship.json` into its `deploy.md` output rather than it being written by `shipRelease`.

The `--wait` flag tells `/landAndDeploy` to poll for merge before deploying — so this step works correctly even though the PR may not yet be merged at the moment `shipRelease` completes.

The `--skip-docs` flag propagates through the entire chain: `shipRelease → landAndDeploy → canary → syncDocs`. Both `/landAndDeploy` and `/canary` forward the flag; `/canary` suppresses its own auto-`/syncDocs` invocation when the flag is set.

On successful deploy, `/landAndDeploy` auto-chains `/canary`, which on a `HEALTHY` verdict auto-chains `/syncDocs` (unless `--skip-docs` was propagated). The full chain becomes:

```
shipRelease → landAndDeploy → canary → syncDocs
```

If `--no-deploy` was passed, skip this step entirely and fall through to Step 8 (direct `/syncDocs` invocation). Use `--no-deploy` for release-branch workflows where merge happens elsewhere or deployment is manual.

Record whether the deploy chain was started or skipped, and whether `--skip-docs` was forwarded.

## Step 8: Invoke /syncDocs (fallback)

If Step 7 was skipped (because `--no-deploy` was passed) and `--skip-docs` was **not** passed, invoke the `/syncDocs` skill directly to update documentation:

```
/syncDocs
```

If Step 7 ran, do **not** invoke `/syncDocs` here — the `canary → syncDocs` chain handles it.

If `--skip-docs` was passed, skip this step.

Record whether docs were updated, deferred to the canary chain, or skipped.

## Step 9: Report

**Release record handoff.** The canonical release-id scheme (CD7) is `<ISO-date>-<short-sha>`, one dir per release: `releases/<ISO-date>-<short-sha>/`. In the default chain the short SHA is the **merge commit SHA**, generated by `/landAndDeploy` — the canonical post-merge identifier `/canary` also uses. shipRelease cannot know the merge SHA at push time (especially for squash merges), so:

- **Default chain (`/landAndDeploy` is invoked in Step 7):** do **NOT** write a separate `ship.md` here. The ship-phase metadata travels via `releases/.pending-ship.json` (Step 7); `/landAndDeploy` folds it into a `## Ship Phase` subsection at the top of its `deploy.md`. This guarantees `deploy.md` and `canary.md` always live in the same `releases/<ISO-date>-<short-sha>/` subdir — no split across two dirs when tip-SHA ≠ merge-SHA.

- **`--no-deploy` invocation (Step 7 skipped):** since no `/landAndDeploy` will run, shipRelease writes a standalone ship summary to `~/.agentic-workflow/$REPO_SLUG/releases/<ISO-date>-<tip-short-sha>/ship.md` — same CD7 id form, using the **tip SHA** since no merge SHA exists yet (e.g. `2026-05-15-a1b2c3d`). Deploy information will not be available.

  ```markdown
  # Release: {branch}

  - **Release ID:** {ISO-date}-{tip-short-sha}
  - **Date:** {ISO timestamp}
  - **Base:** {base}
  - **Branch:** {branch}
  - **Tip SHA:** {short-sha}
  - **Test result:** passed ({N} tests)
  - **Coverage:** {percentage}% (or "not available")
  - **Files below 80%:** {list or "none"}
  - **PR:** {url}
  - **Deploy chain:** skipped (--no-deploy)
  - **--skip-docs forwarded:** n/a (no deploy chain)
  - **Docs updated:** {yes / skipped}
  ```

Print a summary to the user:

```
Release shipped!
  Branch:  {branch} → {base}
  Tests:   passed
  PR:      {url}
  Deploy:  {chained via /landAndDeploy --wait --chained-from-ship | skipped (--no-deploy)}
  Docs:    {updated | deferred to canary chain | skipped}
  Report:  {handed to /landAndDeploy via .pending-ship.json | ~/.agentic-workflow/<repo-slug>/releases/{ISO-date}-{tip-short-sha}/ship.md}
```

## Next steps

- (auto) `/landAndDeploy` — chained after PR creation, polls for merge then deploys (skip with `--no-deploy`)
- (auto) `/canary` — chained by `/landAndDeploy` on successful deploy
- (auto) `/syncDocs` — chained by `/canary` on `HEALTHY` verdict (or directly by `shipRelease` if `--no-deploy`)
