---
name: design-mockup-web
description: Generate an HTML mockup informed by the design language, serve it locally, iterate with feedback until approved, then capture mobile/tablet/desktop baselines and register the screen in screens.json for /design-verify-web.
argument-hint: <screen-name>
allowed-tools: Bash(mkdir *), Bash(ls *), Bash(SHARED_DIR=*), Bash(source *), Bash(python3 *), Bash(LOCK_NAME=*), Write, Read, Edit, Glob, AskUserQuestion, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_resize, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_close, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
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

# Design Mockup — Generate HTML Mockup from Design Language

Generate an HTML mockup informed by the design language, serve it locally, iterate with user feedback until approved (capped loop), then capture viewport baselines and register the screen in `screens.json` for `/design-verify-web`.

Artifact names and the `screens.json` schema come from `_shared/design-artifact-paths.md` — read it via `SHARED_DIR` if unsure.

## Step 0: Shotgun Seed (optional)

Check for a picked shotgun variant:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls "$AW_DIR/design/shotgun/picked.json" 2>/dev/null || echo "no shotgun pick"
```

If `picked.json` exists: Read it, Read the variant HTML it points to (`$AW_DIR/design/shotgun/variant-<N>.html`), and use that HTML as the **starting point** for Step 3 instead of generating from scratch. Note the seed variant in the Step 8 report.

## Step 1: Validate Arguments

The user must provide a screen name (e.g., "dashboard", "login", "settings", "onboarding").

If no screen name provided, stop:
> "Usage: `/design-mockup-web <screen-name>`
> Example: `/design-mockup-web dashboard`"

## Step 2: Load Design Context

Read `.impeccable.md` and `design-tokens.json` — palette, typography scale, spacing system, and brand personality must drive every visual decision in the mockup.

## Step 3: Generate HTML Mockup

The mockup must be a **single HTML file** with inline CSS (no external deps except CDN fonts), use **exact token values** from `design-tokens.json`, reflect the `.impeccable.md` personality (not generic Bootstrap/Tailwind defaults), be **responsive** (viewport meta + breakpoints), and use **realistic content** (no "Lorem ipsum").

Save to the canonical path and **echo it** so the user and `/design-implement-web` can find it:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/design"
echo "mockup file: $AW_DIR/design/mockup-<screen-name>.html"
```

Write the HTML to `$AW_DIR/design/mockup-<screen-name>.html`.

## Step 4: Serve the Mockup

Serve the file with a real local server and **record the URL** (`MOCKUP_URL`) — it is reused for every capture in Step 6:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
python3 -m http.server 8721 --directory "$AW_DIR/design" &
echo "MOCKUP_URL=http://localhost:8721/mockup-<screen-name>.html"
```

- If port 8721 is busy, pick another free port and re-echo the URL.
- Alternative: if the mockup must render inside the project's dev server (e.g., it uses project assets), start that server instead and record its URL.

Tell the user to open `MOCKUP_URL` in their browser for review.

## Step 5: Approval Loop (max 5 rounds)

Iterate via `AskUserQuestion` with exactly two options: **Approve** / **Revise**.

- **Revise:** gather specifics (layout, color emphasis, typography, content density, missing elements), Edit the HTML file, tell the user to refresh, and ask again.
- **Approve:** record the current UTC timestamp as `approved_at` — it is written into `screens.json` in Step 7.
- **Cap: 5 rounds.** If round 5 ends without approval: stop, keep the latest HTML, write **no** baseline and **no** `screens.json` entry, and report the mockup as unapproved with the outstanding feedback listed.

## Step 6: Capture Viewport Baselines

Only after approval. First, the overwrite check — if any existing baseline matches, confirm before capturing:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls "$AW_DIR"/design/mockup-web-<screen-name>-*.png 2>/dev/null || echo "no existing baselines"
```

If baselines exist, `AskUserQuestion`: "Baselines already exist for `<screen-name>`. Overwrite? (yes/no)". On "no", skip to Step 7 keeping the old baselines.

Acquire the browser lock in a **single bash invocation** (shell state does not persist between Bash calls):

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

Then capture **all three** viewports inline (no subagent), holding the lock throughout. For each viewport in `mobile` 375×812, `tablet` 768×1024, `desktop` 1440×900:

1. `mcp__plugin_playwright_playwright__browser_navigate` → `MOCKUP_URL`
2. `mcp__plugin_playwright_playwright__browser_resize` → the viewport's width × height
3. `mcp__plugin_playwright_playwright__browser_take_screenshot` → save to `~/.agentic-workflow/<repo-slug>/design/mockup-web-<screen-name>-<viewport>.png` — producing exactly the three `mockup-web-<screen-name>-{mobile,tablet,desktop}.png` baselines.

Finally — success or failure — close the browser (`mcp__plugin_playwright_playwright__browser_close`) and release the lock in a single invocation:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-mockup-web/SKILL.md")")/../_shared"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; release_lock
```

## Step 7: Write/Update screens.json

Determine the **route** where this screen will live in the real app: infer it from the repo's routing (e.g., `app/` / `pages/` directories); if not inferable, `AskUserQuestion` for it (a route of `null` is allowed for screens with no URL yet).

Read `~/.agentic-workflow/<repo-slug>/design/screens.json` if it exists, merge this screen's entry (Read → mutate → Write; never clobber other screens), following the CD4 schema in `_shared/design-artifact-paths.md`:

```json
{ "schema": "screens/v1",
  "viewports": {"mobile":"375x812","tablet":"768x1024","desktop":"1440x900"},
  "screens": { "<screen-name>": {
      "route": "/path-or-null",
      "nav": null,
      "baselines": {
        "mobile":  "mockup-web-<screen-name>-mobile.png",
        "tablet":  "mockup-web-<screen-name>-tablet.png",
        "desktop": "mockup-web-<screen-name>-desktop.png" },
      "approved_at": "<ISO timestamp from Step 5>",
      "baseline_stale": null,
      "source": "design-mockup-web" } } }
```

## Step 8: Report

```
Mockup Approved
===============

Screen:       <screen-name>
Seed:         shotgun variant-<N> | none
File:         ~/.agentic-workflow/<repo-slug>/design/mockup-<screen-name>.html
Served at:    <MOCKUP_URL>
Baselines:    mockup-web-<screen-name>-{mobile,tablet,desktop}.png
screens.json: entry written (route: <route>, approved_at: <ISO>)
```

## Rules

- Every color, font size, and spacing value must come from `design-tokens.json` — no hardcoded values
- The mockup is a design artifact, not production code — optimize for visual fidelity, not code quality
- Include hover states and interactive affordances in the HTML/CSS
- If `.impeccable.md` doesn't exist, warn but still allow creation with manual style guidance
- One baseline set per screen name — overwriting requires the Step 6 confirmation
- Never write baselines or a `screens.json` entry for an unapproved mockup

## Next steps

- `/design-implement <screen-name>` — generate production code from the approved mockup
- `/design-mockup <another-screen>` — mockup additional screens
- `/design-refine` — iterate the HTML mockup before implementation
