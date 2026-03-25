# Shared Design Preamble — Reference Copy
#
# This file is NOT a skill. It documents the shared design context-loading
# block that every design skill includes inline. Edit here, then propagate
# to all design SKILL.md files. The block appears after the bootstrap check.

<!-- === DESIGN PREAMBLE START === -->

## Design Context — Load Design Language

### Block 1: Load design language

1. Read `.impeccable.md` if it exists:
   - Note the brand personality and aesthetic direction
   - Note the `## Sources` section: the URLs used to build the design tokens
2. Read `design-tokens.json` if it exists (W3C DTCG: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (component catalog, design principles)

If none exist and this skill requires design context:
> "No design language found. Run `/design-language [url1 url2...]` to synthesize from
> reference materials, then retry."

### Block 2: Dynamic component inventory

Run the following scan and surface results as context before proceeding with the skill's own steps.

**Part A: Component library detection**

Read `package.json` (if it exists) and check `dependencies` + `devDependencies` for known libraries:

| Package pattern | Library |
|-----------------|---------|
| `@radix-ui/*` | Radix UI |
| `shadcn-ui`, `@shadcn/*` | shadcn/ui |
| `@headlessui/*` | Headless UI |
| `react-aria`, `@react-aria/*` | React Aria |
| `@mui/*` | Material UI |
| `@chakra-ui/*` | Chakra UI |
| `@mantine/*` | Mantine |
| `antd` | Ant Design |
| `@nextui-org/*` | NextUI |
| `daisyui` | daisyUI |

Cross-reference with the `## Sources` URLs from `.impeccable.md` — if a source URL matches a known component library's docs site (e.g., `ui.shadcn.com`, `radix-ui.com`, `mantine.dev`), note it as the detected library even if `package.json` doesn't yet include it.

For iOS: check Swift files for `import SwiftUI` (standard) or third-party component libs.

**Part B: Repo primitive scan**

```
Glob("src/components/**/*.{tsx,jsx,ts,js}")
Glob("components/**/*.{tsx,jsx,ts,js}")
Glob("app/components/**/*.{tsx,jsx,ts,js}")
Glob("ui/src/components/**/*.{tsx,jsx,ts,js}")
Glob("**/*.swift", limit to top 2 directory levels)
```

Collect file names (not contents), deduplicate, and derive component names from filenames
(e.g., `button.tsx` → `Button`, `card-header.tsx` → `CardHeader`).

Surface as a context note before proceeding:

```
Component context:
  Library:    shadcn/ui (detected from package.json + impeccable.md sources)
  Primitives: Button, Card, Input, Dialog, Badge, Separator (+7 more)

  Use these components in mockups and implementations before inventing new ones.
```

If no library and no primitives found: note "No component library or repo primitives detected — generate from scratch using design tokens."

### Block 3: Orchestration overview

```
Design pipeline:
  /design-language [urls]  →  synthesize tokens + brand personality
  /design-mockup <screen>  →  HTML (web) or SwiftUI (iOS) mockup
  /design-implement        →  production code from approved mockup
  /design-refine           →  Impeccable polish pass
  /design-verify           →  screenshot diff vs mockup baseline

  /design-evolve  can run anytime to merge new reference materials.
```

<!-- === DESIGN PREAMBLE END === -->
