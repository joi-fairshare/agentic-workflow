# Statusline Configuration Design

**Date:** 2026-03-21
**Issue:** #9 — Add statusline configuration
**Branch:** feat/statusline-config

## Summary

Add a Claude Code statusline showing model, git branch, context usage, session cost, elapsed time, cache hit rate, API wait percentage, lines changed, and rate limit usage. Two-line output with a dimmed header row for scannability.

## Output Format

```
Model   │ Branch          │ Context    │ Cost  │ Time │ Cache │ API  │ Lines    │ Rate
Opus    │ feat/my-branch  │ ████████░░ │ $2.40 │ 45m  │ 82%   │ 60%  │ +142 -38 │ 5h: 34%
```

Line 1: Header row rendered in dim/grey (`\033[2m`).
Line 2: Values with color-coded context bar and rate limit.

## Fields

| # | Field | Source | Format | Fallback |
|---|-------|--------|--------|----------|
| 1 | Model | `model.display_name` | Raw string | `--` |
| 2 | Branch | `git rev-parse --abbrev-ref HEAD` | Raw string | `--` |
| 3 | Context | `context_window.used_percentage` | 10-char bar + hidden % | Empty bar |
| 4 | Cost | `cost.total_cost_usd` | `$X.XX` | `$0.00` |
| 5 | Time | `cost.total_duration_ms` | `Xm` or `Xh Ym` | `0m` |
| 6 | Cache | `current_usage.cache_read_input_tokens / (cache_read + cache_creation + input_tokens)` | `X%` | `--` |
| 7 | API | `total_api_duration_ms / total_duration_ms * 100` | `X%` | `--` |
| 8 | Lines | `cost.total_lines_added`, `cost.total_lines_removed` | `+N -N` | `+0 -0` |
| 9 | Rate | `rate_limits.five_hour.used_percentage` | `5h: X%` | Hidden |

## Color Coding

### Context Bar
- **Green** (`\033[32m`): <50% usage
- **Yellow** (`\033[33m`): 50-75% usage
- **Red** (`\033[31m`): >75% usage

### Rate Limit
Same thresholds as context bar applied to `five_hour.used_percentage`.

## Graceful Degradation

Fields 6-9 degrade when data is unavailable:
- **Cache/API**: Show `--` before first API call (`current_usage` is null)
- **Rate limit**: Entire column hidden when `rate_limits` is null (API-key users, not Pro/Max)
- **All numeric fields**: Default to zero/empty rather than erroring

## Data Interface

The statusline script receives JSON via **stdin** (not environment variables). Key paths:

```json
{
  "model": { "display_name": "Opus" },
  "context_window": {
    "used_percentage": 78.2,
    "current_usage": {
      "input_tokens": 1200,
      "cache_creation_input_tokens": 500,
      "cache_read_input_tokens": 3000
    }
  },
  "cost": {
    "total_cost_usd": 2.40,
    "total_duration_ms": 2700000,
    "total_api_duration_ms": 1620000,
    "total_lines_added": 142,
    "total_lines_removed": 38
  },
  "rate_limits": {
    "five_hour": { "used_percentage": 34.0 }
  },
  "workspace": { "current_dir": "/path/to/repo" }
}
```

## File Layout

| File | Purpose |
|------|---------|
| `config/statusline.sh` | Statusline script (bash, reads JSON stdin via jq) |
| `config/settings.json` | Add `statusLine` config block |
| `setup.sh` | Copy script to `~/.claude/statusline.sh`, chmod +x |

## Settings.json Addition

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}
```

## Setup.sh Addition

After the existing settings.json copy step, add:

```bash
cp config/statusline.sh ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh
echo "  statusline script installed"
```

## Dependencies

- **jq** — required for JSON parsing. setup.sh should verify jq is installed and warn if missing.

## Acceptance Criteria

- [ ] `config/statusline.sh` created with all 9 fields
- [ ] Two-line output: dimmed header + color-coded values
- [ ] Color-coded context bar (green/yellow/red at 50%/75% thresholds)
- [ ] Color-coded rate limit (same thresholds)
- [ ] Graceful fallbacks for missing/null data
- [ ] `config/settings.json` updated with `statusLine` block
- [ ] `setup.sh` updated to install the script
- [ ] jq dependency check in setup.sh
