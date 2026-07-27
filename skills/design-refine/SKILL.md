---
name: design-refine
description: "Dispatch design refinement from impeccable (umbrella refinement skill), emil-design-eng (design engineering principles reference), and taste-skill (modular style packs) with design language context pre-loaded."
argument-hint: "[refinement-intent]"
allowed-tools: Read, Write, Edit, Skill, Glob, Grep, Bash(git *), Bash(ls *), Bash(mkdir *), Bash(SHARED_DIR=*), Bash(source *), AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
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

# Design Refine — Orchestrate Refinement Through Impeccable + Packs

Pre-loads the design language context, then runs a **bounded** refinement sequence: impeccable audit → map findings to packs → dispatch at most 3 refinements → impeccable verify pass → design-verify diff. If no refinement intent is given, analyzes the implementation and suggests intents.

## Pack Selection

`design-refine` orchestrates three external skill packs (all fetched at setup time). Only these registered skill names may be dispatched — there are no per-dimension skills like "colorize" or "typeset"; those are **intents phrased in the args of an `/impeccable` dispatch**.

| Pack | Skill name(s) | Use for |
|---|---|---|
| `pbakaus/impeccable` | `/impeccable` | Umbrella refinement — every dimensional intent (color, typography, spacing, motion, accessibility, responsiveness, icons, dark mode) is expressed as an intent phrase in its args. The canonical entry point and the only dispatch target for dimension-level work. |
| `emilkowalski/skill` | `/emil-design-eng` | Design engineering principles — UI polish, component design, animation decisions. Use as **reference context** when explaining or justifying refinements. |
| `Leonxlnx/taste-skill` — style packs | `/taste-skill`, `/minimalist-skill`, `/brutalist-skill`, `/soft-skill`, `/redesign-skill`, `/brandkit`, `/stitch-skill`, `/gpt-tasteskill`, `/imagegen-frontend-web`, `/imagegen-frontend-mobile` | Style-direction shifts ("more minimalist" → `/minimalist-skill`; "more brutalist" → `/brutalist-skill`; "needs a brand kit" → `/brandkit`). |
| `Leonxlnx/taste-skill` — utility packs | `/output-skill` (complete-output enforcement), `/image-to-code-skill` (image→code fidelity) | **Not style packs.** Compose them into another dispatch when its output risks truncation or must match a reference image — never dispatch them as a style shift. |

## Step 0: Resume Context

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-refine/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/design"
ls "$AW_DIR/design/refine-log.md" 2>/dev/null || echo "refine-log: none yet"
ls -1dt "$AW_DIR/design/verify/"*/ 2>/dev/null | head -1   # newest verify run = pre-refine baseline
git diff --name-only > /tmp/refine-before.txt 2>/dev/null; git status --short
```

- **`Read` `$AW_DIR/design/refine-log.md`** (if present) — do not re-suggest refinements already tried; note their outcomes.
- **Record the pre-refine baseline**: the newest `design/verify/<run-id>/comparison-report.json` (if any) is what Step 5 compares against for regression.
- **Snapshot the changed-file set** (`git diff --name-only`) so Step 4 can isolate what refinement touched.

## Step 1: Analyze Current State

If no refinement intent was given as argument:

1. Read the current implementation files (detect via Glob: `*.tsx`, `*.jsx`, `*.html`, `*.css`, `*.swift`)
2. Analyze against the design language in `.impeccable.md`
3. Suggest the most impactful refinements **as intent phrases**:

```
Design Refinement Analysis
==========================

Current implementation could benefit from:

1. /design-refine "align color usage with the token palette" — 3 hardcoded colors found
2. /design-refine "tighten the heading hierarchy to the design-tokens.json type scale"
3. /design-refine "add hover states, focus rings, and micro-interactions"
4. /design-refine "bring layout spacing onto the spacing scale"

Run any of these to apply the refinement.
```

If an intent was specified, skip to Step 2.

## Step 2: Pre-load Design Context

Skill invocations do not inherit file context — **read the files and inline excerpts into the dispatch args**:

1. `Read` `.impeccable.md` (required — brand personality, aesthetic direction, what to avoid). If missing, warn and offer `/design-language`.
2. `Read` `design-tokens.json` (required — exact token values). If missing, warn and offer `/design-analyze`.
3. Build a **context excerpt** (keep it tight, it rides in args): the brand-personality lines from `.impeccable.md` plus the token groups relevant to the intent (e.g. the full `color` block for a color intent).
4. Collect the **absolute paths** of the implementation files in scope.

## Step 3: Bounded Refinement Sequence

Every dispatch in this sequence uses the registered `impeccable` skill (or a real taste-pack skill) — never a bare dimension name. The canonical dispatch form:

```
Skill(skill="impeccable", args="<intent> — files: <absolute paths>; context: <inlined token/impeccable excerpts from Step 2>")
```

1. **Audit pass:** `Skill(skill="impeccable", args="audit these files against the design language; report dimensional issues (typography, color, spacing, motion, interaction) — files: <abs paths>; context: <excerpts>")`
2. **Map findings to packs:** dimension-level findings → further `/impeccable` intents; style-direction findings → the matching style pack from the table; cite `/emil-design-eng` principles when justifying a refinement.
3. **Dispatch at most 3 refinements** (the user's intent first, then the top audit findings). Style-pack dispatches use the same args shape: `Skill(skill="minimalist-skill", args="<intent> — files: <abs paths>; context: <excerpts>")`.
4. **Verify pass:** `Skill(skill="impeccable", args="verify the previous refinements resolved the audit findings without introducing new issues — files: <abs paths>; context: <excerpts>")`

Append every dispatch (skill, intent, files, outcome) to `$AW_DIR/design/refine-log.md`. The sequence is bounded: one audit, ≤3 refinements, one verify pass — then stop; further rounds are a new `/design-refine` run.

## Step 4: Post-Refinement Token Check

1. `git diff --name-only` again and diff against the Step 0 snapshot → the exact changed-file set.
2. `Grep(pattern: "#[0-9a-fA-F]{3,8}\\b", ...)` and `Grep(pattern: "\\b[0-9]+px\\b", ...)` over each changed file, `output_mode: "content"`, `-n: true`.
3. Compare hits against `design-tokens.json` values. New values introduced → ask via AskUserQuestion whether to add them to `design-tokens.json` (then note `/design-implement` must regenerate platform token files) or replace them with existing tokens.

## Step 5: Verification Gate (mandatory)

Refinement is the drift-likeliest step — always diff against the mockup baseline:

```
Skill(skill="design-verify", args="<screen(s) touched>")
```

Compare the new `comparison-report.json` against the pre-refine baseline recorded in Step 0:

- No baseline existed, or `overall.max_diff_pct` is equal/lower → proceed to Step 6.
- **Regression** (diff % increased or verdict degraded vs pre-refine) → **block**: report the regressing screens/viewports, and either fix forward (targeted `/impeccable` dispatch on the regressing region) or revert the refinement (`git diff` from Step 4 identifies the files). Do not report success on a regression.

## Step 6: Report

```
Refinement Applied
==================

Intent:      <refinement intent>
Dispatched:  <skill + intent per dispatch, ≤5 lines>
Files:       <changed-file set from Step 4>
Token sync:  <in sync / N new values added to design-tokens.json>
Verify:      <run-id> — <verdict> (max diff <pct>% vs pre-refine <pct>%)
```

## Outputs

| Path | Description |
|------|-------------|
| `~/.agentic-workflow/<repo-slug>/design/refine-log.md` | Append-only log of every dispatch (pack, skill, intent, files touched, outcome). Read at Step 0 so runs never repeat failed experiments. |
| `design-tokens.json` | Updated in place when a refinement introduces new token values (see Step 4). |

## Rules

- Always dispatch via the `Skill` tool using registered skill names only (`impeccable`, `emil-design-eng`, taste-pack names) — dimension names like "colorize"/"typeset" are intent phrases inside `args`, never skill names
- Design context must be inlined into every dispatch's args (Step 2) — Skill invocations do not inherit file context
- Bounded sequence: one audit, at most 3 refinement dispatches, one verify pass per run
- Do not invoke a style pack when an `/impeccable` intent covers the issue holistically; never dispatch the utility packs (`output-skill`, `image-to-code-skill`) as style shifts
- If `design-tokens.json` is updated, note that `/design-implement` should be re-run to regenerate platform token files
- Do not modify `.impeccable.md` during refinement — only `design-tokens.json` may be updated
- Always append the run to `refine-log.md`, and never skip the Step 5 verify gate

## Next steps

- `/design-verify` — re-run anytime for a fresh diff against the mockup baseline
- `/design-implement` — if refinements require regenerating platform token files
- `/shipRelease` — ship once the verify verdict is PASS
