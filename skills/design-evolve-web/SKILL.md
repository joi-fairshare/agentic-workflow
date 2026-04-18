---
name: design-evolve-web
description: Analyze a new reference URL mid-project and selectively merge design tokens into the existing design language. Diffs new tokens against current, asks what to adopt/adapt/ignore, updates design-tokens.json and .impeccable.md.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Evolve — Merge New Reference into Design Language

Analyze a new reference site mid-project and selectively merge its design elements into the existing design language. Shows a diff of what would change, lets the user choose what to adopt.

## Step 1: Validate Prerequisites

Both `.impeccable.md` and `design-tokens.json` must exist. If either is missing:
> "No existing design language found. Run `design-analyze` and `design-language` first to establish a baseline before evolving."

## Step 2: Validate URL

Validate that the `<url>` argument starts with `http://` or `https://` and contains only URL-safe characters: letters, digits, `:`, `/`, `.`, `-`, `_`, `~`, `?`, `=`, `%`, `+`, `@`, `,`.

Reject any URL containing characters outside this allowlist.

If validation fails:
> "Invalid URL: `<url>`. URLs must start with `http://` or `https://` and may only contain URL-safe characters (`a-zA-Z0-9` and `:/.\\-_~?=%+@,`). Offending characters: `<list of disallowed characters found>`."

## Step 3: Run Dembrandt on New URL

```bash
npx dembrandt <url> --dtcg --save-output
```

Read the Dembrandt output.

## Step 4: Present Diff

Compare new tokens against existing `design-tokens.json`:

```
Design Evolution Diff
=====================

Source: <url>

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

## Step 5: Ask What to Adopt

For each category (new tokens, different values), ask the user directly:
> "Which elements would you like to adopt from <url>?
> - **Adopt**: take the new value as-is
> - **Adapt**: use the new value as inspiration but modify
> - **Ignore**: keep current value unchanged"

## Step 6: Update Design Files

Apply the user's choices:
1. Update `design-tokens.json` with adopted/adapted tokens
2. Update `.impeccable.md` if the new reference changes aesthetic direction:
   - Add to references list if adopted
   - Note any style shifts in relevant sections

## Step 7: Report

```
Design Language Updated
=======================

Adopted:  N tokens from <url>
Adapted:  N tokens (modified from <url>)
Ignored:  N tokens (kept current values)

Updated files:
  design-tokens.json (N changes)
  .impeccable.md (references updated)

Next steps:
  • Run design-implement web|swiftui to regenerate platform-specific token files
  • Run design-verify to check implementation against updated tokens
```

## Rules

- Never overwrite existing tokens without user confirmation
- Show exact before/after values for all changes
- Preserve token structure — only update values, don't reorganize
- Clean up Dembrandt output files after processing
