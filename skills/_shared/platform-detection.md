# Platform Detection (shared)

Canonical web/iOS detection and dispatch contract for the 6 dispatcher skills: verify-app, design-analyze, design-evolve, design-mockup, design-implement, design-verify.
Referenced via: SHARED_DIR pattern (CD2).

## Detection

**iOS** — any hit from these Globs, ignoring `node_modules/`, `.build/`, `Pods/`, `vendor/`, `external-skills/`:
- `Glob("**/Package.swift")`
- `Glob("**/*.xcodeproj")`
- `Glob("**/*.xcworkspace")`

**Web** — a `package.json` whose dependencies (or devDependencies) include any of: `next`, `react`, `vite`, `vue`, `@angular/core`.

## Platform Resolution

| Detected | Action |
|----------|--------|
| iOS only | Invoke the iOS sub-skill with original arguments |
| Web only | Invoke the web sub-skill with original arguments |
| Both present | `AskUserQuestion`: "Both iOS and web project files detected. Which platform should I verify? (web / ios)" → invoke chosen |
| Neither present | `AskUserQuestion`: "No iOS or web project files detected. Which platform should I verify? (web / ios)" → invoke chosen |

All user-supplied arguments are passed through to the sub-skill unchanged.

## Dispatch contract

1. Echo before dispatching: `dispatch: <sub-skill> args=<args>`
2. Dispatch literally: `Skill(skill="<sub-skill>", args="<original args verbatim>")`
3. If a required argument is empty, **stop** and ask — never dispatch with a blank required arg.
