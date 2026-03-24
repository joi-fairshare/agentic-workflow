---
description: MCP servers registered globally — available in every session
---

# MCP Servers

All servers are registered globally via `claude mcp add --scope user`.

| Server | Purpose | Use instead of |
|--------|---------|----------------|
| `serena` | LSP symbol navigation — find definitions, usages, call hierarchy | `Grep` + `Read` for code structure questions |
| `agentic-bridge` | Multi-agent messaging and memory graph | Manual context passing between agents |
| `context7` | Up-to-date library/framework documentation | Guessing API shapes from training data |
| `playwright` | Browser automation — click, fill, screenshot, DOM inspection | Manual browser testing |
| `github` | GitHub API — PRs, issues, releases, comments | `gh` CLI for read operations |
| `design-comparison` | Visual diff between implementation and design reference | Manual screenshot comparison |
| `xcodebuildmcp` | iOS Simulator control — build, launch, snapshot_ui, screenshot, tap, swipe | Manual iOS testing |

## When to use Serena vs Grep/Read

| Task | Tool |
|------|------|
| Where is function/class X defined? | `serena: find_symbol` |
| What calls function X? | `serena: get_symbol_usages` |
| What does this file export? | `serena: get_document_symbols` |
| Navigate to a type definition | `serena: find_symbol` |
| Search for a string, log message, or config value | `Grep` |
| Read full file context | `Read` |

## When to use XcodeBuildMCP

| Task | Tool |
|------|------|
| Check what's on screen (structural) | `xcodebuildmcp: snapshot_ui` |
| Check layout/visual appearance | `xcodebuildmcp: screenshot` |
| Tap a button or UI element | `xcodebuildmcp: tap` |
| Swipe / scroll | `xcodebuildmcp: swipe` |
| List available simulators | `xcodebuildmcp: list_sims` |
| Launch app on simulator | `xcodebuildmcp: launch_app_sim` |

Use `snapshot_ui` by default — it returns a structured view hierarchy that's faster and cheaper to parse than screenshots. Only use `screenshot` (via `/verify-ios --visual` or `/design-verify-ios`) when pixel-level visual inspection is needed.

Serena requires `.serena/project.yml` in the repo root. Run `/bootstrap` on any repo that
lacks it — the skill detects languages and writes the config automatically.

## Claude Code Settings

`disableBypassPermissionsMode: "disable"` in `.claude/settings.json` prevents `--dangerously-skip-permissions` mode. This value is a string `"disable"` (not a boolean) per Claude Code 1.x settings schema.
