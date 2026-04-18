# Shared Design Preamble

Read this after the shared execution preamble for any design-oriented skill.

## Load Design Context

1. Read `.impeccable.md` if it exists and note the brand personality, design direction, and any listed source URLs.
2. Read `design-tokens.json` if it exists.
3. Read `planning/DESIGN_SYSTEM.md` if it exists.

If none of those exist and the skill depends on design direction, open `../design-language/SKILL.md` and follow that workflow first, or ask the user for the missing design context before proceeding.

## Inventory Existing UI Building Blocks

Before inventing new components, inspect the repo for what already exists:

- Check `package.json` for common UI libraries such as Radix UI, shadcn/ui, Headless UI, React Aria, MUI, Chakra UI, Mantine, Ant Design, NextUI, or daisyUI.
- Cross-reference `.impeccable.md` source URLs for library docs that may signal an intended design system even if the package is not installed yet.
- Scan likely component directories such as `src/components`, `components`, `app/components`, `ui/src/components`, and relevant Swift files for reusable primitives.

Summarize the detected library and the reusable primitives you found, then prefer those primitives before creating new ones.

## Design Pipeline

Use the repo's design skills as a pipeline when helpful:

- `design-language` defines brand personality and design tokens.
- `design-mockup` creates the approved target screens.
- `design-implement` turns approved mockups into production code.
- `design-refine` applies focused refinement skills.
- `design-verify` checks the implementation against the approved mockup.
- `design-evolve` merges new references into the existing design language.
