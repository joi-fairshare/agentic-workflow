---
name: verify-app
description: "Detect web vs iOS automatically and delegate to verify-web (Playwright) or verify-ios (XcodeBuildMCP). Pass any arguments through unchanged."
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

---

# Verify App — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate verification skill. Contains no verification logic — all execution lives in the sub-skills.

> **Tip:** If you already know the platform, invoke directly: `verify-web` or `verify-ios`

## Platform Detection

Use the `Glob` tool to check for iOS indicators:

```
Glob("**/Package.swift")
Glob("**/*.xcodeproj")
Glob("**/*.xcworkspace")
```

Use the `Read` tool to check for web indicators:
- Read `package.json` — check if `dependencies` or `devDependencies` includes any of: `next`, `react`, `vite`, `vue`, `@angular/core`

**iOS detected** = any Glob above returns a match.
**Web detected** = `package.json` exists AND its deps include one of the above frameworks.

## Platform Resolution

| Detected | Action |
|----------|--------|
| iOS only | Open and follow [verify-ios](../verify-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [verify-web](../verify-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I verify? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform should I verify? (web / ios)" Then follow the selected skill. |

All user-supplied arguments (e.g., `--visual`, `auto`, explicit criteria) are passed through to the sub-skill unchanged.
