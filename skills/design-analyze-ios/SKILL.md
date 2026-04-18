---
name: design-analyze-ios
description: Scan Assets.xcassets and Swift theme files to extract design tokens (colors, typography, spacing) into design-tokens.json in W3C DTCG format. Pass a specific path or let the skill auto-discover.
---

## Shared Setup

Read [the shared Codex skill preamble](../_preamble.md) before proceeding.
Read [the shared design preamble](../_design-preamble.md) before continuing.

> **Note:** This skill creates design context — missing `design-tokens.json` is expected on first run.

---

# Design Analyze iOS — Extract Design Tokens from Swift/Xcode Assets

Scans the Xcode project for color, typography, and spacing definitions and writes `design-tokens.json` in W3C DTCG format.

## Step 1: Locate Source Files

### With explicit path argument:
Use the provided path directly (an `Assets.xcassets` directory or a `*Theme*.swift` / `*Colors*.swift` file).

### Without argument (auto-discover):
Use Glob to find:
```
Glob("**/*.xcassets")
Glob("**/*Theme*.swift")
Glob("**/*Colors*.swift")
Glob("**/*Color*.swift")
```

If nothing is found:
> "No Swift color definitions or asset catalogs found. Start your project and add a color asset catalog or a theme file, then re-run."

## Step 2: Extract Color Tokens

### From `Assets.xcassets`:
Read each `.colorset/Contents.json` file. Extract:
- Color name (from directory name)
- Light mode RGBA values
- Dark mode RGBA values (if present)
- Convert to hex string format

### From Swift theme files:
Read the file and parse patterns like:
- `static let primaryColor = Color(hex: "#...")` → extract hex
- `Color(red: N, green: N, blue: N)` → convert to hex
- `Color(.systemBlue)` → note as system color
- `static var background: Color { ... }` → extract color name and value

## Step 3: Extract Typography Tokens (if present)

Look for patterns in Swift theme files:
- `Font.system(size: N, weight: .bold)` → extract size and weight
- `static let headingFont = Font.custom("...", size: N)` → font family + size
- `UIFont.systemFont(ofSize: N, weight: ...)` → size and weight

## Step 4: Extract Spacing Tokens (if present)

Look for numeric constants used as spacing:
- `static let padding: CGFloat = N` → spacing token
- `static let cornerRadius: CGFloat = N` → radius token
- Struct or enum with spacing values

## Step 5: Write design-tokens.json

If `design-tokens.json` already exists, ask the user directly:
> "design-tokens.json already exists. Overwrite with extracted iOS tokens? (yes/no)"

Write extracted tokens in W3C DTCG format:

```json
{
  "$schema": "https://design-tokens.org/schema.json",
  "color": {
    "primary": { "$value": "#6366F1", "$type": "color" },
    "primary-dark": { "$value": "#818CF8", "$type": "color" },
    "background": { "$value": "#FFFFFF", "$type": "color" }
  },
  "typography": {
    "heading": {
      "fontSize": { "$value": "28px", "$type": "dimension" },
      "fontWeight": { "$value": "700", "$type": "number" }
    }
  },
  "spacing": {
    "sm": { "$value": "8px", "$type": "dimension" },
    "md": { "$value": "16px", "$type": "dimension" },
    "lg": { "$value": "24px", "$type": "dimension" }
  }
}
```

If no Swift color definitions existed (only asset catalog):
> "Created design-tokens.json from color assets only. Typography and spacing tokens could not be auto-extracted — add them manually or create a theme file."

## Step 6: Present Summary

```
iOS Design Token Extraction Complete
=====================================

Sources scanned:
  {list of files read}

Colors:     N tokens extracted
Typography: N tokens extracted (or: not found)
Spacing:    N tokens extracted (or: not found)

Written to: design-tokens.json

Next steps:
  1. Run design-language to define brand personality
  2. Run design-mockup-ios to generate a SwiftUI preview mockup
  3. Run design-implement-ios to generate Theme.swift
```

## Rules

- Never infer colors from view background or text color assignments — only extract explicit theme/constant definitions
- If Swift files use system colors (`Color(.systemBlue)`) without a custom equivalent, note them in the output but do not add a token for them
- Do not modify existing Swift files — read-only extraction
- Convert all CGFloat dimensions to `"Npx"` string format for DTCG compatibility
