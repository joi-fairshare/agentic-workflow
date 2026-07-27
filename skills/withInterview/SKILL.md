---
name: withInterview
description: "Interview the user to clarify requirements before executing a prompt. Use when the user wants to refine a task through guided questions before implementation."
argument-hint: "<skill-name> [prompt]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Bash(mkdir *), Bash(date *), Bash(SHARED_DIR=*), Agent, Read, Write, Glob, Grep, Skill, AskUserQuestion, mcp__prism-mcp__session_load_context, mcp__prism-mcp__session_save_ledger, mcp__prism-mcp__session_save_handoff
---

# Interview Before Executing

Runs a structured, multi-round interview to gather requirements and context before executing a task. Surfaces ambiguities, challenges assumptions, and confirms subagent strategy — then proceeds only after explicit user confirmation.

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

## The Task

$ARGUMENTS

The first token of the arguments is the **target skill** to run after the interview (e.g. `/withInterview officeHours add dark mode`). Record it now — the interview ends by invoking it. If no skill name is given, ask which skill (or "none — execute directly") before Round 1.

## Interview Process

### Setup: Interview Directory

Create the plan directory (layout per `_shared/plan-layout.md`) before Round 1. Derive `<slug>` as 2–4 kebab-case words from the task:

```bash
SHARED_DIR="$(dirname "$(readlink -f "$HOME/.claude/skills/withInterview/SKILL.md")")/../_shared"
source "$SHARED_DIR/repo-slug.sh"
PLAN_DIR="$AW_DIR/plans/$(date +%Y-%m-%d)-<slug>"
mkdir -p "$PLAN_DIR"
echo "plan-dir: $PLAN_DIR"
```

All interview artifacts go to `$PLAN_DIR/interview.md`. Persist each round's questions there as they are asked (append per round) so the question list can be re-rendered on demand later.

### Round 1: Initial Analysis & High-Level Questions

Read the task above carefully. Identify: ambiguities or underspecified requirements; decisions with more than one reasonable answer; missing context that would change the approach; unclear scope boundaries; and **scope/time-box constraints** — flags like `--slim` or phrases like "30 min", "quick pass" — captured verbatim (they go into the artifact and are forwarded to the target skill).

Present your **highest-priority questions first** — the ones whose answers will shape everything else. Emit them as a numbered table with a Theme column, and write the same table to `$PLAN_DIR/interview.md`:

| # | Theme | Question | Options (if any) |
|---|-------|----------|------------------|
| 1 | scope | Should X do A or B? | A / B |

Themes: scope, behavior, constraints, testing, integration. Keep each question concise and offer concrete options where possible (e.g. "Should X do A or B?" rather than open-ended "What should X do?").

### Round 2: Subagent Strategy

After the user answers Round 1, ask specifically about subagent usage. Present this as a focused follow-up:

> **Subagent Strategy:** Based on what you've described, here's how I'd recommend using subagents. Let me know what you'd prefer:
>
> - **Explore** — for codebase research and file discovery
> - **Plan** — for designing an implementation strategy before coding
> - **general-purpose** — for delegating independent subtasks in parallel
> - **Reviewers** — post-implementation review via `/review`, which selects reviewer agents based on the changed files
> - **None** — I'll handle everything directly
>
> You can pick multiple. I'll also suggest a specific combination if you'd like a recommendation.

If the user selects **multiple subagents**, follow up on each: its focus/scope, parallel vs sequential, and dependencies between outputs (e.g. Explore feeding Plan).

### Round 3+: Drill-Down Details

Continue asking follow-up rounds as needed. Each round: reference previous answers ("You mentioned X — does that mean...?"), go deeper on underspecified areas, surface edge cases and error handling, clarify testing expectations and acceptance criteria.

**Run at least 3 rounds** unless the user explicitly says to skip ahead. Keep going past 3 until you can honestly emit the line `Remaining ambiguities: none` — followed by a bullet list of what each round resolved. That literal line is required in the final round; you may not summarize-and-confirm without it. Each round should be a focused set of 2-5 questions (numbered, with Theme column, appended to `$PLAN_DIR/interview.md`), not a wall of text.

### Final Round: Summarize, Persist, and Confirm

Once all details are gathered, present a complete summary:

1. **Task understanding** — what you'll build, with all clarifications incorporated
2. **Approach** — the implementation strategy step by step
3. **Subagent plan** — which agents will be used, in what order, with what focus
4. **Scope boundaries** — what's explicitly in and out of scope, including any captured `--slim`/time-box constraint
5. **Acceptance criteria** — how you'll know the task is done

End with:

```
Remaining ambiguities: none
- <round N resolved: ...>
```

Ask: **"Does this look right? Any changes before I start?"**

After the user confirms, write two artifacts to `$PLAN_DIR` (re-source `repo-slug.sh` first — shell state does not persist):

1. **`$PLAN_DIR/interview.md`** — the full record: target skill, original prompt, captured scope/time-box constraints, every round's question table with the user's answers, the 5-part summary, and the `Remaining ambiguities: none` block.
2. **`$PLAN_DIR/plan.md`** — a TL;DR-form plan shaped per `_shared/plan-layout.md` so downstream discovery (`/autoplan`, plan lenses, `/specToProvenPR`) finds it: task understanding, approach steps, scope boundaries, acceptance criteria, and a pointer to `interview.md`.

### Execute

Only after explicit confirmation and after both artifacts are written, hand off to the target skill captured in Round 1 with an explicit invocation:

```
Skill(skill="<target>", args="<original prompt> — interview: $PLAN_DIR/interview.md")
```

If the target was "none — execute directly", begin the work yourself using the confirmed plan.

## Rules

- Do NOT write any code or make any changes until the interview is complete and confirmed.
- This is a **multi-round conversation**. Do NOT try to ask everything in one message. Start broad, then drill down based on answers.
- Each round should be focused: 2-5 questions max per round.
- Always reference previous answers when asking follow-ups to show you're building understanding.
- The subagent question always gets its own dedicated round.
- Minimum 3 rounds; only the user saying "skip" collapses the interview — and even then, still ask the subagent question, get confirmation, and write both artifacts before proceeding.

## Next steps

- `Skill(skill="<target>", args="<original prompt> — interview: $PLAN_DIR/interview.md")` — run the wrapped target skill with the interview artifact attached
- `/autoplan` — if the confirmed plan warrants multi-lens review before implementation (it will auto-discover `$PLAN_DIR/plan.md`)
