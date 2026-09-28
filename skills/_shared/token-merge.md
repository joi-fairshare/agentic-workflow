# Token Merge Algorithm (shared)

Canonical selective-merge flow for bringing new reference tokens into an existing `design-tokens.json`. Referenced by design-evolve-web and design-evolve-ios.
Referenced via: SHARED_DIR pattern (CD2).

## Step A: Diff new tokens against current

Compare the extracted tokens against the existing `design-tokens.json` and present a category diff table:

```
Design Evolution Diff
=====================

Source: <url or path>

NEW tokens (not in current language):
  color.accent-blue: #3B82F6
  spacing.2xl: 3rem
  typography.mono: "JetBrains Mono"

DIFFERENT values (exist but differ):
  color.primary: current=#1A1A2E → new=#0F172A
  spacing.lg: current=2rem → new=1.5rem

UNCHANGED (same in both):
  color.background: #FFFFFF
  typography.body.fontSize: 1rem
```

## Step B: Ask what to adopt

For each category group (new tokens, different values), **ask the user**:

> "Which elements would you like to adopt from \<source\>?
> - **Adopt**: take the new value as-is
> - **Adapt**: use the new value as inspiration but modify
> - **Ignore**: keep current value unchanged"

**Adapt** = a follow-up **Ask the user** per adapted token that captures the **literal replacement value** (e.g. "You chose Adapt for color.primary (new=#0F172A). Enter the exact value to use:"). Never write "adapted" without a concrete value.

## Step C: Write the merged files

1. Write the merged `design-tokens.json` with adopted/adapted values applied. Preserve token structure — only update values, don't reorganize. Tokens not present in the reference are preserved unchanged.
2. **Unconditionally** append to `.impeccable.md` under `## Sources` (create the heading if absent):
   `- <source> (<ISO date>): adopted N, adapted N, ignored N`
   This happens even when everything was ignored — the consultation itself is recorded.
3. If `screens.json` exists and any token was adopted or adapted, set `baseline_stale: "<ISO now>"` on every screen entry — existing mockup baselines no longer reflect the token set.

## Step D: Report

Show counts (Adopted / Adapted / Ignored), the exact before→after values for all changes, and the updated file list.

## Rules

- Never overwrite existing tokens without user confirmation.
- Show exact before/after values for all changes.
- Clean up raw extractor output only if it is not the pinned `design/raw/<host>.json` copy.
