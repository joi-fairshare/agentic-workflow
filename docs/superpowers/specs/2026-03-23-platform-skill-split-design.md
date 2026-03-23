# Platform Skill Split — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Motivation

Mobai MCP has a subscription cost. XcodeBuildMCP is MIT-licensed and free, covers all iOS use cases (build, test, simulator management, UI automation, screenshots), and installs via the same `npx -y` pattern. The migration also surfaces a latent architectural issue: several skills mix web and iOS logic inline rather than delegating to platform-specific sub-skills. This spec resolves both.

---

## Overview

6 existing skills become thin platform dispatchers. 12 new platform-specific skills are created — one `-web` and one `-ios` variant per dispatcher. Skill count grows from 22 to 34.

---

## Dispatcher Pattern

Every dispatcher follows the same structure:

1. **Detect platform** — check for iOS indicators (`Package.swift`, `*.xcodeproj`, `*.xcworkspace`) and web indicators (`package.json` with Next.js/React/Vite/Angular dependencies).
2. **Resolve target** — if only iOS indicators found → iOS; if only web → web; if both or neither → ask user via `AskUserQuestion`.
3. **Delegate** — invoke the resolved platform sub-skill with original arguments passed through unchanged.

Dispatchers contain no execution logic. All platform-specific steps live in the sub-skills.

**Important behavioral change:** `design-verify` currently runs verification for *both* platforms when both are detected. After this change, all dispatchers resolve to a *single* platform — "both present → ask user" replaces the old "both present → run both" behavior.

**Argument passthrough:** User-supplied arguments (e.g., a screen name passed to `design-verify`, criteria passed to `verify-app`) are forwarded to the resolved sub-skill unchanged. The `design-implement` dispatcher drops its existing `argument-hint: <target> (web | swiftui)` — platform is now auto-detected, not user-specified. If a user wants to override detection, they invoke the sub-skill directly (`/design-implement-web` or `/design-implement-ios`).

**Dispatcher frontmatter:** All 6 dispatcher SKILL.md files must have:
```yaml
allowed-tools: Glob, Read, AskUserQuestion, Skill
```

---

## MCP Configuration

### config/mcp.json

Replace `mobai` with `xcodebuildmcp`:

```json
{
  "mcpServers": {
    "xcodebuildmcp": {
      "command": "npx",
      "args": ["-y", "xcodebuildmcp@latest", "mcp"]
    }
  }
}
```

### .claude/rules/mcp-servers.md

Replace the mobai row in the MCP servers table:

| Server | Purpose | Use instead of |
|--------|---------|----------------|
| `xcodebuildmcp` | iOS/macOS build, test, simulator management, UI automation (`tap`, `swipe`, `snapshot_ui`, `screenshot`), app lifecycle | Manual Xcode builds and mobile testing |

Remove the mobai row from the "When to use" guidance. Add XcodeBuildMCP guidance:

| Task | Tool |
|------|------|
| Build iOS app on simulator | `xcodebuildmcp: build_run_sim` |
| Run iOS tests | `xcodebuildmcp: test` |
| Capture simulator screenshot | `xcodebuildmcp: screenshot` |
| Inspect simulator UI tree | `xcodebuildmcp: snapshot_ui` |
| Tap / swipe in simulator | `xcodebuildmcp: tap`, `swipe` |
| Launch / stop app | `xcodebuildmcp: launch_app_sim`, `stop_app_sim` |

---

## Skill Inventory

### Dispatchers (6 existing skills, content replaced)

| Skill | Detects | Delegates to |
|-------|---------|-------------|
| `verify-app` | iOS vs web | `verify-web` or `verify-ios` |
| `design-verify` | iOS vs web | `design-verify-web` or `design-verify-ios` |
| `design-implement` | iOS vs web | `design-implement-web` or `design-implement-ios` |
| `design-mockup` | iOS vs web | `design-mockup-web` or `design-mockup-ios` |
| `design-analyze` | iOS vs web | `design-analyze-web` or `design-analyze-ios` |
| `design-evolve` | iOS vs web | `design-evolve-web` or `design-evolve-ios` |

### Web Skills (6 new skills)

| Skill | Source | Content |
|-------|--------|---------|
| `verify-web` | Extracted from `verify-app` | Playwright verification — accessibility snapshots by default, `--visual` for screenshots, auto diff-inference from git |
| `design-verify-web` | Extracted from `design-verify` | Playwright screenshots at 3 viewports (mobile/tablet/desktop), design-comparison MCP diff against mockup baseline |
| `design-implement-web` | Extracted from `design-implement` | CSS variables, Tailwind config, React/Next.js component generation |
| `design-mockup-web` | Extracted from `design-mockup` | HTML + inline CSS mockup, Playwright screenshot as baseline |
| `design-analyze-web` | Extracted from `design-analyze` | Dembrandt CLI on a reference URL, outputs `design-tokens.json` in W3C DTCG format |
| `design-evolve-web` | Extracted from `design-evolve` | Dembrandt on a new URL, merges updates into existing `design-tokens.json` |

### iOS Skills (6 new skills)

| Skill | Argument hint | Content |
|-------|---------------|---------|
| `verify-ios` | `[--visual] [criteria or 'auto']` | XcodeBuildMCP-based simulator verification. Default: `snapshot_ui` (view hierarchy structured check). `--visual`: `screenshot` for pixel inspection. Auto mode infers screens from Swift file changes in git diff. Boots simulator if needed (`list_sims` → `launch_app_sim`). Reports to `verification/` output dir. |
| `design-verify-ios` | `[screen-name]` | Boots simulator if needed. XcodeBuildMCP `screenshot` to capture simulator state. design-comparison MCP diff against mockup baseline. Writes diff to `design/` output dir. |
| `design-implement-ios` | _(none)_ | SwiftUI component generation: `Theme.swift` from `design-tokens.json`, SwiftUI views following iOS HIG, light/dark color scheme support. |
| `design-mockup-ios` | _(none)_ | Generates `Mockup.swift` SwiftUI preview file from design tokens. Checks for a running simulator (`list_sims`); if none is booted, uses `launch_app_sim` to start one. Uses `build_run_sim` + `screenshot` to capture the preview as the baseline image saved to `design/`. If the project doesn't build, reports the error and stops — does not write a baseline. |
| `design-analyze-ios` | `[path/to/Assets.xcassets or Theme.swift]` | Scans the current working directory for `Assets.xcassets` and any `*Theme*.swift` or `*Colors*.swift` files if no path is provided. Extracts color, typography, and spacing tokens into `design-tokens.json` in W3C DTCG format. If no Swift color definitions exist yet, creates a minimal token file from the asset catalog alone and notes what's missing. |
| `design-evolve-ios` | `<path/to/Theme.swift or project dir>` | Takes a local filesystem path to a reference Swift file or Xcode project directory. Extracts design tokens from the reference. Merges updates into the existing `design-tokens.json`, preserving tokens not present in the reference. |

**`verify-web` companion file:** `browser-lock.sh` currently lives in `skills/verify-app/`. It must move to `skills/verify-web/`. The `SKILL_DIR` resolution path in `verify-web/SKILL.md` must reference `verify-web` not `verify-app`.

**Non-obvious allowed-tools for sub-skills:**
- `design-mockup-web` — requires `Bash(*/start-server.sh *)` for the visual companion server
- `design-implement-web` — requires `Bash(npx design-token-bridge-mcp *)` inherited from current `design-implement`
- `design-evolve-ios` — does NOT need `Bash(npx dembrandt *)` (dembrandt is web-only). Requires `Read` and `Glob` for filesystem traversal of Swift files; no additional Bash patterns needed beyond the standard `Bash(git *)`

---

## Design Pipeline — Updated Flow

```
/design-analyze [web|ios] → /design-language → /design-mockup [web|ios] → /design-implement [web|ios] → /design-refine → /design-verify [web|ios]
                                               ^
                                      /design-evolve [web|ios] (anytime)
```

`design-language` and `design-refine` remain platform-agnostic — brand personality and Impeccable refinement apply to both platforms.

---

## Preamble Update Strategy

`skills/_preamble.md` embeds the 22-skill table and skill count. It must be updated and propagated to all existing SKILL.md files.

**Changes to `_preamble.md`:**
1. Update skill count: `22 custom skills` → `34 custom skills`
2. Add 12 new rows to the skills table (6 web + 6 iOS sub-skills)
3. Update dispatcher rows to note they detect platform and delegate

**Propagation:** After updating `_preamble.md`, replace the preamble block (between `=== PREAMBLE START ===` and `=== PREAMBLE END ===`) in all existing SKILL.md files that embed the markers. Also propagate to `bootstrap/SKILL.md`. The 12 new skills get the updated preamble from the start.

Note: `verify-app` currently embeds inline preamble content without the `=== PREAMBLE START ===` markers — since it becomes a thin dispatcher, its content is replaced entirely and the new version should use the standard preamble markers.

Note: `bootstrap/SKILL.md` is currently stale at 21 skills (not 22) and is missing `verify-app` from its `for s in ...` loop. Preamble propagation will bring it to 34 and add all missing skill names in one pass.

**`_design-preamble.md`:** This separate preamble embedded in design skills currently reads `Run /design-analyze <url>`. After this change, `/design-analyze` is a dispatcher — the advice should be updated to `Run /design-analyze (detects web vs iOS automatically)` so it remains accurate for both platforms.

**The bootstrap check shell loop** inside the preamble block (`for s in ...`) hardcodes skill names. All 12 new skill names must be added to this loop so the bootstrap check validates their symlinks.

---

## setup.sh Changes

Add 12 new skill names to the `MANAGED_SKILLS` array:
```
verify-web verify-ios
design-verify-web design-verify-ios
design-implement-web design-implement-ios
design-mockup-web design-mockup-ios
design-analyze-web design-analyze-ios
design-evolve-web design-evolve-ios
```

---

## CLAUDE.md Changes

Update the tagline (line 3): `22 custom skills` → `34 custom skills`.

---

## Files Changed

| File | Change |
|------|--------|
| `config/mcp.json` | Replace mobai with xcodebuildmcp |
| `setup.sh` | (1) Add 12 new skill names to MANAGED_SKILLS; (2) replace `claude mcp add mobai ...` with `claude mcp add xcodebuildmcp npx -y xcodebuildmcp@latest mcp --scope user`; (3) add `claude mcp remove mobai --scope user 2>/dev/null \|\| true` before the add, to deregister the old server for existing installs |
| `.claude/rules/mcp-servers.md` | Replace mobai row with xcodebuildmcp rows |
| `.claude/rules/skills.md` | Update all three hardcoded "22" skill-count references to "34" |
| `.claude/rules/design.md` | Update pipeline diagram to show `[web\|ios]` dispatcher notation; update "Adding New Design Skills" section to note web/iOS pairs |
| `planning/ARCHITECTURE.md` | (1) Update `mcp.json` comment to reference xcodebuildmcp; (2) update skill count in all prose references (lines ~5, ~117, ~359, ~423, ~602); (3) update annotated directory tree skill count and design skill entries; (4) update design pipeline diagram; (5) update the skills section paragraph that lists design pipeline skills by name to describe the dispatcher pattern |
| `CLAUDE.md` | Update skill count in tagline: `22 custom skills` → `34 custom skills` |
| `skills/_preamble.md` | (1) Update skill count; (2) add 12 new rows to table; (3) update dispatcher rows to note they detect platform and delegate; (4) extend the `for s in ...` bootstrap check loop with all 12 new skill names |
| `skills/_design-preamble.md` | Update `/design-analyze <url>` advice to `/design-analyze (detects web vs iOS automatically)` |
| `bootstrap/SKILL.md` | (1) Preamble block propagation (currently at 21, not 22 — propagation brings it to 34); (2) replace mobai row with xcodebuildmcp in its MCP server listing |
| `skills/verify-app/SKILL.md` | Replace with dispatcher (content rewritten from scratch, standard preamble markers added) |
| `skills/verify-app/browser-lock.sh` | Move to `skills/verify-web/browser-lock.sh` |
| `skills/design-verify/SKILL.md` | Replace with dispatcher |
| `skills/design-implement/SKILL.md` | Replace with dispatcher (drop `argument-hint: <target>`) |
| `skills/design-mockup/SKILL.md` | Replace with dispatcher |
| `skills/design-analyze/SKILL.md` | Replace with dispatcher |
| `skills/design-evolve/SKILL.md` | Replace with dispatcher |
| `skills/verify-web/SKILL.md` | New — extracted from verify-app; sources `browser-lock.sh` from `verify-web/` |
| `skills/verify-ios/SKILL.md` | New — XcodeBuildMCP |
| `skills/design-verify-web/SKILL.md` | New — extracted from design-verify |
| `skills/design-verify-ios/SKILL.md` | New — XcodeBuildMCP |
| `skills/design-implement-web/SKILL.md` | New — extracted from design-implement |
| `skills/design-implement-ios/SKILL.md` | New — extracted from design-implement |
| `skills/design-mockup-web/SKILL.md` | New — extracted from design-mockup (retains `Bash(*/start-server.sh *)` allowed-tool) |
| `skills/design-mockup-ios/SKILL.md` | New — XcodeBuildMCP |
| `skills/design-analyze-web/SKILL.md` | New — extracted from design-analyze |
| `skills/design-analyze-ios/SKILL.md` | New — asset catalog extraction |
| `skills/design-evolve-web/SKILL.md` | New — extracted from design-evolve |
| `skills/design-evolve-ios/SKILL.md` | New — iOS token merge |
| All existing SKILL.md files with preamble markers | Preamble block propagation |

---

## Out of Scope

- `design-language` — platform-agnostic, no change
- `design-refine` — platform-agnostic, no change
- All 16 non-design/verify skills — no change
- Android support — not a current project need; XcodeBuildMCP is iOS/macOS only
