---
name: design-verify-web
description: Playwright screenshots at mobile/tablet/desktop viewports, diff against mockup baseline using design-comparison MCP, and report discrepancies with fix suggestions.
argument-hint: [screen-name]
allowed-tools: Read, Write, Glob, Agent, AskUserQuestion
---
<!-- MEMORY: SKIP -->

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

# Design Verify Web — Playwright Screenshot Diff vs Mockup

Captures screenshots of the live implementation, compares against the mockup baseline, and reports discrepancies with prioritized fix suggestions.

## Step 1: Load Baselines

Find mockup baselines in the design output directory:

```
Glob("~/.agentic-workflow/<repo-slug>/design/mockup-*.png")
```

**Filtering by screen-name:** If a `[screen-name]` argument was provided (e.g., `/design-verify-web dashboard`), filter the baselines to only those matching `mockup-<screen-name>.png`. If no argument was provided, verify all baselines found.

If no baselines match (either no baselines exist, or the specified screen-name has no baseline):
> "No mockup baselines found. Run `/design-mockup-web <screen-name>` first to create a baseline."

## Step 2: Acquire Browser Lock

Source the browser lockfile script and acquire the lock before running any Playwright actions:

```bash
SKILL_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/verify-web/SKILL.md")")"
source "$SKILL_DIR/browser-lock.sh"
acquire_browser_lock
```

If the lock cannot be acquired (timeout), report:
> "Another browser verification session is in progress. Wait for it to finish or remove `~/.agentic-workflow/.browser.lock` if stale."

**Important:** Always release the lock when done, even on errors. If any subsequent step fails, release the lock before exiting.

## Step 3: Capture Implementation Screenshots

Spawn an Agent to capture screenshots at multiple viewports:

1. Navigate to the implementation URL (detect from `package.json` scripts, typically `http://localhost:3000`)
2. Capture at standard viewports:
   - Mobile: 375×812 (iPhone)
   - Tablet: 768×1024 (iPad)
   - Desktop: 1440×900
3. Save each screenshot:
   ```
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-mobile.png
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-tablet.png
   ~/.agentic-workflow/<repo-slug>/design/impl-<screen>-desktop.png
   ```

The agent should use Playwright MCP tools: `browser_navigate`, `browser_resize`, `browser_take_screenshot`.

## Step 4: Diff Against Baselines

For each implementation screenshot, call the design-comparison MCP tool `compare_design` with these parameters:

- **reference:** `~/.agentic-workflow/<repo-slug>/design/mockup-<screen>.png`
- **implementation:** `~/.agentic-workflow/<repo-slug>/design/impl-<screen>-<viewport>.png`

The MCP returns:
- Pixel diff percentage
- Diff image highlighting differences

Save diff images:
```
~/.agentic-workflow/<repo-slug>/design/diff-<screen>-<viewport>.png
```

## Step 5: Report Results

### Pass (< 2% diff):

```
[PASS] Verification Passed
===========================

Screen:     <screen-name>
Diff:       <N>% (threshold: 2%)
Viewports:  mobile [pass], tablet [pass], desktop [pass]

Implementation matches the approved mockup.
```

### Minor Discrepancies (2–10% diff):

```
[WARN] Minor Discrepancies Found
==================================

Screen:     <screen-name>
Diff:       <N>%

Discrepancies:
  1. [viewport] Header height differs by ~8px (impl: 64px, mockup: 72px)
  2. [viewport] Button border-radius uses 4px instead of token value 8px
  3. [viewport] Body text color is #333 instead of token color.text (#1A1A2E)

Suggested fixes:
  • Update header height to match spacing.header token
  • Replace hardcoded border-radius with var(--radius-md)
  • Use var(--color-text) instead of hardcoded #333

Suggested fix path: Run `/design-refine` to address discrepancies, then `/design-verify-web` again.

Diff images saved to ~/.agentic-workflow/<repo-slug>/design/
```

### Major Discrepancies (> 10% diff):

```
[FAIL] Major Discrepancies Found
==================================

Screen:     <screen-name>
Diff:       <N>%

This is a significant deviation from the mockup.

Priority fixes:
  1. [HIGH] Layout structure differs — sidebar missing in implementation
  2. [HIGH] Color scheme not applied — implementation uses default colors
  3. [MED]  Typography scale doesn't match design tokens
  4. [LOW]  Icon sizes inconsistent

Diff images saved to ~/.agentic-workflow/<repo-slug>/design/

Recommended: Run the design-iterator agent for automated multi-pass refinement:
  Use Agent tool with compound-engineering:design:design-iterator subagent
```

## Step 6: Release Browser Lock

Always release the lock after the Agent completes, regardless of success or failure:

```bash
release_browser_lock
```

## Rules

- Always compare against the latest baseline — warn if the baseline is older than the most recent mockup HTML
- Capture all configured viewports, don't skip any
- Report exact pixel values and token references for each discrepancy
- For major diffs, suggest the `design-iterator` compound-engineering agent as an automated fix path
- Do not modify any code — this skill is read-only verification
- If the dev server is not running, advise the user to start it before re-running
