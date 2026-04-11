---
name: withInterview
description: "Interview the user to clarify requirements before executing a prompt. Use when the user wants to refine a task through guided questions before implementation."
argument-hint: "[prompt]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Agent, Read, Write, Glob, Grep, Skill
---

# Interview Before Executing

Runs a structured, multi-round interview to gather requirements and context before executing a task. Surfaces ambiguities, challenges assumptions, and confirms subagent strategy — then proceeds only after explicit user confirmation.

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

## Memory Recall

> **Skip if** this skill is marked `<!-- MEMORY: SKIP -->`, or if `BRIDGE_OK=false`.

Check for prior discussion context in memory before reading the codebase.

**1. Derive a topic string** — synthesize 3-5 words from the skill argument and task intent:
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

**4. Surface results:**
- If `get_context` returns a non-empty summary or any section with `relevance > 0.3`:
  > **Prior context:** {summary} *(~{token_estimate} tokens)*
  Use this to inform your approach before continuing.
- If empty, all low-relevance, or any tool error: continue silently — do not mention the search.

<!-- === PREAMBLE END === -->

## The Task

$ARGUMENTS

## Interview Process

### Round 1: Initial Analysis & High-Level Questions

Read the task above carefully. Identify:
- Ambiguities or underspecified requirements
- Decisions that have more than one reasonable answer
- Missing context that would change your approach
- Scope boundaries that aren't clear

Present your **highest-priority questions first** — the ones whose answers will shape everything else. Group them by theme (e.g. scope, behavior, constraints, testing). Keep each question concise and offer concrete options where possible (e.g. "Should X do A or B?" rather than open-ended "What should X do?").

### Round 2: Subagent Strategy

After the user answers Round 1, ask specifically about subagent usage. Present this as a focused follow-up:

> **Subagent Strategy:** Based on what you've described, here's how I'd recommend using subagents. Let me know what you'd prefer:
>
> - **Explore** — for codebase research and file discovery
> - **Plan** — for designing an implementation strategy before coding
> - **general-purpose** — for delegating independent subtasks in parallel
> - **Reviewers** (e.g. Rails, TypeScript, security, performance) — for post-implementation review
> - **None** — I'll handle everything directly
>
> You can pick multiple. I'll also suggest a specific combination if you'd like a recommendation.

If the user selects **multiple subagents**, ask follow-up questions about each one:
- What specific focus or scope should each agent have?
- Should they run in parallel or sequentially?
- Are there dependencies between their outputs (e.g. Explore results feeding into Plan)?

### Round 3+: Drill-Down Details

Continue asking follow-up rounds as needed. Each round should:
- Reference the user's previous answers ("You mentioned X — does that mean...?")
- Go deeper on areas that are still underspecified
- Surface edge cases and error handling questions
- Clarify testing expectations and acceptance criteria

Keep going until you have no remaining ambiguities. Each round should be a focused set of 2-5 questions, not a wall of text.

### Final Round: Summarize and Confirm

Once all details are gathered, present a complete summary:

1. **Task understanding** — what you'll build, with all clarifications incorporated
2. **Approach** — the implementation strategy step by step
3. **Subagent plan** — which agents will be used, in what order, with what focus
4. **Scope boundaries** — what's explicitly in and out of scope
5. **Acceptance criteria** — how you'll know the task is done

Ask: **"Does this look right? Any changes before I start?"**

### Execute

Only after explicit confirmation, begin the work.

## Rules

- Do NOT write any code or make any changes until the interview is complete and confirmed.
- This is a **multi-round conversation**. Do NOT try to ask everything in one message. Start broad, then drill down based on answers.
- Each round should be focused: 2-5 questions max per round.
- Always reference previous answers when asking follow-ups to show you're building understanding.
- The subagent question always gets its own dedicated round.
- If the task is trivial and truly has no ambiguity, you may collapse to fewer rounds, but still ask the subagent question and get confirmation before proceeding.
