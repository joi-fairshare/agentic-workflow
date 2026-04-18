---
name: design-implement
description: Detect web vs iOS automatically and delegate to design-implement-web (CSS/Tailwind/Next.js) or design-implement-ios (SwiftUI Theme.swift). Generates production code from approved mockup.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Implement — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate code generation skill. Contains no implementation logic.

> **Tip:** If you already know the platform, invoke directly: `design-implement-web` or `design-implement-ios`

## Platform Detection

Use the `Glob` tool to check for iOS indicators:

```
Glob("Package.swift")
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
| iOS only | Open and follow [design-implement-ios](../design-implement-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [design-implement-web](../design-implement-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I generate code for? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform should I generate code for? (web / ios)" Then follow the selected skill. |

Arguments are passed through unchanged. Platform is auto-detected — users no longer need to specify `web` or `swiftui`. To override detection, invoke the sub-skill directly.
