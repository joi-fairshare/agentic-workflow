---
name: design-analyze
description: Detect web vs iOS automatically and delegate to design-analyze-web (Dembrandt CLI on URLs) or design-analyze-ios (Swift/Xcode asset extraction). Writes design-tokens.json.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.

> **Note:** This skill creates design context — missing `design-tokens.json` is expected on first run.

---

# Design Analyze — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate token extraction skill. Contains no implementation logic.

> **Tip:** If you already know the platform, invoke directly:
> - Web: `design-analyze-web <url> [url2...]`
> - iOS: `design-analyze-ios [path/to/Assets.xcassets]`

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
| iOS only | Open and follow [design-analyze-ios](../design-analyze-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [design-analyze-web](../design-analyze-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I extract design tokens for? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform? (web / ios)" Then follow the selected skill. |

All user-supplied arguments are passed through to the sub-skill unchanged.
