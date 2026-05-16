---
name: autoplan
description: "Plan meta-orchestrator. Runs productReview + archReview + planDesignReview + planDevexReview + cso(plan) in parallel via subagents and consolidates findings with cross-lens tension surfacing."
argument-hint: "[plan-path]"
allowed-tools: Bash(ls *), Agent, Read, Write, Glob, Grep, Skill
---

# Autoplan — Plan Meta-Orchestrator

Fans out five review lenses in parallel against a plan document, then consolidates findings into a single decision-ready report.

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 43 native skills + 3 fetched external packs (impeccable, emil-design-eng, taste-skill family). Run any as `/<name>`.
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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview withInterview design-analyze design-analyze-web design-analyze-ios design-language design-evolve design-evolve-web design-evolve-ios design-mockup design-mockup-web design-mockup-ios design-implement design-implement-web design-implement-ios design-refine design-verify design-verify-web design-verify-ios verify-app verify-web verify-ios autoplan planDesignReview planDevexReview cso design-shotgun landAndDeploy canary prismStatus; do
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

Dispatches five subagents in parallel — product, architecture, design, devex, security — each producing its own review file. After all return, consolidates: dedupes overlapping findings, surfaces cross-lens tensions (e.g., "product wants X but security blocks Y"), recommends top 3 next actions. One command for full plan vetting.

## Inputs

- Plan doc path (arg), OR auto-discover with:
  ```bash
  ls -t ~/.agentic-workflow/$REPO_SLUG/plans/*/plan.md | head -1
  ```

## Steps

1. Resolve plan doc path and `$REPO_SLUG` (per `.claude/rules/skills.md` convention). Derive `<feature>` as the parent dir name of the plan.md. Compute the absolute feature dir path: `$HOME/.agentic-workflow/$REPO_SLUG/plans/<feature>/`.

2. **Dispatch 5 subagents in parallel.** Send ONE message containing five `Agent` tool calls (parallel-dispatch pattern from CLAUDE.md). Each subagent receives the absolute plan.md path, the absolute feature-dir path, and explicit instructions:

   - **`productReview` agent** → "Read `<plan-path>`, then invoke the `productReview` skill against it. The skill writes to a top-level `plans/{timestamp}-product-review-<slug>.md` path under `~/.agentic-workflow/$REPO_SLUG/`. After it completes, report back the **exact absolute path** of the file it wrote. Do not move or rename it."
   - **`archReview` agent** → "Read `<plan-path>`, then invoke the `archReview` skill against it. The skill writes to a top-level `plans/{timestamp}-arch-review-<slug>.md` path under `~/.agentic-workflow/$REPO_SLUG/`. After it completes, report back the **exact absolute path** of the file it wrote. Do not move or rename it."
   - **`planDesignReview` agent** → "Invoke the `planDesignReview` skill with `--plan <plan-path> --output <feature-dir>/design-review.md`. It will write directly to that path."
   - **`planDevexReview` agent** → "Invoke the `planDevexReview` skill with `--plan <plan-path> --output <feature-dir>/devex-review.md`. It will write directly to that path."
   - **`cso --plan` agent** → "Invoke the `cso` skill with `--plan <plan-path> --output <feature-dir>/security-review.md`. It will write directly to that path."

3. **Wait for all 5 subagents to complete.** For the `productReview` and `archReview` agents, capture the actual output path each one reports.

4. **Normalize paths into the feature dir.** For productReview/archReview outputs (which were written to top-level `plans/`), MOVE (not copy) them into the feature dir using their canonical names:

   ```bash
   FEATURE_DIR="$HOME/.agentic-workflow/$REPO_SLUG/plans/<feature>"
   mv "<productReview-reported-path>" "$FEATURE_DIR/product-review.md"
   mv "<archReview-reported-path>" "$FEATURE_DIR/arch-review.md"
   ```

   Using `mv` (not `cp`) avoids leaving duplicate copies at top-level `plans/`. The new skills (`planDesignReview`, `planDevexReview`, `cso`) already wrote directly to the feature dir via the `--output` flag.

5. Read all 5 review files. Some may be partial if a subagent reported BLOCKED — record but continue.

6. **Consolidate:** produce `plans/<feature>/consolidated-review.md`:
   ```markdown
   # Consolidated Plan Review — <feature>
   
   **Plan:** <relative path>
   **Reviewed:** <ISO date>
   **Lenses applied:** product · arch · design · devex · security
   
   ## Top tensions (cross-lens)
   <Numbered list. Each item: short title, the lenses in tension, the trade-off, recommended resolution.>
   
   ## Per-lens highlights
   ### Product
   - Top wins: <bullets>
   - Top gaps: <bullets>
   - File: `plans/<feature>/product-review.md`
   ### Architecture
   <same shape>
   ### Design
   <same shape>
   ### Devex
   <same shape>
   ### Security
   <same shape>
   
   ## Recommended next actions
   1. <action> — <why> — <which lens raised it>
   2. <action> — <why> — <which lens raised it>
   3. <action> — <why> — <which lens raised it>
   
   ## Lens status
   | Lens | File | Status |
   |---|---|---|
   | Product | product-review.md | ✓ / partial / BLOCKED |
   | Architecture | arch-review.md | … |
   | Design | design-review.md | … |
   | Devex | devex-review.md | … |
   | Security | security-review.md | … |
   ```

7. Print a short summary to stdout (5-line table of statuses + top 3 next actions) so the user sees the result without opening the file.

## Outputs

All under `~/.agentic-workflow/$REPO_SLUG/plans/<feature>/`:
- `product-review.md`
- `arch-review.md`
- `design-review.md`
- `devex-review.md`
- `security-review.md`
- `consolidated-review.md`

## Next steps

- `/design-shotgun` — if visual exploration is recommended by the design lens
- `/review` — if the plan was already implemented and the consolidated review surfaced code-level concerns to verify
- Pick a top-3 next action and run it directly
