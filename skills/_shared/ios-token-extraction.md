# iOS Token Extraction (shared)

Canonical extraction of design tokens from Xcode asset catalogs and Swift theme files. Referenced by design-analyze-ios and design-evolve-ios.
Referenced via: SHARED_DIR pattern (CD2).

## Colors

**From `Assets.xcassets`:** read each `.colorset/Contents.json`. Extract the color name (directory name), light-mode RGBA values, dark-mode RGBA values (if present); convert to hex strings.

**From Swift theme files**, parse patterns like:
- `static let primaryColor = Color(hex: "#...")` → extract hex
- `Color(red: N, green: N, blue: N)` → convert to hex
- `Color(.systemBlue)` → note as system color
- `static var background: Color { ... }` → extract color name and value

## Typography

Look for patterns in Swift theme files:
- `Font.system(size: N, weight: .bold)` → extract size and weight
- `static let headingFont = Font.custom("...", size: N)` → font family + size
- `UIFont.systemFont(ofSize: N, weight: ...)` → size and weight

## Spacing (restricted)

Only treat a numeric constant as a spacing token when **both** hold (AI2):
- type is `CGFloat` (or an explicit numeric literal in a spacing/layout struct or enum), **and**
- the name matches a spacing/layout pattern: `padding|spacing|margin|inset|gap|cornerRadius|radius` (case-insensitive).

Examples: `static let padding: CGFloat = N` → spacing token; `static let cornerRadius: CGFloat = N` → radius token. Do **not** ingest arbitrary CGFloat constants (opacities, durations, scales) as spacing.

## Completeness gate (AI1)

After extraction, count results. If **fewer than 3 colors** or **0 typography tokens** were found, report the shortfall (what was searched, what was found) and ask via AskUserQuestion whether to: point at a different theme file/path, proceed with the partial token set, or abort. Never silently write a near-empty `design-tokens.json`.
