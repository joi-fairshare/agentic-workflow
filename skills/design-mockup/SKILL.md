---
name: design-mockup
description: Detect web vs iOS automatically and delegate to design-mockup-web (HTML mockup + Playwright baseline) or design-mockup-ios (SwiftUI preview + simulator baseline).
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Mockup — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate mockup skill. Contains no implementation logic.

> **Tip:** If you already know the platform, invoke directly: `design-mockup-web <screen-name>` or `design-mockup-ios`

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
| iOS only | Open and follow [design-mockup-ios](../design-mockup-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [design-mockup-web](../design-mockup-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I create a mockup for? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform should I create a mockup for? (web / ios)" Then follow the selected skill. |

All user-supplied arguments (e.g., `<screen-name>`) are passed through to the sub-skill unchanged.
