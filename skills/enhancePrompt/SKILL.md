---
name: enhancePrompt
description: Use when the user invokes /enhancePrompt — discovers available project documentation, reads relevant files, and rewrites the user's request with richer context before execution
argument-hint: [prompt-to-enhance]
disable-model-invocation: true
allowed-tools: Read, Glob, Grep
---

<!-- === PREAMBLE START === -->

> **Agentic Workflow** — 21 skills available. Run any as `/<name>`.
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
> | `/design-analyze` | Extract design tokens from reference sites |
> | `/design-language` | Define brand personality and aesthetic direction |
> | `/design-evolve` | Merge new reference into design language |
> | `/design-mockup` | Generate HTML mockup from design language |
> | `/design-implement` | Generate production code from mockup |
> | `/design-refine` | Dispatch Impeccable refinement commands |
> | `/design-verify` | Screenshot diff implementation vs mockup |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

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
for s in review postReview addressReview enhancePrompt bootstrap rootCause bugHunt bugReport shipRelease syncDocs weeklyRetro officeHours productReview archReview design-analyze design-language design-evolve design-mockup design-implement design-refine design-verify; do
  [ -d "$HOME/.claude/skills/$s" ] || SKILLS_OK=false
done

BRIDGE_OK=false
[ -f "$(dirname "$(readlink -f "$HOME/.claude/skills/review/SKILL.md" 2>/dev/null || echo /dev/null)")/../mcp-bridge/dist/mcp.js" ] 2>/dev/null && BRIDGE_OK=true

RULES_OK=false
[ -d ".claude/rules" ] && [ -n "$(ls -A .claude/rules/ 2>/dev/null)" ] && RULES_OK=true

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
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

---

<!-- === PREAMBLE END === -->

# enhancePrompt

## Overview

Dynamically discovers project documentation, reads what's relevant to the user's prompt, and rewrites the request with full context — constraints, conventions, domain rules, and known patterns — before any work begins.

## Steps

### 1. Discover documentation

Scan the working directory for any of these (check what actually exists, don't assume):
- Root-level guides: `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`
- Docs folders: `docs/`, `planning/`, `wiki/`, `.docs/`, `documentation/`
- Domain files by keyword: any `*.md` at root or one level deep

List what you find. If nothing exists, say so and offer to enhance from conversation context alone.

### 2. Read selectively

Read files whose names or paths suggest relevance to the user's prompt topic. Always read any root-level instruction file (`CLAUDE.md`, `AGENTS.md`, `README.md`) first since they establish overall context. Then read topic-specific files.

Use judgment — a prompt about pricing doesn't need the testing strategy doc.

### 3. Evaluate Codex dialogue value

Before producing output, assess whether the task would benefit from a Codex consultation via the MCP bridge (`agentic-bridge`). Include a dialogue recommendation **only** when at least one of these applies:

- **Cross-domain task** — the prompt spans areas where a second agent working in parallel would reduce total time (e.g., frontend + backend, infra + application code)
- **Second opinion valuable** — architecture decisions, security-sensitive changes, or unfamiliar codebases where an independent review adds confidence
- **Parallel research** — the task involves investigating multiple approaches or technologies that could be explored simultaneously
- **Verification needed** — the result should be validated by a separate agent (e.g., "implement X, then have Codex try to break it")

If none apply, skip the dialogue section entirely — don't force it.

### 4. Output the enhanced prompt

```
## Enhanced Prompt

**Original:** <user's exact words>

**Relevant context from project docs:**
<concise bullets — constraints, conventions, patterns, gotchas that apply>

**Full task:**
<rewritten version of the prompt with all context woven in, specific and actionable>
```

If step 3 identified dialogue value, append:

```
## Codex Dialogue Recommended

**Why:** <one sentence — which criterion triggered this>

**What to ask Codex:**
<specific prompt to send via agentic-bridge assign_task or send_context>

**Expected value:** <what the response would add — a review, alternative approach, parallel implementation, etc.>

**How to initiate:**
  In a Codex session: "Check your unread messages on the agentic-bridge"
  Or manually: assign_task with conversation UUID, domain, and the prompt above
```

If step 3 found no dialogue value, do not include this section.

### 5. Confirm before proceeding

Ask: "Should I proceed with this, or adjust anything?"

Do NOT begin executing the task during this skill.

## Rules

- Generic by design — works for any domain: software, product, business analysis, research, etc.
- Preserve the user's original intent exactly; only add context, never redirect.
- Skip docs that aren't relevant — don't dump everything found.
- If the prompt is already detailed, say so and ask if enhancement is still wanted.
- If no docs exist, enhance from what's known in the conversation.
