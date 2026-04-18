---
name: design-language
description: Interactive session defining brand personality, aesthetic direction, and design principles. Accepts reference URLs (Figma, Storybook, HTML mockups, any public page), analyzes them via Playwright, then runs a gap-filling Q&A to produce both design-tokens.json and .impeccable.md in one step.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

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

Ask the user these questions interactively. Group related questions — don't ask all at once.

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
