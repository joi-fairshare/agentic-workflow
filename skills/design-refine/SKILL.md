---
name: design-refine
description: Dispatch Impeccable refinement commands (colorize, animate, polish, typeset, arrange, etc.) with design language context pre-loaded. Suggests which refinements would help most if no command specified.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

# Design Refine — Dispatch Impeccable Refinement Commands

Pre-loads the design language context and dispatches Impeccable refinement commands. If no command specified, analyzes the current implementation and suggests which refinements would be most impactful.

## Step 1: Analyze Current State

If no Impeccable command was specified as argument:

1. Read the current implementation files (detect via Glob: `*.tsx`, `*.jsx`, `*.html`, `*.css`, `*.swift`)
2. Analyze against the design language in `.impeccable.md`
3. Suggest the most impactful refinements:

```
Design Refinement Analysis
==========================

Current implementation could benefit from:

1. design-refine colorize — Color usage doesn't match token palette; 3 hardcoded colors found
2. design-refine typeset — Heading hierarchy inconsistent with design-tokens.json scale
3. design-refine polish — Missing hover states, focus rings, and micro-interactions
4. design-refine arrange — Layout spacing doesn't follow the spacing scale

Run any of these commands to apply the refinement.
```

If a command was specified, skip to Step 2.

## Step 2: Pre-load Design Context

Before dispatching, ensure the design context is available for the Impeccable command:

1. Confirm `.impeccable.md` exists (required — Impeccable uses this for brand context)
2. Confirm `design-tokens.json` exists (needed for exact token values)
3. If either is missing, warn and offer to create via `design-language` or `design-analyze`

## Step 3: Dispatch Impeccable Command

Open and follow the requested refinement skill directly if it is installed (for example `colorize`, `animate`, `polish`, `typeset`, or `arrange`). If the requested refinement skill is unavailable, tell the user and either suggest an installed alternative or apply the refinement locally using the loaded design context.

Available Impeccable commands include:
- `colorize` — Apply or fix color usage
- `animate` — Add meaningful animations
- `polish` — Visual polish pass (shadows, borders, transitions)
- `typeset` — Typography refinement
- `arrange` — Layout and spacing refinement
- `accessibilize` — Accessibility improvements
- `responsivize` — Responsive design improvements
- `iconify` — Icon usage and consistency
- `darkmode` — Dark mode implementation
- And others from the Impeccable skill set

Carry the loaded design context from `.impeccable.md` and `design-tokens.json` into whichever refinement workflow you follow.

## Step 4: Post-Refinement Token Check

After the Impeccable command completes, check if the refinement introduced any values not in `design-tokens.json`:

1. Scan modified files for color values, font sizes, spacing values
2. Compare against token values in `design-tokens.json`
3. If new values were introduced:
   - Ask if they should be added to `design-tokens.json`
   - If yes, update the tokens file

## Step 5: Report

```
Refinement Applied
==================

Command:    <impeccable-command>
Files:      <list of modified files>
Token sync: <in sync / N new values added to design-tokens.json>

Next steps:
  • Run design-verify to check implementation against mockup
  • Run design-refine [another-command] for additional refinements
  • Run design-refine (no args) for a new analysis
  • If `design-tokens.json` was updated, run `design-implement` to regenerate platform token files
```

## Rules

- Prefer the corresponding installed refinement skill when it exists; only apply the refinement inline when no installed skill is available or the user explicitly wants you to handle it here
- Design context must be loaded before dispatch — Impeccable commands need `.impeccable.md`
- If `design-tokens.json` is updated, note that `design-implement` should be re-run to regenerate platform token files
- Do not modify `.impeccable.md` during refinement — only `design-tokens.json` may be updated
