---
name: design-verify
description: Detect web vs iOS automatically and delegate to design-verify-web (Playwright screenshots) or design-verify-ios (XcodeBuildMCP screenshots). Diffs against mockup baseline.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Verify — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate screenshot verification skill. Contains no implementation logic.

> **Tip:** If you already know the platform, invoke directly: `design-verify-web` or `design-verify-ios`

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
| iOS only | Open and follow [design-verify-ios](../design-verify-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [design-verify-web](../design-verify-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I verify? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform should I verify? (web / ios)" Then follow the selected skill. |

All user-supplied arguments (e.g., `[screen-name]`) are passed through to the sub-skill unchanged.
