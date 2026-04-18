---
name: design-mockup-web
description: Generate an HTML mockup informed by the design language, serve it via the visual companion, iterate with feedback until approved, then screenshot the final version as a baseline for design-verify-web.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Mockup — Generate HTML Mockup from Design Language

Generate an HTML mockup using the visual companion, informed by the design language. Iterate with user feedback until approved, then capture a baseline screenshot for verification.

## Step 1: Validate Arguments

The user must provide a screen name (e.g., "dashboard", "login", "settings", "onboarding").

If no screen name provided:
> "Usage: `design-mockup <screen-name>`
> Example: `design-mockup dashboard`"

## Step 2: Load Design Context

Read `.impeccable.md` and `design-tokens.json` to understand:
- Color palette and semantic color usage
- Typography scale and font choices
- Spacing system and layout approach
- Brand personality and aesthetic direction

These values must drive every visual decision in the mockup.

## Step 3: Generate HTML Mockup

Create an HTML file as a content fragment for the visual companion. The mockup should:

1. **Be a single HTML file** with inline CSS (no external dependencies except CDN fonts)
2. **Use exact token values** from `design-tokens.json` — colors, font sizes, spacing, radii
3. **Reflect the brand personality** from `.impeccable.md` — not generic Bootstrap/Tailwind defaults
4. **Be responsive** — include viewport meta tag and basic responsive breakpoints
5. **Include realistic content** — use plausible text and data, not "Lorem ipsum"

Save to the visual companion's session directory:
```
.superpowers/brainstorm/<session-id>/<screen-name>.html
```

## Step 4: Present in Browser

Start the visual companion server:
```bash
*/start-server.sh *
```

The mockup will be visible in the browser for the user to review.

## Step 5: Iterate

Ask the user directly to gather feedback from the user. Common adjustments:
- Layout changes (reorder sections, change grid)
- Color refinements (too much contrast, wrong emphasis)
- Typography tweaks (heading sizes, body line-height)
- Content density (too sparse, too crowded)
- Missing elements (navigation, footer, status indicators)

Apply changes to the HTML file and continue asking directly in the conversation until the user approves.

## Step 6: Capture Baseline

Once approved, save the baseline screenshot for `design-verify`:

```bash
mkdir -p "$HOME/.agentic-workflow/$REPO_SLUG/design"
```

Use an `Agent` subagent with Playwright MCP tools to capture the screenshot. The subagent should:
1. Navigate to the mockup URL served by the visual companion
2. Take a full-page screenshot
3. Save it to the baseline path

Baseline path:
```
~/.agentic-workflow/<repo-slug>/design/mockup-<screen-name>.png
```

## Step 7: Report

```
Mockup Approved
===============

Screen:    <screen-name>
File:      .superpowers/brainstorm/<session-id>/<screen-name>.html
Baseline:  ~/.agentic-workflow/<repo-slug>/design/mockup-<screen-name>.png

Next steps:
  • Run design-implement web|swiftui to generate production code
  • Run design-mockup <another-screen> to mockup additional screens
  • Run design-refine to apply Impeccable refinements
```

## Rules

- Every color, font size, and spacing value must come from `design-tokens.json` — no hardcoded values
- The mockup is a design artifact, not production code — optimize for visual fidelity, not code quality
- Include hover states and interactive affordances in the HTML/CSS
- If `.impeccable.md` doesn't exist, warn but still allow creation with manual style guidance
- Save only ONE baseline per screen name — re-running overwrites the previous baseline after confirmation
