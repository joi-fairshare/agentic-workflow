---
name: design-shotgun
description: "Generate 4–6 mockup variants in parallel with distinct aesthetic directions. Produces a contact sheet for side-by-side comparison and a picked-variant handoff to /design-mockup."
argument-hint: "[feature-name] [--variants N]"
allowed-tools: Bash(*), Agent, Read, Write, Glob, Grep, Skill, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_take_screenshot
---

# Design Shotgun — Parallel Mockup Variants

Generates 4–6 mockup variants in parallel with distinct aesthetic directions. Contact sheet for side-by-side comparison; user picks winner → `/design-mockup` takes it as seed.

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

Sits BEFORE `/design-mockup` in the design pipeline. Spawns N parallel subagents, each with a distinct aesthetic direction (minimalist, brutalist, editorial, glassmorphism, neo-skeuomorphic, swiss-grid). Each subagent invokes the existing `frontend-design` skill with the direction baked into the brief. Outputs all N variants as HTML, plus a contact-sheet HTML embedding them side-by-side, plus Playwright screenshots of each.

## Inputs

- Feature name (positional arg). If omitted, auto-discover from the latest `plans/*` dir.
- `--variants N` (optional, default 4, max 6).
- `design-tokens.json` from project root (required for token-aware generation).
- `.impeccable.md` from project root (required for brand alignment).
- Feature brief from `~/.agentic-workflow/$REPO_SLUG/plans/<feature>/plan.md`.

## Steps

1. Resolve feature name (arg or `ls -t ~/.agentic-workflow/$REPO_SLUG/plans/*/plan.md | head -1` and use its dirname).
2. Resolve `$REPO_SLUG` per `.claude/rules/skills.md` convention.
3. Resolve N (`--variants` flag or 4). Clamp to [2, 6].
4. Read `design-tokens.json` and `.impeccable.md`. Read the plan doc for context.
5. **Pick N aesthetic directions** from this seed list, choosing the N that most diverge from each other given the brand personality in `.impeccable.md`:
   - `minimalist` — restrained typography, generous whitespace, monochrome accents
   - `brutalist` — raw monospace, hard edges, system fonts, minimal styling
   - `editorial` — serif headlines, magazine-style hierarchy, drop caps
   - `glassmorphism` — translucent surfaces, backdrop blur, layered depth
   - `neo-skeuomorphic` — soft shadows, subtle gradients, tactile metaphors
   - `swiss-grid` — strict 12-column grid, Helvetica, asymmetric balance
6. **Dispatch N subagents in parallel** (single message with N `Agent` tool calls). Each subagent receives:
   - Feature brief from the plan
   - `design-tokens.json` content
   - `.impeccable.md` content
   - ONE aesthetic direction (its own; no overlap)
   - Instruction: invoke `frontend-design` skill with the direction baked in, produce a single self-contained HTML file
   - Output path: `~/.agentic-workflow/$REPO_SLUG/design/shotgun/variant-{i}.html` where `i` is the variant number 1..N
7. Wait for all N subagents.
8. Generate `~/.agentic-workflow/$REPO_SLUG/design/shotgun/contact-sheet.html` — a single HTML page with each variant in an `<iframe>` (or `<details>`-wrapped block) labeled with its aesthetic direction. Mobile-friendly grid layout, max 3 columns on desktop.
9. **Screenshot each variant** using Playwright MCP at 1280×800 viewport:
   - Navigate to `file://...variant-{i}.html`
   - Take screenshot → `design/shotgun/variant-{i}.png`
10. Print summary to stdout: list of variants with directions, contact-sheet path, instruction to open it for comparison.

## Outputs

All under `~/.agentic-workflow/$REPO_SLUG/design/shotgun/`:
- `variant-{1..N}.html` — full-page HTML mockups
- `variant-{1..N}.png` — Playwright screenshots
- `contact-sheet.html` — side-by-side comparison page

## Next steps

- `/design-mockup <variant-N>` — user picks a winner; this skill takes its HTML/styling as the seed for a fully-built mockup
- `/design-refine` — if you want to iterate within the chosen direction without rebuilding from scratch
