---
name: design-evolve-ios
description: Extract design tokens from a local Swift file or Xcode project directory and merge updates into the existing design-tokens.json, preserving tokens not present in the reference.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Evolve iOS — Merge Swift Reference into Design Language

Extracts design tokens from a local Swift reference file or Xcode project and selectively merges them into the existing `design-tokens.json`.

## Step 1: Validate Prerequisites

Both `.impeccable.md` and `design-tokens.json` must exist. If either is missing:
> "No existing design language found. Run `design-analyze-ios` and `design-language` first to establish a baseline."

## Step 2: Validate Argument

The argument must be a local filesystem path to either:
- A Swift file (`.swift` extension)
- A directory containing Swift files or an Xcode project

If no argument provided, ask the user directly:
> "Provide the path to a Theme.swift file or Xcode project directory to extract tokens from:"

Verify the path exists using Read or Glob. If not found:
> "Path not found: `<path>`. Check the path and retry."

## Step 3: Extract Tokens from Reference

Use `Glob` and `Read` to find and parse Swift files at the given path:
- If a single `.swift` file: read it directly
- If a directory: `Glob("<path>/**/*.swift")` and read any files containing `Color(`, `Font.`, or spacing constants

Extract color, typography, and spacing tokens using the same approach as `design-analyze-ios` Step 2–4.

## Step 4: Present Diff

Compare extracted tokens against existing `design-tokens.json`:

```
iOS Design Evolution Diff
==========================

Source: <path>

NEW tokens (not in current language):
  color.brand-purple: #7C3AED
  spacing.2xl: 48px

DIFFERENT values (exist but differ):
  color.primary: current=#6366F1 → new=#4F46E5
  spacing.lg: current=24px → new=20px

UNCHANGED (same in both):
  color.background: #FFFFFF
  spacing.sm: 8px
```

## Step 5: Ask What to Adopt

For each changed category (new tokens, different values), ask the user directly:
> "Which elements from `<path>` would you like to adopt?
> - **Adopt**: take the new value as-is
> - **Adapt**: use as inspiration, modify manually
> - **Ignore**: keep current value unchanged"

## Step 6: Update Design Files

Apply choices:
1. Update `design-tokens.json` with adopted/adapted tokens (preserve all tokens not in reference)
2. Update `.impeccable.md` if the reference introduces new aesthetic direction

## Step 7: Report

```
iOS Design Language Updated
============================

Adopted:  N tokens from <path>
Adapted:  N tokens (modified)
Ignored:  N tokens (kept current)

Updated files:
  design-tokens.json (N changes)
  .impeccable.md (if updated)

Next steps:
  • Run design-implement-ios to regenerate Theme.swift with new values
  • Run design-verify-ios to check implementation against updated design
```

## Rules

- Never overwrite existing tokens without user confirmation
- Show exact before/after values for all changes
- Preserve token structure — only update values, don't reorganize
- Tokens in `design-tokens.json` NOT present in the reference are always preserved
