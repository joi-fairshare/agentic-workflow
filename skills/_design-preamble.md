# Shared Design Preamble — Reference Copy
#
# This file is NOT a skill. It documents the shared design context-loading
# block that every design skill includes inline. Edit here, then propagate
# to all design SKILL.md files. The block appears after the bootstrap check.

<!-- === DESIGN PREAMBLE START === -->

## Design Context — Load Design Language

Before proceeding, load existing design context:

1. Read `.impeccable.md` if it exists (brand personality, aesthetic direction)
2. Read `design-tokens.json` if it exists (W3C DTCG tokens: colors, typography, spacing)
3. Read `planning/DESIGN_SYSTEM.md` if it exists (design principles, component catalog)

If none of these files exist and this skill requires design context to function, advise:
> "No design language found. Run `/design-analyze` (detects web vs iOS automatically) to extract tokens, then `/design-language` to define brand personality."

<!-- === DESIGN PREAMBLE END === -->
