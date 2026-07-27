---
name: verify-web
description: "Playwright-based self-verification of running web apps. Executes journeys through verification lenses (functional, visual, accessibility, error-state, responsive) and writes an evidence pack (pack.json + report.md) on every run."
argument-hint: "[--journey <plan.md>] [--lenses <csv>] [--visual] [--baseline] [--yes] [--base-url <url>] [criteria or 'auto']"
allowed-tools: Bash(git *), Bash(SHARED_DIR=*), Bash(source *), Bash(ls *), Bash(mkdir *), Bash(date *), Read, Write, Glob, Grep, AskUserQuestion, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_click, mcp__plugin_playwright_playwright__browser_fill_form, mcp__plugin_playwright_playwright__browser_press_key, mcp__plugin_playwright_playwright__browser_resize, mcp__plugin_playwright_playwright__browser_console_messages, mcp__plugin_playwright_playwright__browser_network_requests, mcp__plugin_playwright_playwright__browser_wait_for, mcp__plugin_playwright_playwright__browser_evaluate, mcp__plugin_playwright_playwright__browser_select_option, mcp__plugin_playwright_playwright__browser_close, mcp__design-comparison__compare_design, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

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

---

# Verify Web — Browser-Based Self-Verification

Launches Playwright against a running web app and executes **journeys** through **verification lenses**. Every run writes an evidence pack (`pack.json` + `report.md`) per `_shared/evidence-pack.md`.

Shared references resolve from this skill's **own** symlink (never another skill's):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-web/SKILL.md")")/../_shared"
ls "$SHARED_DIR/verification-lenses.md" "$SHARED_DIR/evidence-pack.md"
```

If resolution or `ls` fails, stop and report — do not improvise the journey/lens rules. Read both files before planning.

## Step 1: Parse Arguments

- **`--journey <path>`** — a `verification-plan.md` (template: `_shared/verification-plan-template.md`). Its journeys, lenses, and cross-checks **are** the plan; record the path in `pack.json.plan`. Stop if the path does not exist.
- **`--lenses <csv>`** — narrow the lens set (e.g. `functional,error-state`). Default: all web-applicable lenses.
- **`--visual`** — shorthand for including the `visual` lens.
- **`--baseline`** — the visual lens must diff against `screens.json` baselines; it FAILs if no baseline exists for a verified screen.
- **`--yes`** — non-interactive: skip plan confirmation. Treated as set automatically when invoked by a parent skill (verify-app, specToProvenPR, shipRelease, landAndDeploy) — parent-invoked runs are auto-approved.
- **`--base-url <url>`** — skip URL detection and use this URL.
- **Explicit criteria** — any text after flags is verification criteria.
- **`auto` / no arguments** — infer what to verify from recent git changes.

## Journeys

Defined in `_shared/verification-lenses.md`. A journey is a named, ordered list of `{action, target, assertion}` steps executed in one browser session, `action ∈ navigate | click | fill | select | press | wait`.

**Interaction is mandatory:** ≥3 non-navigate (interactive) steps and ≥1 assertion following a state-mutating action. A plan of only navigate+snapshot pairs is **rejected** — add interactions, or record `journey: waived — <reason>`, which caps the run verdict at WARN.

## Lenses

Web-applicable lenses from the catalog in `_shared/verification-lenses.md`: `functional`, `visual`, `accessibility`, `error-state`, `responsive`. All run by default; `--lenses` narrows. Every lens result lands in `pack.json.lenses[]`; a skipped lens must carry `reason_if_skipped` — silent omission is not allowed.

## Step 2: Detect the App URL

If `--base-url` was given, use it. Otherwise:

1. Read `package.json` — `scripts.dev`/`scripts.start` reveal framework and port (Next.js `:3000`, Vite `:5173`, Angular `:4200`, generic `:3000`).
2. Check `CLAUDE.md` for documented URLs or ports.

Verify reachability with `mcp__plugin_playwright_playwright__browser_navigate`. If navigation fails:
> "The app doesn't appear to be running at {url}. Start the dev server and try again."

## Step 3: Acquire Browser Lock

Acquire in a **single bash invocation** (shell state does not persist between Bash calls):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-web/SKILL.md")")/../_shared"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

If the lock cannot be acquired (timeout):
> "Another browser verification session is in progress. Wait for it to finish or remove `~/.agentic-workflow/.browser.lock` if stale."

Every per-step failure branch must re-source and release **in that same invocation** (`LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; release_lock`). Use `return`, not `exit`, in sourced context — `skill-lock.sh` enables `set -euo pipefail` in the caller's shell. Always release at Step 7, success or failure.

## Step 4: Build the Verification Plan

Create the run directory first (CD5):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)-<slug>"   # <slug> = 2–4 word kebab summary of what is being verified
mkdir -p "$AW_DIR/verification/$RUN_ID"
echo "run dir: $AW_DIR/verification/$RUN_ID"
```

**Plan source (first match wins):**

1. **`--journey` file** — parse its Journeys/Lenses/cross-check tables.
2. **Explicit criteria** — parse into journeys: route to visit, interactions to perform, assertion per step.
3. **Auto (diff-inference)** — infer from recent changes:

```bash
git diff --name-only HEAD~3..HEAD
git log --oneline -5
```

Route/page changes → verify those pages; component changes → verify appearance and behavior; API changes → verify the UI reflects new data; style changes → include the `visual` lens; config changes → verify startup and basic navigation.

**Validate the plan against the journey rules above** — if it has fewer than 3 interactive steps or no post-mutation assertion, rework it or record an explicit waiver. Keep 3–8 checks; more than 10 means the scope is too broad — split into multiple runs.

Present the plan and wait for confirmation — **unless `--yes` is set or the run is parent-invoked**, in which case proceed immediately and note "plan auto-approved (--yes / parent-invoked)" in the report.

## Step 5: Execute Lenses

Execute each selected lens with fully-qualified tools:

### `functional`

Execute journeys step by step: `mcp__plugin_playwright_playwright__browser_click`, `mcp__plugin_playwright_playwright__browser_fill_form`, `mcp__plugin_playwright_playwright__browser_press_key`, `mcp__plugin_playwright_playwright__browser_select_option` (navigation steps via `mcp__plugin_playwright_playwright__browser_navigate`; async UI via `mcp__plugin_playwright_playwright__browser_wait_for`). Assert after each step with `mcp__plugin_playwright_playwright__browser_snapshot`. Then check `mcp__plugin_playwright_playwright__browser_console_messages` (no uncaught errors) and `mcp__plugin_playwright_playwright__browser_network_requests` (no failed calls).

### `visual`

`mcp__plugin_playwright_playwright__browser_take_screenshot` per screen×viewport, saved as `{run-id}/{check}-{viewport}.png` inside `$AW_DIR/verification/`. Baseline lookup: Read `$AW_DIR/design/screens.json` (path echoed from the Step 4 bash block); if it maps the screen to a baseline for this viewport, call `mcp__design-comparison__compare_design` on baseline vs capture and record the numeric diff % in `pack.json.mockup_diff` — thresholds (CD11): **≤2% PASS, 2–10% WARN, >10% FAIL**. With `--baseline` and no covering baseline, the visual lens FAILs; without the flag, note "no baseline" and judge region-level only. Pixel diffs may only claim **region-level** deviations — token-level attribution (e.g. "wrong border-radius token") requires a `mcp__plugin_playwright_playwright__browser_evaluate` computed-style step.

### `accessibility`

`mcp__plugin_playwright_playwright__browser_snapshot` tree: labels, roles, heading order, keyboard reachability of interactive elements.

### `error-state`

Drive invalid input / unknown routes through the journey tools above; assert visible error UI in the snapshot; `mcp__plugin_playwright_playwright__browser_console_messages` shows no uncaught exception.

### `responsive`

`mcp__plugin_playwright_playwright__browser_resize` to the three CD4 viewports — mobile 375×812, tablet 768×1024, desktop 1440×900 — re-snapshot (and re-screenshot if visual lens is active) at each; artifacts keep the `{run-id}/{check}-{viewport}.png` naming.

**Layout claims must be falsifiable:** bind every layout/styling check to a screens.json baseline, a design token, or an explicit user criterion — never a free-floating "positioned as expected".

When all lenses finish, close the session with `mcp__plugin_playwright_playwright__browser_close`.

## Step 6: Write the Evidence Pack

Write both files into `$AW_DIR/verification/$RUN_ID/` following the schema in `_shared/evidence-pack.md` exactly:

- **`pack.json`** — `"schema": "evidence-pack/v1"`, `"skill": "verify-web"`, `"platform": "web"`, `base_url`, `plan` (journey-file path or null), `lenses[]` (every executed/skipped lens with per-check status + evidence), `journeys[]` (per-step status), `cross_checks[]` (from the journey file, with raw output files saved in the run dir), `artifacts[]` (screenshot filenames), `mockup_diff`, `started_at`/`finished_at`.
- **`report.md`** — human-readable summary: app, URL, mode, plan source, per-lens results table, issues found with route/action/expected/actual/suggestion, artifact list.

**Verdict rollup:** any journey or lens FAIL ⇒ `FAIL`; a waived journey, a SKIPPED-with-reason lens, or a mockup diff in 2–10% ⇒ at most `WARN`; otherwise `PASS`.

## Step 7: Release Browser Lock

Always release, regardless of success or failure — a leaked lock blocks all future verification sessions:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-web/SKILL.md")")/../_shared"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; release_lock
```

## Verdict & Gate

**A FAIL verdict forbids downstream PR-open / mark-ready** (gate rule in `_shared/evidence-pack.md`). Consumers (verify-app, specToProvenPR, shipRelease, review) read the pack — do not soften the verdict in prose. End the report with exactly:

```
verdict: <PASS|WARN|FAIL>
evidence_path: <absolute path to verification/<run-id>/>
```

## Rules

- **Never modify code** — this skill is read-only verification. Report issues, don't fix them.
- **Respect the running app** — don't restart servers, modify databases, or change app state beyond normal UI interactions.
- **Every run writes a pack** — a run without `pack.json` + `report.md` is not a verification run.
- **Confirm the plan in auto mode** unless `--yes` or parent-invoked.
- **Always release the browser lock**, even on partial failure.

## Next steps

- `/design-verify-web` — if visual gaps surfaced, run web design verification
- `/bugReport` — if functional gaps surfaced, capture them as a bug report
