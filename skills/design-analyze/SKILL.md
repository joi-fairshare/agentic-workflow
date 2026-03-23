---
name: design-analyze
description: Run Dembrandt on reference site URLs to extract design tokens (colors, typography, spacing) as W3C DTCG JSON. Merges multiple sites, resolves conflicts by frequency/prominence, and writes design-tokens.json.
argument-hint: <url> [url2...]
disable-model-invocation: true
allowed-tools: Bash(npx dembrandt *), Bash(git *), Read, Write, Glob, AskUserQuestion
---

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
> | `/officeHours` | YC-style brainstorming → design doc |
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

echo "skills-symlinked: $SKILLS_OK"
echo "bridge-built: $BRIDGE_OK"
```

If either check fails, ask the user via AskUserQuestion:
> "Agentic Workflow is not fully set up. Run setup.sh now? (yes/no)"

If **yes**: run `bash <path-to-agentic-workflow>/setup.sh` (resolve path from the review skill symlink target).
If **no**: warn that some features may not work, then continue.

Create the output directory for this repo:
```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG"
```

## Design Context — Load Design Language

Before proceeding, load existing design context:

1. Read `.impeccable.md` if it exists (brand personality, aesthetic direction)
2. Read `design-tokens.json` if it exists (W3C DTCG tokens: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (design principles, component catalog)

If none of these files exist and this skill requires design context to function, advise:
> "No design language found. Run `/design-analyze <url>` to extract tokens from a reference site, then `/design-language` to define brand personality."

> **Note:** This skill creates design context — the preamble checks above are informational only. Missing `.impeccable.md` or `design-tokens.json` is expected on first run.

---

# Design Analyze — Extract Design Tokens from Reference Sites

Runs Dembrandt CLI on one or more reference website URLs, extracts design tokens, merges across sites, and writes `design-tokens.json` in W3C DTCG format.

## Step 1: Validate Arguments

The user must provide at least one URL. Parse all URLs from the argument string.

If no URLs provided:
> "Usage: `/design-analyze <url> [url2...]`
> Example: `/design-analyze https://linear.app https://vercel.com`"

## Step 2: Validate URLs

Validate that each URL starts with `http://` or `https://` and contains only URL-safe characters: letters, digits, `:`, `/`, `.`, `-`, `_`, `~`, `?`, `=`, `%`, `+`, `@`, `,`.

Reject any URL containing characters outside this allowlist.

If any argument fails validation:
> "Invalid URL: `<argument>`. URLs must start with `http://` or `https://` and may only contain URL-safe characters (`a-zA-Z0-9` and `:/.\\-_~?=%+@,`). Offending characters: `<list of disallowed characters found>`."

## Step 3: Run Dembrandt on Each URL

For each URL, run:

```bash
npx dembrandt <url> --dtcg --save-output
```

If the user's design system includes dark mode, also run:

```bash
npx dembrandt <url> --dtcg --dark-mode --save-output
```

Collect all output files. Dembrandt saves JSON files with the extracted tokens.

## Step 4: Merge Extracted Tokens

If multiple URLs were provided:

1. Read all Dembrandt output files
2. Identify shared patterns across sites (common colors, similar typography scales, consistent spacing)
3. Resolve conflicts by frequency and prominence:
   - Token present in most sites wins
   - If tied, prefer the token from the first URL (primary reference)
4. Synthesize: what's shared across references, what's distinctive about each

If single URL, use its tokens directly.

## Step 5: Write design-tokens.json

Write the merged tokens to `design-tokens.json` at the project root in W3C DTCG format:

```json
{
  "$schema": "https://design-tokens.org/schema.json",
  "color": {
    "primary": { "$value": "#...", "$type": "color" },
    "secondary": { "$value": "#...", "$type": "color" }
  },
  "typography": {
    "heading": {
      "fontFamily": { "$value": "...", "$type": "fontFamily" },
      "fontSize": { "$value": "...", "$type": "dimension" }
    }
  },
  "spacing": {
    "sm": { "$value": "...", "$type": "dimension" },
    "md": { "$value": "...", "$type": "dimension" }
  }
}
```

## Step 6: Present Summary

Display a summary of extracted tokens:

```
Design Token Extraction Complete
=================================

Source(s): <url1>, <url2>, ...

Colors:     N tokens extracted
Typography: N tokens extracted
Spacing:    N tokens extracted
Radii:      N tokens extracted
Elevation:  N tokens extracted
Motion:     N tokens extracted

Written to: design-tokens.json

Next steps:
  1. Run /design-language to define brand personality
  2. Run /design-mockup <screen> to generate HTML mockups
  3. Run /design-implement web|swiftui to generate production code
```

## Rules

- Always use `--dtcg` flag for W3C DTCG format output
- Do not modify existing `design-tokens.json` without warning — if it exists, ask before overwriting
- Clean up Dembrandt output files after merging (keep only `design-tokens.json`)
- If Dembrandt is not installed, advise: "Run `npm install -g dembrandt` or re-run `setup.sh`"
