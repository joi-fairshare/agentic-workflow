---
name: design-evolve
description: Detect web vs iOS automatically and delegate to design-evolve-web (Dembrandt on a new URL) or design-evolve-ios (extract from local Swift reference). Merges updates into design-tokens.json.
---

<!-- MEMORY: SKIP -->
## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

---

# Design Evolve — Platform Dispatcher

Detects whether this is a web or iOS project and delegates to the appropriate design evolution skill. Contains no implementation logic.

> **Tip:** If you already know the platform, invoke directly:
> - Web: `design-evolve-web <url>`
> - iOS: `design-evolve-ios <path/to/Theme.swift>`

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
| iOS only | Open and follow [design-evolve-ios](../design-evolve-ios/SKILL.md) with the original arguments |
| Web only | Open and follow [design-evolve-web](../design-evolve-web/SKILL.md) with the original arguments |
| Both present | Ask the user directly: "Both iOS and web project files detected. Which platform should I evolve the design for? (web / ios)" Then follow the selected skill. |
| Neither present | Ask the user directly: "No iOS or web project files detected. Which platform? (web / ios)" Then follow the selected skill. |

All user-supplied arguments are passed through to the sub-skill unchanged.
