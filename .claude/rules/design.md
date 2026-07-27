---
globs: ["design-tokens.json", ".impeccable.md", "planning/DESIGN_SYSTEM.md", "skills/design-*/**"]
---

# Design Rules

## Design Pipeline

The design system is built and evolved through a 7-skill pipeline:

```
/design-analyze [web|ios] → /design-language → /design-mockup [web|ios] → /design-implement [web|ios] → /design-refine → /design-verify [web|ios]
                                               ^
                                      /design-evolve [web|ios] (anytime, merges new reference)
```

Each skill writes artifacts that downstream skills auto-discover. Never skip steps — implementing without a mockup baseline makes `/design-verify` impossible.

## Design Artifacts

| File | Created by | Purpose |
|------|------------|---------|
| `design-tokens.json` | `/design-analyze` | W3C DTCG token set (colors, typography, spacing, motion) |
| `.impeccable.md` | `/design-language` | Brand personality + aesthetic direction for AI context |
| `planning/DESIGN_SYSTEM.md` | `/design-language` | Full component catalog, strategic decisions, design principles |

These three files must stay in sync. When running `/design-evolve`, all three are updated together.

## design-tokens.json Format

W3C DTCG format — tokens are nested objects with `$value` and `$type`:

```json
{
  "color": {
    "accent": { "$value": "#6366f1", "$type": "color" },
    "text-primary": { "$value": "#f8fafc", "$type": "color" },
    "surface": { "$value": "#0f172a", "$type": "color" }
  },
  "spacing": {
    "s1": { "$value": "4px", "$type": "dimension" },
    "s2": { "$value": "8px", "$type": "dimension" }
  },
  "font": {
    "family-mono": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" }
  }
}
```

When adding new tokens, follow the existing nesting structure. Never flatten to a single level.

## Design Principles (from DESIGN_SYSTEM.md)

- **Minimalist**: No decoration without function. Negative space is intentional.
- **Monospace-first**: Monospace typography for data, code, timestamps, and identifiers.
- **Accent economy**: Reserve accent color (`--color-accent`) for the single most important action per screen.
- **Glow effects sparingly**: Subtle box-shadow glow on focused or primary elements only.
- **Semantic tokens**: Use semantic names (`--color-text-primary`) not raw values in component code.

## CSS Custom Properties (spacing scale)

```css
:root {
  --s1: 4px;   --s2: 8px;   --s3: 12px;  --s4: 16px;
  --s6: 24px;  --s8: 32px;  --s12: 48px; --s16: 64px;
}
```

Use these variables directly rather than Tailwind arbitrary values for spacing that matches the design system.

## .impeccable.md

This file is the AI context document for the brand. It describes:
- Brand personality (tone, adjectives, voice)
- Aesthetic direction (visual metaphors, feeling)
- What to avoid (patterns that conflict with the brand)
- Reference sites and what was extracted from them

It is consumed by `/design-mockup`, `/design-implement`, and `/design-refine` as context for generation decisions. Keep it concise — it's injected into LLM prompts.

## Design Skill Output Directory

All design artifacts are written to `~/.agentic-workflow/<repo-slug>/design/`. The full artifact table (owner + consumer per file) lives in `skills/_shared/design-artifact-paths.md` — that file is the source of truth.

```
design/
├── design-tokens.json                    # W3C DTCG token set
├── .impeccable.md                        # Brand context (+ ## Sources appended by /design-evolve)
├── screens.json                          # Screen manifest (schema screens/v1): route, nav recipe,
│                                         #   baselines, approved_at, baseline_stale, source
├── mockup-<screen>.html                  # Web mockup source (persisted)
├── Mockup-<screen>.swift                 # iOS mockup source (persisted)
├── mockup-web-<screen>-<viewport>.png    # Web baselines; viewports: mobile (375×812),
│                                         #   tablet (768×1024), desktop (1440×900)
├── mockup-ios-<screen>.png               # iOS baseline (+ optional mockup-ios-<screen>-dark.png)
└── verify/<run-id>/                      # One dir per /design-verify run
    ├── <screen>-<viewport>-diff.png      # Pixel diff overlays
    └── comparison-report.json            # schema comparison-report/v1: per-screen diff_pct + verdict
```

Baselines are set when `/design-mockup` runs and are never overwritten by `/design-verify` — verify runs write only into run-scoped `design/verify/<run-id>/` dirs. Update baselines only by re-running `/design-mockup`. `/design-evolve` marks existing baselines stale via `baseline_stale` in `screens.json` when tokens are adopted. Verify skills still glob legacy `mockup-<screen>.png` / `mockup-ios.png` baselines with a "legacy baseline — re-run /design-mockup to upgrade" warning.

## Adding New Design Skills

New `skills/design-*/` directories must:
1. Have a `SKILL.md` with the full preamble block (use `=== PREAMBLE START ===` / `=== PREAMBLE END ===`)
2. Reference `.impeccable.md` and `design-tokens.json` for context
3. Write outputs to `~/.agentic-workflow/<repo-slug>/design/`
4. Document where they fit in the pipeline (after which skill, before which skill)
