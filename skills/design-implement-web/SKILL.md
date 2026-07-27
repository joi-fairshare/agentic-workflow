---
name: design-implement-web
description: Generate web production code from an approved mockup — design-tokens.css + Tailwind extension generated from design-tokens.json, React/Next.js components, token-compliance scan, and a mandatory design-verify-web gate.
argument-hint: "<screen-name>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git *), Bash(ls *), Bash(SHARED_DIR=*), Bash(source *), AskUserQuestion, Skill, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff, mcp__prism-mcp__session_task_route, mcp__prism-mcp__prism_infer
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

# Design Implement Web — Generate Production Code from Mockup

Generate production-ready code from an approved mockup, generating token files directly from `design-tokens.json`, then proving the result against the mockup baseline before claiming completion.

## Step 1: Select Mockup

Locate mockup sources in priority order — HTML source files are far more useful for code generation than PNG screenshots.

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/design-implement-web/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
ls "$AW_DIR/design/mockup-"*.html 2>/dev/null          # HTML sources (preferred)
ls "$AW_DIR/design/mockup-web-"*.png 2>/dev/null       # CD3 PNG baselines (fallback)
ls "$AW_DIR/design/mockup-"*.png 2>/dev/null           # legacy baseline — re-run /design-mockup to upgrade
```

Selection rules (artifact ownership table: `$SHARED_DIR/design-artifact-paths.md`):

- **No mockups found:** stop — "Run `/design-mockup <screen-name>` first."
- **One mockup:** use it automatically (prefer HTML when both exist for the same screen).
- **Multiple mockups:** list both types with their source annotated and ask via AskUserQuestion which to implement.

When an HTML source exists, it is the primary reference for layout and structure; a PNG baseline for the same screen is supplementary. **Record which file was actually selected and whether it is HTML or PNG** — the Step 5 report and `implement-report.json` must name the real source, never assume PNG.

## Step 2: Generate Token Files

Generate both files directly from `design-tokens.json` (W3C DTCG: nested objects with `$value`/`$type` leaves). No external bridge is involved.

**1. CSS custom properties — `design-tokens.css`:**

- Flatten each token path to a kebab-case variable: `color.text-primary` → `--color-text-primary`, `spacing.s2` → `--spacing-s2`, `font.family-mono` → `--font-family-mono`.
- Emit a single `:root { ... }` block containing every token.
- If the token set defines dark-mode variants (e.g. `color.dark.*` or dark values in `$extensions`), emit an additional `@media (prefers-color-scheme: dark) { :root { ... } }` block overriding only the affected variables.

**2. Tailwind config extension:**

- If a `tailwind.config.{ts,js,mjs,cjs}` exists, edit it in place: extend `theme.extend.colors`, `theme.extend.spacing`, `theme.extend.fontFamily`, and `theme.extend.borderRadius` with entries that reference the CSS variables (e.g. `accent: "var(--color-accent)"`).
- If no Tailwind config exists, write `tailwind.preset.js` at the project root with the same `theme.extend` shape and note in the report that it must be wired into a future config.

**Exact output paths:**

| File | Path |
|---|---|
| CSS custom properties | `<project-root>/styles/design-tokens.css` — if the project keeps global CSS elsewhere (`src/styles/`, `app/`), follow the existing location; create `styles/` only if no convention exists |
| Tailwind extension | existing `tailwind.config.{ts,js,mjs,cjs}` edited in place; else `<project-root>/tailwind.preset.js` |

Import `design-tokens.css` from the app's global stylesheet or root layout if it is not already imported.

## Step 3: Generate Component Code

Using the mockup as visual reference and the generated token files:

- Generate React/Next.js components (or plain HTML/CSS if no framework detected)
- Import from `tokens.css` or use Tailwind classes from the preset
- Follow the component structure visible in the mockup
- Use semantic HTML elements
- Include responsive breakpoints matching the mockup

Reference `.impeccable.md` for design personality — spacing density, animation approach, interaction patterns.

## Step 3.5: Token Compliance Scan

**Always run** a Grep scan over every file created or modified in Steps 2–3 (excluding `design-tokens.css` itself, which legitimately holds raw values):

```
Grep(pattern: "#[0-9a-fA-F]{3,8}\\b", path: <each changed file>, output_mode: "content", -n: true)
Grep(pattern: "\\b[0-9]+px\\b", path: <each changed file>, output_mode: "content", -n: true)
```

Report every hit as `file:line — <matched value>`. For each: replace it with the corresponding token variable, or record an explicit justification when no token corresponds (e.g. `1px` hairline borders). Unjustified hits must be fixed before Step 4.

**Dark factory (optional):** follow `$SHARED_DIR/dark-factory.md` using its "design-implement (token-compliance)" objective template — gate on `dark-factory.json`, route via `mcp__prism-mcp__session_task_route`, run `mcp__prism-mcp__prism_infer` only on a `claw` target, and verify any reported violations yourself (re-Grep) before acting on them. Config absent ⇒ skip silently. The Grep scan above runs regardless.

## Step 4: Verification Gate (mandatory)

Run the visual diff against the mockup baseline:

```
Skill(skill="design-verify-web", args="<screen-name>")
```

Read the run's `design/verify/<run-id>/comparison-report.json` (schema and CD11 thresholds: `$SHARED_DIR/design-artifact-paths.md`). The gate binds to `overall.verdict`:

- `PASS` (≤2%) or `WARN` (2–10%) → implementation may complete.
- `FAIL` (>10%) → print `[BLOCKED]` followed by the failing screen/viewport rows and the required fixes (region-level deviations from the report). **Never print "Implementation Complete" while the verdict is FAIL** — fix the deviations and re-run this step.

## Step 5: Report

Write `$AW_DIR/design/implement-report.json` (machine artifact — consumed by design-verify, review, shipRelease):

```json
{
  "schema": "implement-report/v1",
  "screens": ["<screen-name>"],
  "files_written": ["styles/design-tokens.css", "tailwind.config.ts", "<component files>"],
  "token_coverage_pct": 0,
  "mockup_source": "<selected file from Step 1> (html | png)",
  "verify_run_id": "<run-id from Step 4>",
  "overall_verdict": "PASS | WARN | FAIL"
}
```

`token_coverage_pct` = distinct tokens referenced in generated code ÷ tokens defined in `design-tokens.json` × 100.

Then print (only when `overall_verdict` is PASS or WARN):

```
Implementation Complete
=======================

Target:      web
Mockup:      <actually selected source from Step 1, e.g. mockup-dashboard.html (HTML source)>
Verify run:  <run-id> — <overall_verdict> (max diff <pct>%)

Generated token files:
  <CSS custom-properties path>
  <Tailwind config/preset path>

Generated components:
  <list of created/modified component files>
```

## Rules

- Token files go at the exact paths in Step 2 — never scatter per-component token files
- Never hardcode values that exist in `design-tokens.json` — always reference the generated token files
- Do not modify `design-tokens.json` — it is the source of truth
- If the mockup HTML is available, use it as the primary reference for layout and structure — and report it as the source
- No completion claim without a PASS/WARN verify run recorded in `implement-report.json`

## Next steps

- `/design-refine "align color usage with the token palette"` / `"polish hover, focus, and transition states"` / `"tighten the type hierarchy"` — refinement intents, dispatched through impeccable
- `/shipRelease` — ship once the verify verdict is PASS
- Commit generated token files: `git add <token file paths>`
