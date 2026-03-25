---
name: design-language
description: Interactive session defining brand personality, aesthetic direction, and design principles. Accepts reference URLs (Figma, Storybook, HTML mockups, any public page), analyzes them via Playwright, then runs a gap-filling Q&A to produce both design-tokens.json and .impeccable.md in one step.
argument-hint: [url1 url2 ...]
allowed-tools: Bash(git *), Read, Write, Glob, AskUserQuestion, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_close, mcp__plugin_playwright_playwright__browser_wait_for
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

## Memory Recall

> **Skip if** this skill is marked `<!-- MEMORY: SKIP -->`, or if `BRIDGE_OK=false`.

Check for prior discussion context in memory before reading the codebase.

**1. Derive a topic string** — synthesize 3–5 words from the skill argument and task intent:
- `/officeHours add dark mode` → `"dark mode UI feature"`
- `/rootCause TypeError cannot read properties` → `"TypeError cannot read properties"`
- `/review 42` → use the PR title once fetched: `"PR {title} review"`
- No argument → use the most specific descriptor available: `"{REPO_SLUG} {skill-name}"`

**2. Search memory:**
```
mcp__agentic-bridge__search_memory — query: <topic>, repo: REPO_SLUG, mode: "hybrid", limit: 10
```

**3. Assemble context:**
```
mcp__agentic-bridge__get_context — query: <topic>, repo: REPO_SLUG, token_budget: 2000
```
(Use `token_budget: 1000` for `/review` and `/addressReview`.)

**4. Surface results:**
- If `get_context` returns a non-empty summary or any section with `relevance > 0.3`:
  > **Prior context:** {summary} *(~{token_estimate} tokens)*
  Use this to inform your approach before continuing.
- If empty, all low-relevance, or any tool error: continue silently — do not mention the search.

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

### 1.1 Warn the user before opening any browser

> "I'll open these URLs in a browser via Playwright. If any require authentication (e.g., Figma design files), I'll pause so you can log in before I proceed."

### 1.2 For each URL

If the URL contains `figma.com`, surface an additional warning before navigating:
> "This is a Figma URL — if it requires login, Playwright will show you the login screen and wait for you to authenticate before continuing."

Then:

1. Navigate: `mcp__plugin_playwright_playwright__browser_navigate` with `{ url: "<the-url>" }`
2. Screenshot: `mcp__plugin_playwright_playwright__browser_take_screenshot`
3. Snapshot: `mcp__plugin_playwright_playwright__browser_snapshot`

Extract from the snapshot and screenshot:

| Token category | What to look for |
|----------------|-----------------|
| **Colors** | Background, text, border, and accent colors (CSS computed values from snapshot) |
| **Typography** | Font families, base font size, heading sizes, line heights, font weights |
| **Spacing** | Common padding/margin values, gap values, grid patterns |
| **Radii** | Border-radius values on cards, buttons, inputs |
| **Motion** | Transition durations and easing values if present |
| **Components** | Component names and structure visible in the accessibility tree (buttons, inputs, cards, navigation patterns, etc.) |

### 1.3 Synthesize across all URLs

- Identify shared patterns — values that appear consistently across multiple URLs
- Resolve conflicts: when values differ, prefer the value from the first URL (primary reference)
- Note which URL each token came from

### 1.4 Build drafts

From the extracted data, build:
- A pre-filled draft of `design-tokens.json` in W3C DTCG format
- A partial `.impeccable.md` with aesthetic signals filled in where confident

These drafts are held in memory and presented during Phase 2 Q&A.

---

## Phase 2: Gap-Filling Q&A

Ask the user these questions interactively via `AskUserQuestion`. Group related questions — don't ask all at once.

**Pre-fill answers** where URL analysis provided a confident signal. Present them as suggestions:
> "From your references I found a dark background (#0f172a), monospace typography (JetBrains Mono), and tight spacing. Does 'precise, minimal, technical' feel right as the brand voice — or would you adjust?"

**Skip questions** that are fully and unambiguously answered by URL analysis (e.g., if all URLs are clearly dark-mode only, skip the light/dark question).

**Always ask** anything that can't be determined visually: primary users, core purpose, emotional response, anti-references, WCAG level.

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

Before writing either file, check if it exists.

If `design-tokens.json` exists:
> "design-tokens.json already exists. Overwrite with extracted values? (yes/no)"

If `.impeccable.md` exists:
> ".impeccable.md already exists. Overwrite? (yes/no)"

Only overwrite if the user confirms.

### 3.2 Write `design-tokens.json`

W3C DTCG format with values from URL analysis, confirmed or adjusted during Q&A. Include all token categories that were resolved (colors, typography, spacing, radii, motion). Omit categories with no confident values rather than leaving placeholder strings.

Example shape:
```json
{
  "color": {
    "accent": { "$value": "#6366f1", "$type": "color" },
    "text-primary": { "$value": "#f8fafc", "$type": "color" },
    "surface": { "$value": "#0f172a", "$type": "color" },
    "border": { "$value": "#1e293b", "$type": "color" }
  },
  "font": {
    "family-sans": { "$value": "Inter, sans-serif", "$type": "fontFamily" },
    "family-mono": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" },
    "size-base": { "$value": "14px", "$type": "dimension" },
    "weight-normal": { "$value": "400", "$type": "fontWeight" },
    "weight-medium": { "$value": "500", "$type": "fontWeight" }
  },
  "spacing": {
    "s1": { "$value": "4px", "$type": "dimension" },
    "s2": { "$value": "8px", "$type": "dimension" },
    "s4": { "$value": "16px", "$type": "dimension" },
    "s8": { "$value": "32px", "$type": "dimension" }
  },
  "radius": {
    "sm": { "$value": "4px", "$type": "dimension" },
    "md": { "$value": "8px", "$type": "dimension" }
  }
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

- <url1> — <one-line note on what was extracted from it>
- <url2> — <one-line note on what was extracted from it>

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

[Color philosophy and constraints — references design-tokens.json for exact values]

## Typography

[Typography approach — scale, hierarchy, font personality]

## Spacing & Layout

[Spacing philosophy — dense vs. generous, grid approach]

## Motion

[Animation philosophy — purpose, duration, easing preferences]

## Accessibility

**WCAG level:** [A/AA/AAA]
[Any additional accessibility commitments]

## Platform Notes

[Web-specific, iOS-specific, or cross-platform considerations]
```

Omit the `## Sources` section entirely if no URLs were provided.

---

## Phase 4: Confirm

Present the written `.impeccable.md` content to the user and ask:
> "Does this capture your design language? I can adjust any section."

Incorporate any corrections and re-save.

---

## Rules

- Preserve all existing content from `DESIGN_SYSTEM.md` — `.impeccable.md` complements, not replaces
- Be specific in descriptions — "clean and minimal" is too vague; "generous whitespace, muted colors, SF Pro typography with tight leading" is useful
- If `design-tokens.json` exists (and user confirmed overwrite), the new file replaces it entirely — don't partially merge
- Do not write placeholder values — if a token wasn't determined, omit the key
