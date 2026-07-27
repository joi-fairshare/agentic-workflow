---
name: design-verify-ios
description: Boot simulator if needed, capture screenshot via XcodeBuildMCP, diff against mockup baseline using design-comparison MCP. Reports discrepancies with fix suggestions.
argument-hint: [screen-name]
allowed-tools: Read, Write, Glob, AskUserQuestion, Bash(SHARED_DIR=*), Bash(source *), Bash(ls *), Bash(mkdir *), Bash(date *), Bash(cat *), mcp__xcodebuildmcp__session_show_defaults, mcp__xcodebuildmcp__discover_projs, mcp__xcodebuildmcp__list_schemes, mcp__xcodebuildmcp__list_sims, mcp__xcodebuildmcp__boot_sim, mcp__xcodebuildmcp__build_run_sim, mcp__xcodebuildmcp__build_sim, mcp__xcodebuildmcp__get_app_bundle_id, mcp__xcodebuildmcp__install_app_sim, mcp__xcodebuildmcp__launch_app_sim, mcp__xcodebuildmcp__snapshot_ui, mcp__xcodebuildmcp__screenshot, mcp__design-comparison__compare_design, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---
<!-- MEMORY: SKIP -->

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

<!-- === DESIGN PREAMBLE START === -->

## Design Context — Load Design Language

### Block 1: Load design language

1. Read `.impeccable.md` if it exists:
   - Note the brand personality and aesthetic direction
   - Note the `## Sources` section: the URLs used to build the design tokens
2. Read `design-tokens.json` if it exists (W3C DTCG: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (component catalog, design principles)

If none exist and this skill requires design context:
> "No design language found. Run `/design-language [url1 url2...]` to synthesize from
> reference materials, then retry."

### Block 2: Dynamic component inventory

Run the following scan and surface results as context before proceeding with the skill's own steps.

**Part A: Component library detection**

Read `package.json` (if it exists) and check `dependencies` + `devDependencies` for known libraries:

| Package pattern | Library |
|-----------------|---------|
| `@radix-ui/*` | Radix UI |
| `shadcn-ui`, `@shadcn/*` | shadcn/ui |
| `@headlessui/*` | Headless UI |
| `react-aria`, `@react-aria/*` | React Aria |
| `@mui/*` | Material UI |
| `@chakra-ui/*` | Chakra UI |
| `@mantine/*` | Mantine |
| `antd` | Ant Design |
| `@nextui-org/*` | NextUI |
| `daisyui` | daisyUI |

Cross-reference with the `## Sources` URLs from `.impeccable.md` — if a source URL matches a known component library's docs site (e.g., `ui.shadcn.com`, `radix-ui.com`, `mantine.dev`), note it as the detected library even if `package.json` doesn't yet include it.

For iOS: check Swift files for `import SwiftUI` (standard) or third-party component libs.

**Part B: Repo primitive scan**

```
Glob("src/components/**/*.{tsx,jsx,ts,js}")
Glob("components/**/*.{tsx,jsx,ts,js}")
Glob("app/components/**/*.{tsx,jsx,ts,js}")
Glob("ui/src/components/**/*.{tsx,jsx,ts,js}")
Glob("**/*.swift", limit to top 2 directory levels)
```

Collect file names (not contents), deduplicate, and derive component names from filenames
(e.g., `button.tsx` → `Button`, `card-header.tsx` → `CardHeader`).

Surface as a context note before proceeding:

```
Component context:
  Library:    shadcn/ui (detected from package.json + impeccable.md sources)
  Primitives: Button, Card, Input, Dialog, Badge, Separator (+7 more)

  Use these components in mockups and implementations before inventing new ones.
```

If no library and no primitives found: note "No component library or repo primitives detected — generate from scratch using design tokens."

### Block 3: Orchestration overview

```
Design pipeline:
  /design-language [urls]  →  synthesize tokens + brand personality
  /design-mockup <screen>  →  HTML (web) or SwiftUI (iOS) mockup
  /design-implement        →  production code from approved mockup
  /design-refine           →  Impeccable polish pass
  /design-verify           →  screenshot diff vs mockup baseline

  /design-evolve  can run anytime to merge new reference materials.
```

<!-- === DESIGN PREAMBLE END === -->

---

# Design Verify iOS — Simulator Screenshot Diff vs Mockup

Boots the simulator per `_shared/sim-bootstrap.md`, navigates with snapshot_ui-verified gestures, captures an appearance/size matrix, and diffs each cell against its per-screen mockup baseline. Artifact paths and the `comparison-report.json` schema come from `_shared/design-artifact-paths.md`.

## Step 1: Load screens.json and Baselines

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-verify-ios/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
cat "$AW_DIR/design/screens.json" 2>/dev/null || echo "NO_SCREENS_JSON"
ls "$AW_DIR/design/"mockup-ios-*.png 2>/dev/null
ls "$AW_DIR/design/mockup-ios.png" 2>/dev/null || true
```

Read `$SHARED_DIR/design-artifact-paths.md` for the screens.json (CD4) schema and baseline naming (CD3).

- **Screens to verify:** the `[screen-name]` argument if given, else every screen in `screens.json` with `"source": "design-mockup-ios"`.
- **Baselines:** `mockup-ios-<screen>.png` (light) and, when present, `mockup-ios-<screen>-dark.png` (dark).
- **Legacy baseline:** a bare `mockup-ios.png` (second `ls` line) may be used only for a single light-appearance compare, with the warning: "legacy baseline — re-run /design-mockup to upgrade".

If a requested screen has no entry and no baseline, or none exist at all, stop:
> "No iOS mockup baseline for `<screen>`. Run `/design-mockup-ios <screen>` first."

**Staleness check** — warn (do not stop) if the screen's `baseline_stale` in screens.json is non-null: "baselines predate a design-token update (design-evolve) — re-run /design-mockup-ios".

## Step 2: Acquire Simulator Lock

Single bash invocation per the lock recipe in `$SHARED_DIR/sim-bootstrap.md` (`skill-lock.sh` enables `set -euo pipefail`):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-verify-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

If `acquire_lock` reports TIMEOUT, report "Another skill is using the simulator" and stop. Every failure branch after this point must, in one invocation, re-source (`LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"`) and call `release_lock` before stopping. Use `return`, not `exit`, in sourced context — `exit` after sourcing can kill the caller's shell. Never end this skill with the lock held.

## Step 3: Boot Simulator and Launch App

Follow the canonical sequence in `$SHARED_DIR/sim-bootstrap.md`:

1. `mcp__xcodebuildmcp__session_show_defaults` — verify project/workspace, scheme, simulator
2. If missing/wrong: `mcp__xcodebuildmcp__discover_projs` → `mcp__xcodebuildmcp__list_schemes`
3. `mcp__xcodebuildmcp__list_sims` — pick the target simulator
4. `mcp__xcodebuildmcp__boot_sim` if not already Booted
5. `mcp__xcodebuildmcp__build_run_sim` — or the split path: `mcp__xcodebuildmcp__build_sim` → `mcp__xcodebuildmcp__get_app_bundle_id` → `mcp__xcodebuildmcp__install_app_sim` → `mcp__xcodebuildmcp__launch_app_sim`

If any of these fails, release the lock (Step 2 recipe) and stop with the tool error.

## Step 4: Navigate to Screen — snapshot_ui First

1. `mcp__xcodebuildmcp__snapshot_ui` — inspect the view hierarchy. If the target screen is already showing (labels/identifiers match), skip to Step 5.
2. Otherwise read the screen's `nav` recipe from screens.json — an ordered list of `{"action":"tap","target":"<label or x,y>"}` steps recorded by `/design-mockup-ios`.
3. **Capability probe** (per `$SHARED_DIR/sim-bootstrap.md`): before any gesture, check that the UI-automation workflow tools (tap/swipe/type_text) are available. If absent, print exactly:
   > "XcodeBuildMCP UI-automation workflow not enabled — see github.com/getsentry/XcodeBuildMCP/docs/CONFIGURATION.md. Interaction steps will be SKIPPED (verdict capped at WARN)."
   Then, because this screen **requires navigation**, do not merely cap at WARN: capturing whatever screen happens to be showing would produce a false verdict. Mark the screen **FAIL** with reason `navigation required but gestures unavailable`, and skip its capture.
4. Execute each nav step: resolve label targets to coordinates from the current `mcp__xcodebuildmcp__snapshot_ui` hierarchy, perform the gesture, then re-run `mcp__xcodebuildmcp__snapshot_ui` to assert the expected transition happened. If a step's target cannot be found, mark the screen FAIL with the hierarchy evidence.
5. If navigation is needed but the screen has no `nav` recipe (`null`), mark it FAIL: "no nav recipe in screens.json — re-run /design-mockup-ios <screen> (records one) or navigate the simulator manually and re-run."

## Step 5: Create the Run Directory

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-verify-ios/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)-<screen-or-all>"
mkdir -p "$AW_DIR/design/verify/$RUN_ID"
echo "run-dir: $AW_DIR/design/verify/$RUN_ID"
```

Previous runs are never overwritten.

## Step 6: Capture the Appearance/Size Matrix

For each screen, capture with `mcp__xcodebuildmcp__screenshot` into `$AW_DIR/design/verify/$RUN_ID/<screen>-<cell>.png`, one cell at a time:

| Cell | What | Diffed against |
|------|------|----------------|
| `light` | light appearance (always) | `mockup-ios-<screen>.png` |
| `dark` | dark appearance | `mockup-ios-<screen>-dark.png` when it exists; otherwise capture for the record, no diff |
| `dynamic-type` | one Dynamic Type step-up; sanity-check for truncation/overlap via `mcp__xcodebuildmcp__snapshot_ui` | no diff (recorded observation) |
| `<class2>-light` | a second device class (e.g. iPad) when `mcp__xcodebuildmcp__list_sims` offers one | recorded; diffed only if a matching baseline exists |

Appearance/Dynamic Type switching requires the simulator-management workflow; if those tools are not enabled, record the affected cells as `SKIPPED — simulator management workflow not enabled` and cap the run verdict at **WARN** (the `light` cell alone can still PASS a cell-level diff, but never the overall run).

## Step 7: Diff Against Baselines

For each matrix cell with a baseline, call `mcp__design-comparison__compare_design`:

- **reference:** the baseline PNG from Step 1
- **implementation:** `$AW_DIR/design/verify/$RUN_ID/<screen>-<cell>.png`

Record the response's **numeric diff-percentage field** as `diff_pct`; save the returned diff image to `$AW_DIR/design/verify/$RUN_ID/<screen>-<cell>-diff.png`. Cell verdict (CD11): `≤2%` PASS · `2–10%` WARN · `>10%` FAIL.

## Step 8: Write comparison-report.json (Run Manifest)

Write `$AW_DIR/design/verify/$RUN_ID/comparison-report.json` per the schema in `$SHARED_DIR/design-artifact-paths.md`, with the matrix cell carried in the `viewport` field:

```json
{ "schema": "comparison-report/v1", "run_id": "<run-id>",
  "screens": [ { "screen": "...", "viewport": "light|dark|dynamic-type|<class2>-light", "baseline": "...",
                 "capture": "...", "diff_image": "...", "diff_pct": 0.0, "verdict": "PASS|WARN|FAIL" } ],
  "overall": { "max_diff_pct": 0.0, "verdict": "PASS|WARN|FAIL" } }
```

`overall.verdict` = worst cell verdict (SKIPPED cells cap it at WARN); `overall.max_diff_pct` = max `diff_pct`. Nav-failed screens get `diff_pct: 100`, `verdict: "FAIL"`, and the reason recorded in place of the diff image path. This file is the run's gate manifest — the dispatcher and ship chain read it.

## Step 9: Report Results

**Report honesty (region-level only):** a pixel diff can say *where* pixels differ ("header area differs by N%"), never *why*. Do not attribute deviations to specific Theme values or tokens — there is no computed-style probe on iOS, so token-level attribution is forbidden.

```
[<PASS|WARN|FAIL>] iOS Design Verification — <screen(s)>
=========================================================
Overall:  <verdict>  (max diff <N>% · thresholds: ≤2% PASS / ≤10% WARN / >10% FAIL)

| screen | cell | diff % | verdict | deviating regions |
|--------|------|--------|---------|-------------------|

Skipped cells: <list with reasons, or "none">
Artifacts: ~/.agentic-workflow/<repo-slug>/design/verify/<run-id>/
```

For WARN/FAIL cells, describe the deviating regions and point at the diff image; suggest `/design-refine` or `/design-implement-ios`, then `/design-verify-ios` again.

## Step 10: Release Simulator Lock

Always — success or failure (single invocation, re-sourced):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-verify-ios/SKILL.md")")/../_shared"
LOCK_NAME=ios-sim source "$SHARED_DIR/skill-lock.sh"; release_lock
```

## Rules

- Never diff a capture whose on-screen content was not confirmed via `mcp__xcodebuildmcp__snapshot_ui`
- Region-level findings only — no token/Theme attribution (Step 9)
- Do not modify any code — this skill is read-only verification
- If the simulator shows an unexpected state (system dialog, wrong screen after nav), record it as evidence and mark the affected screen FAIL rather than guessing

## Next steps

Gate on `overall.verdict` — a FAIL run **blocks** the `/shipRelease` suggestion:

- **PASS** — `/shipRelease` — diff is clean, ship the release
- **WARN** — `/design-refine` — address minor discrepancies or enable the missing simulator workflows, then `/design-verify-ios` again
- **FAIL** — `/design-refine` or `/design-implement-ios` — significant deviation; re-verify before any ship step
