---
name: enhancePrompt
description: Use when the user invokes /enhancePrompt — discovers available project documentation, reads relevant files, and rewrites the user's request with richer context before execution
argument-hint: [prompt-to-enhance]
disable-model-invocation: true
allowed-tools: Read, Glob, Grep
---

> **Agentic Workflow** — 14 skills available. Run any as `/<name>`.
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
> | `/officeHours` | YC-style brainstorming → design doc |
> | `/productReview` | Founder/product lens plan review |
> | `/archReview` | Engineering architecture plan review |
>
> **Output directory:** `~/.agentic-workflow/<repo-slug>/`

---

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

### 3. Output the enhanced prompt

```
## Enhanced Prompt

**Original:** <user's exact words>

**Relevant context from project docs:**
<concise bullets — constraints, conventions, patterns, gotchas that apply>

**Full task:**
<rewritten version of the prompt with all context woven in, specific and actionable>
```

### 4. Confirm before proceeding

Ask: "Should I proceed with this, or adjust anything?"

Do NOT begin executing the task during this skill.

## Rules

- Generic by design — works for any domain: software, product, business analysis, research, etc.
- Preserve the user's original intent exactly; only add context, never redirect.
- Skip docs that aren't relevant — don't dump everything found.
- If the prompt is already detailed, say so and ask if enhancement is still wanted.
- If no docs exist, enhance from what's known in the conversation.
