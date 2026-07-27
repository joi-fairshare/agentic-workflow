---
name: design-language
description: Interactive session defining brand personality, aesthetic direction, and design principles. Accepts reference URLs (Figma, Storybook, HTML mockups, any public page), analyzes them via Playwright, then runs a gap-filling Q&A to produce both design-tokens.json and .impeccable.md in one step.
argument-hint: [url1 url2 ...]
allowed-tools: Bash(git *), Bash(SHARED_DIR=*), Read, Write, Glob, AskUserQuestion, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_evaluate, mcp__plugin_playwright_playwright__browser_close, mcp__plugin_playwright_playwright__browser_wait_for, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
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

# Design Language — Define Brand Personality

Interactive session that defines brand personality, aesthetic direction, and design principles. Accepts optional reference URLs and uses Playwright to extract design tokens and personality signals before asking strategic questions.

Produces two output files: `design-tokens.json` (W3C DTCG token set) and `.impeccable.md` (brand personality doc for AI consumption).

---

## Phase 1: URL Analysis (skip if no URLs provided)

If no URLs were provided as arguments, skip to Phase 2.

### 1.0 Acquire the browser lock

Only one skill drives the shared Playwright browser at a time. Acquire the lock in a **single Bash invocation** (shell state does not persist between calls) before any navigation:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-language/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/design"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; acquire_lock
```

If acquisition times out, stop and report the holding pid. Note the printed `AW_DIR` — reference screenshots are saved beneath it.

When Phase 1 is complete (all URLs analyzed), release in a single invocation:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-language/SKILL.md")")/../_shared"
LOCK_NAME=browser source "$SHARED_DIR/skill-lock.sh"; release_lock
```

### 1.1 Warn the user before opening any browser

> "I'll open these URLs in a browser via Playwright. If any require authentication (e.g., Figma design files), I'll pause so you can log in before I proceed."

### 1.2 For each URL

1. Navigate: `mcp__plugin_playwright_playwright__browser_navigate` with `{ url: "<the-url>" }`
   - **Figma login gate:** if a login screen appears, call `mcp__plugin_playwright_playwright__browser_wait_for` for a post-login element (the file canvas: `canvas`, or the toolbar filename node) with a generous timeout. If it times out, ask via AskUserQuestion: "Have you finished logging in to Figma? (Done / Skip this URL)" — on Done, retry the wait; on Skip, move to the next URL.
2. Screenshot to disk: `mcp__plugin_playwright_playwright__browser_take_screenshot` with `{ filename: "<AW_DIR>/design/reference-<host>.png" }` — the **absolute** path under the `AW_DIR` printed in 1.0, `<host>` = URL hostname (e.g. `linear.app`). This baseline reference is persisted and listed in `.impeccable.md ## Sources`.
3. Snapshot (structure): `mcp__plugin_playwright_playwright__browser_snapshot` — this returns the accessibility tree (component names, roles, patterns). It does **not** contain CSS values.
4. Computed styles: `mcp__plugin_playwright_playwright__browser_evaluate` with this function — the only reliable source for color/typography/spacing values:

```js
() => {
  const sels = ["body","h1","h2","h3","h4","h5","h6","button","a","[class*=card]"];
  const out = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) continue;
    const cs = getComputedStyle(el);
    out[s] = {
      color: cs.color, background: cs.backgroundColor,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight, padding: cs.padding, margin: cs.margin,
      borderColor: cs.borderColor, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow,
      transitionDuration: cs.transitionDuration, transitionTimingFunction: cs.transitionTimingFunction
    };
  }
  return JSON.stringify(out, null, 2);
}
```

Extract from these sources: **colors** (background/text/border/accent), **typography** (families, sizes, line heights, weights), **spacing** (padding/margin/gap values; screenshot for grid rhythm), **radii**, and **motion** (durations, easing) — all from the `browser_evaluate` computed-style sample; **components** (names, structure, patterns) from the `browser_snapshot` accessibility tree.

### 1.3 Synthesize across all URLs

Identify shared patterns; on conflict prefer the first URL (primary reference); note which URL each token came from.

### 1.4 Build drafts

Build an in-memory draft `design-tokens.json` (W3C DTCG) and a partial `.impeccable.md` with confident aesthetic signals — presented during Phase 2 Q&A.

---

## Phase 2: Gap-Filling Q&A

Ask the user these questions interactively via `AskUserQuestion`, one group at a time. **Pre-fill answers** where URL analysis provided a confident signal and present them as suggestions; **skip questions** fully answered by URL analysis (e.g. all URLs clearly dark-mode only); **always ask** anything not determinable visually: primary users, core purpose, emotional response, anti-references, WCAG level.

### Group 1: Users & Purpose
- Who are your primary users?
- What is the core purpose of this product?
- What emotional response should the design evoke?

### Group 2: Brand Personality
- Describe your brand in 3 words (e.g., "precise, warm, confident")
- Name 1–3 reference products/sites whose aesthetic you admire *(skip if URLs were provided as arguments — those are already your references)*
- Name 1–3 anti-references — aesthetics you want to avoid and why

### Group 3: Aesthetic Direction
- Style direction: minimal, expressive, editorial, brutalist, organic, other?
- Light mode, dark mode, or both? *(skip if unambiguous from URL analysis)*
- Color constraints: existing brand colors to preserve? Accessibility requirements?

### Group 4: Technical Context
- Target platforms: web only, iOS only, or both?
- WCAG compliance level: A, AA, or AAA?
- Any specific framework constraints (Tailwind, SwiftUI, etc.)?

---

## Phase 3: Write Output Files

### 3.1 Check for existing files

If `design-tokens.json` or `.impeccable.md` already exists, ask "`<file>` already exists. Overwrite? (yes/no)" — only overwrite on confirmation.

### 3.2 Write `design-tokens.json`

W3C DTCG format with values from URL analysis, confirmed or adjusted during Q&A. Include all token categories that were resolved (colors, typography, spacing, radii, motion). Omit categories with no confident values rather than leaving placeholder strings.

Example shape:
```json
{
  "color":   { "accent": { "$value": "#6366f1", "$type": "color" } },
  "font":    { "family-mono": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" } },
  "spacing": { "s2": { "$value": "8px", "$type": "dimension" } },
  "radius":  { "md": { "$value": "8px", "$type": "dimension" } }
}
```

### 3.3 Write `.impeccable.md`

```markdown
# Design Language

> This file defines brand personality and aesthetic direction for AI-assisted design.
> It is consumed by Impeccable commands and the `/design-*` skill pipeline.
> See `planning/DESIGN_SYSTEM.md` for strategic design decisions and component catalog.
> See `design-tokens.json` for machine-readable token values.

## Sources

- <url1> (screenshot: ~/.agentic-workflow/<repo-slug>/design/reference-<host1>.png) — <one-line note on what was extracted from it>
- <url2> (screenshot: ~/.agentic-workflow/<repo-slug>/design/reference-<host2>.png) — <one-line note on what was extracted from it>

## Brand Personality

**Three words:** [word1], [word2], [word3]

**Voice:** [description of the brand's visual voice]

## Aesthetic Direction

**Style:** [minimal/expressive/editorial/etc.]

**References:**
- [reference 1] — [what to take from it]
- [reference 2] — [what to take from it]

**Anti-references:**
- [anti-ref 1] — [what to avoid and why]

## Color
[Philosophy and constraints — exact values in design-tokens.json]

## Typography
[Scale, hierarchy, font personality]

## Spacing & Layout
[Dense vs. generous, grid approach]

## Motion
[Purpose, duration, easing preferences]

## Accessibility
**WCAG level:** [A/AA/AAA] [additional commitments]

## Platform Notes
[Web-specific, iOS-specific, or cross-platform considerations]
```

Omit the `## Sources` section entirely if no URLs were provided.

### 3.4 Write minimal `planning/DESIGN_SYSTEM.md`

`.impeccable.md` points at `planning/DESIGN_SYSTEM.md` — this skill is its creator. If it does not exist, write this minimal version (create `planning/` if needed):

```markdown
# Design System

> Strategic design decisions and component catalog for this project.
> Token values live in `design-tokens.json`; brand personality in `.impeccable.md`.

## Design Principles

- [derived from Phase 2 answers — one bullet per principle]

## Component Catalog

| Component | Status | Notes |
|-----------|--------|-------|
| _none yet_ | — | Populated as components are designed via /design-mockup and /design-implement |
```

If `planning/DESIGN_SYSTEM.md` already exists, leave it unchanged.

---

## Phase 4: Approval Gate

Present the written `.impeccable.md` content, then ask via `AskUserQuestion` (max **5 rounds**):

- **Approve** — the design language is accepted as written
- **Revise** — the user describes changes; incorporate them, re-save, and re-present

On **Approve**, record the approval inside `.impeccable.md`, directly under the title:

```markdown
approved: <ISO-8601 timestamp, e.g. 2026-07-27T15:04:05Z>
```

Downstream skills gate on this line. If 5 rounds pass without Approve, stop, list the still-disputed sections, and do **not** write the `approved:` line.

---

## Rules

- Preserve all existing content from `DESIGN_SYSTEM.md` — `.impeccable.md` complements, not replaces
- Be specific in descriptions — "clean and minimal" is too vague; "generous whitespace, muted colors, SF Pro typography with tight leading" is useful
- If `design-tokens.json` exists (and user confirmed overwrite), the new file replaces it entirely — don't partially merge
- Do not write placeholder values — if a token wasn't determined, omit the key

## Next steps

- `/design-mockup` — build the first mockup from the new language
- `/design-shotgun` — explore variants before committing to a direction
