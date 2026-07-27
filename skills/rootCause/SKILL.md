---
name: rootCause
description: 4-phase systematic debugging — investigate, analyze, hypothesize, implement. Auto-freezes scope to the module boundary to prevent scope creep.
argument-hint: "[--depth N] [error-message-or-issue-description | canary incident JSON]"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Bash(pytest *), Bash(cargo *), Bash(go *), Bash(bundle *), Bash(SHARED_DIR=*), Bash(source *), Bash(mkdir *), Bash(cat *), Agent, Read, Write, Edit, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Root Cause Analysis

4-phase systematic debugging with automatic scope freeze at the module boundary.

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

## Phase 0: Parse Input

Extract the starting point for the investigation from the argument:

- **`--depth N`** — dispatch-chain depth guard (default 0). If N ≥ 2, this run must NOT dispatch any sub-skill (Sub-skill Dispatch is disabled) — report findings only. When dispatching, always pass `--depth N+1`.
- **Error message or issue description** — the normal entry.
- **Production-incident entry** — if the argument is a JSON object of the shape `{merge_sha, release_id, symptom, logs_excerpt}` (as passed by `/canary` on an UNHEALTHY verdict), treat this as a production incident:
  - `logs_excerpt` is the primary evidence; `symptom` is the failure description.
  - Scope the first suspect set to `git diff <merge_sha>^..<merge_sha>` (the released change).
  - There is usually **no local failing command** — plan for the verify-app journey branch in Phases 1 and 4.

## Phase 1: Investigate

Reproduce the error and collect evidence.

1. **Run the failing command or test.** If the argument contains a runnable command (e.g., `npm test`, a file path with a stack trace hint), execute it to reproduce the failure. Capture the full output including stack traces.
2. **If no runnable command** (production/UI symptom), use Grep and Glob to search for the error message in the codebase, and write down concrete **repro steps** (navigate/click/fill sequence) from the symptom — these become the verify-app journey used for verification in Phase 4.
3. **Collect artifacts:** full error output / stack trace / logs excerpt; affected files (from the trace, logs, diff, or search); related test files or the repro-steps journey.

## Phase 2: Analyze

Read the relevant source and map the call chain.

1. **Read every file** identified in Phase 1. Follow imports and function calls from the error site back to the root cause.
2. **Map the call chain** — document the sequence of function calls from the entry point to the error site.
3. **Identify the module boundary** — the **nearest common ancestor directory** of (a) the error site and (b) the hypothesized cause site. The repo root and generic top-level source dirs (`src/`, `lib/`, `app/`) are **rejected** as boundaries: if the ancestor resolves to one of those, narrow to the most specific package/directory that still contains both sites, or declare the cause-side directory as the boundary and treat the error site as read-only context. Declare it explicitly:

> **SCOPE FREEZE:** Module boundary is `<path-or-package>` (nearest common ancestor of `<error-site>` and `<cause-site>`). All fixes in Phase 4 must stay within this boundary.

## Phase 3: Hypothesize

Generate 2-3 hypotheses ranked by likelihood. Document each as: **Hypothesis** (one-sentence suspected cause) · **Confirms if** (evidence that would confirm it) · **Rules out if** (evidence that would eliminate it) · **Likelihood** (High / Medium / Low).

## Phase 3.5: Confirm Before Editing

**Run the "Confirms if" check for hypothesis #1 BEFORE editing any code** — add the log line, run the narrowed test, inspect the state, whatever the check specifies.

- **Confirmed** → proceed to Phase 4 with hypothesis #1.
- **Ruled out** → record the result in the hypotheses table, promote hypothesis #2, and run its check.
- Never implement a fix whose hypothesis has not been confirmed by its own check. "Confirms if / Rules out if" is an executable contract, not documentation.

## Phase 4: Implement

Fix the confirmed cause.

1. **Implement the fix** for the confirmed hypothesis. All changes MUST stay within the declared module boundary.
2. **Verify:**
   - If a local failing command exists, re-run it.
   - If the symptom is production/UI-only (no local failing command), run the app-path check instead: `Skill(skill="verify-app", args="--yes --journey <repro steps from Phase 1>")`. The fix is verified only on a PASS verdict in the resulting evidence pack.
3. **If verification still fails**, revert the change, return to Phase 3.5 for the next hypothesis. Repeat up to hypothesis #3.
4. **If a fix requires changes outside the module boundary**, do NOT make the change. Instead, flag it:

> **SCOPE BREACH:** Fixing this requires changes in `<outside-path>`. Asking the user for permission before proceeding.

Then ask the user via AskUserQuestion whether to expand the scope or stop.

## Phase 5: Write Investigation Report + Handoff

Write the report to `$HOME/.agentic-workflow/$REPO_SLUG/investigations/{timestamp}-{slug}.md` where:
- `{timestamp}` is `YYYYMMDD-HHmmss` format
- `{slug}` is a short kebab-case summary of the error (max 40 chars)

(Re-derive the paths in bash via the shared helper — shell state does not persist between blocks:)
```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/rootCause/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
mkdir -p "$AW_DIR/investigations/<slug>"
```

Report format:

```markdown
# Investigation: {short description}

**Date:** {ISO timestamp}
**Status:** {fixed | unfixed | scope-breach}

## Error Description
{Original error message and context}

## Module Boundary
`{declared boundary path}`

## Call Chain
{entry-point} -> {fn1} -> {fn2} -> {error-site}

## Hypotheses

| # | Hypothesis | Likelihood | Result |
|---|-----------|------------|--------|
| 1 | {description} | High | {confirmed/ruled-out/untested} |
| 2 | {description} | Medium | {confirmed/ruled-out/untested} |
| 3 | {description} | Low | {confirmed/ruled-out/untested} |

## Root Cause
{Confirmed root cause explanation}

## Fix Applied
{Description of the fix}
- `{file}:{line}` — {what changed}

## Verification
{Command run and its output — pass/fail; or the verify-app journey + evidence pack path and verdict}
```

**Also write the handoff file** to `$HOME/.agentic-workflow/$REPO_SLUG/investigations/<slug>/handoff.md` — this is the structured input `/bugHunt --from-investigation <path>` consumes, so the full investigation is never discarded:

```markdown
# Handoff: {slug}

status: {fixed | unfixed | scope-breach}
report: {absolute path to the investigation report}
boundary: {declared module boundary path}
repro: {failing command, or the verify-app journey steps}

## Root Cause
{confirmed or best-supported root cause, one paragraph}

## Ruled Out
- {hypothesis} — {evidence that ruled it out}

## Suggested Fix
{concrete fix direction, file paths, constraints}
```

## Phase 6: Report to User

```
Root cause analysis complete.

Status: {fixed | unfixed | scope-breach}
Module boundary: {path}
Root cause: {one-line summary}
Report: ~/.agentic-workflow/<repo-slug>/investigations/{filename}
Handoff: ~/.agentic-workflow/<repo-slug>/investigations/{slug}/handoff.md
```

**End the response with exactly one fenced JSON block** (machine-readable tail — `/review` and other callers parse this):

```json
{ "status": "fixed | unfixed | scope-breach", "report_path": "<absolute report path>", "boundary": "<boundary path>" }
```

### Sub-skill Dispatch

If Phase 4 ends with status `unfixed` or `scope-breach`, **and** the depth guard allows (`--depth` < 2):
> `Skill(skill="bugHunt", args="--from-investigation <handoff.md path> --depth <N+1>")`

Do not invoke bugHunt if the fix was verified — rootCause's own report is sufficient on success. At depth ≥ 2, stop the chain and report only.

## Next steps

- `/bugHunt --from-investigation <handoff path>` — auto-fix the bug using the full diagnosis
- `/review` — re-review the codebase after applying fixes
