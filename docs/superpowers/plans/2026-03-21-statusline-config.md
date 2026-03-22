# Statusline Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-line Claude Code statusline showing model, git branch, context usage, cost, elapsed time, cache hit rate, API wait %, lines changed, and rate limit usage — with color coding and graceful degradation.

**Architecture:** Single bash script (`config/statusline.sh`) reads JSON from stdin via one `jq` call, extracts all fields tab-separated, formats with ANSI color codes, and outputs two `printf '%b'` lines (dimmed header + color-coded values). Setup installs the script to `~/.claude/statusline.sh` and configures `settings.json`.

**Tech Stack:** Bash, jq, printf, git

---

**Spec:** `docs/superpowers/specs/2026-03-21-statusline-config-design.md`

**Files:**

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `config/statusline.sh` | Statusline script — reads JSON stdin, single jq extraction, formatted two-line display with color coding |
| Modify | `config/settings.json` | Add `statusLine` configuration block |
| Modify | `setup.sh` | jq dependency check, script installation, settings merge for existing users |

---

### Task 1: Create statusline.sh

**Files:**
- Create: `config/statusline.sh`

- [ ] **Step 1: Create the script file**

Create `config/statusline.sh` with the complete implementation:

```bash
#!/usr/bin/env bash

# Claude Code statusline — reads session JSON from stdin
# Two-line output: dimmed header row + color-coded values
# Spec: docs/superpowers/specs/2026-03-21-statusline-config-design.md

INPUT=$(cat)

# Fallback for empty or invalid input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  printf '%b\n' '\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m'
  printf '%b\n' '--      │ --              │ ░░░░░░░░░░ │ --     │ --    │ --    │ --   │ --'
  exit 0
fi

# Single jq call — extract all fields at once, tab-separated
# Computes: bar fill count, time in minutes, cache %, API % — avoids extra subprocesses
IFS=$'\t' read -r MODEL DIR CTX_PCT BAR_FILL COST TOTAL_MIN API_PCT CACHE_PCT LINES_ADD LINES_DEL RATE_PCT <<< $(
  echo "$INPUT" | jq -r '
    [
      (.model.display_name // "--"),
      (.workspace.current_dir // ""),
      (.context_window.used_percentage // ""),
      (if (.context_window.used_percentage // 0) > 0 then
        ((.context_window.used_percentage / 10) | floor |
         if . > 10 then 10 elif . < 0 then 0 else . end)
       else 0 end),
      (.cost.total_cost_usd // 0),
      ((.cost.total_duration_ms // 0) / 60000 | floor),
      (if (.cost.total_duration_ms // 0) > 0 then
        ((.cost.total_api_duration_ms // 0) * 100 / (.cost.total_duration_ms) | floor)
       else "" end),
      (if .context_window.current_usage then
        ((.context_window.current_usage.cache_read_input_tokens // 0) as $read |
         ((.context_window.current_usage.cache_creation_input_tokens // 0) + $read +
          (.context_window.current_usage.input_tokens // 0)) as $total |
         if $total > 0 then ($read * 100 / $total | floor) else "" end)
       else "" end),
      (.cost.total_lines_added // 0),
      (.cost.total_lines_removed // 0),
      (.rate_limits.five_hour.used_percentage // "")
    ] | @tsv
  '
)

# --- Git branch ---
BRANCH="--"
if [ -n "$DIR" ] && [ "$DIR" != "null" ]; then
  BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "--")
  if [ "$BRANCH" = "HEAD" ]; then
    BRANCH=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo "--")
  fi
fi
# Truncate to 20 chars
[ "${#BRANCH}" -gt 20 ] && BRANCH="${BRANCH:0:17}..."

# --- Context bar (10-char: █ filled, ░ empty) ---
BARS="██████████"
SPACES="░░░░░░░░░░"
BAR_FILL=${BAR_FILL:-0}
[ "$BAR_FILL" = "null" ] && BAR_FILL=0
BAR="${BARS:0:$BAR_FILL}${SPACES:0:$((10 - BAR_FILL))}"

# Color code context bar
CTX_INT=$(printf '%.0f' "${CTX_PCT:-0}" 2>/dev/null || echo "0")
if [ "$CTX_INT" -gt 75 ] 2>/dev/null; then
  BAR="\033[31m${BAR}\033[0m"
elif [ "$CTX_INT" -gt 50 ] 2>/dev/null; then
  BAR="\033[33m${BAR}\033[0m"
else
  BAR="\033[32m${BAR}\033[0m"
fi

# --- Cost ---
COST_FMT=$(printf '$%.2f' "${COST:-0}" 2>/dev/null || echo '$0.00')

# --- Time ---
TOTAL_MIN=${TOTAL_MIN:-0}
[ "$TOTAL_MIN" = "null" ] && TOTAL_MIN=0
if [ "$TOTAL_MIN" -ge 60 ] 2>/dev/null; then
  TIME_FMT="$((TOTAL_MIN / 60))h $((TOTAL_MIN % 60))m"
else
  TIME_FMT="${TOTAL_MIN}m"
fi

# --- Cache ---
if [ -n "$CACHE_PCT" ] && [ "$CACHE_PCT" != "null" ] && [ "$CACHE_PCT" != "" ]; then
  CACHE_FMT="${CACHE_PCT}%"
else
  CACHE_FMT="--"
fi

# --- API wait ---
if [ -n "$API_PCT" ] && [ "$API_PCT" != "null" ] && [ "$API_PCT" != "" ]; then
  API_FMT="${API_PCT}%"
else
  API_FMT="--"
fi

# --- Lines changed ---
LINES_FMT="+${LINES_ADD:-0} -${LINES_DEL:-0}"

# --- Rate limit (conditional column — hidden when unavailable) ---
if [ -n "$RATE_PCT" ] && [ "$RATE_PCT" != "null" ] && [ "$RATE_PCT" != "" ]; then
  RATE_INT=$(printf '%.0f' "$RATE_PCT" 2>/dev/null || echo "0")
  if [ "$RATE_INT" -gt 75 ] 2>/dev/null; then
    RATE_FMT="\033[31m5h: ${RATE_INT}%\033[0m"
  elif [ "$RATE_INT" -gt 50 ] 2>/dev/null; then
    RATE_FMT="\033[33m5h: ${RATE_INT}%\033[0m"
  else
    RATE_FMT="\033[32m5h: ${RATE_INT}%\033[0m"
  fi
  printf '%b\n' "\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines    │ Rate\033[0m"
  printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-15s' "$BRANCH") │ ${BAR} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT") │ ${RATE_FMT}"
else
  printf '%b\n' "\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m"
  printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-15s' "$BRANCH") │ ${BAR} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT")"
fi
```

- [ ] **Step 2: Make executable**

Run: `chmod +x config/statusline.sh`

- [ ] **Step 3: Verify with full sample data**

Run:
```bash
echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":78.2,"current_usage":{"input_tokens":1200,"cache_creation_input_tokens":500,"cache_read_input_tokens":3000}},"cost":{"total_cost_usd":2.40,"total_duration_ms":2700000,"total_api_duration_ms":1620000,"total_lines_added":142,"total_lines_removed":38},"rate_limits":{"five_hour":{"used_percentage":34.0}},"workspace":{"current_dir":"'"$(pwd)"'"}}' | ./config/statusline.sh
```

Expected: Two-line output with:
- Dimmed header row
- `Opus` model, current branch, red context bar (78.2% > 75%), `$2.40`, `45m`, `63%` cache, `60%` API, `+142 -38`, green `5h: 34%`

- [ ] **Step 4: Verify empty stdin fallback**

Run: `echo "" | ./config/statusline.sh`

Expected: Fallback line with `--` values and empty `░░░░░░░░░░` bar. Exit code 0.

- [ ] **Step 5: Verify empty JSON object**

Run: `echo '{}' | ./config/statusline.sh`

Expected: All fallback values (`--` model, `--` branch, green empty bar, `$0.00`, `0m`, `--` cache, `--` API, `+0 -0`). No Rate column. No errors.

- [ ] **Step 6: Verify no rate limit hides column**

Run:
```bash
echo '{"model":{"display_name":"Sonnet"},"cost":{"total_cost_usd":0.50,"total_duration_ms":300000},"workspace":{"current_dir":"'"$(pwd)"'"}}' | ./config/statusline.sh
```

Expected: Output WITHOUT the Rate column — both header and values end at Lines.

- [ ] **Step 7: Verify low context usage shows green bar**

Run:
```bash
echo '{"context_window":{"used_percentage":25.0}}' | ./config/statusline.sh
```

Expected: Green context bar with ~2-3 filled blocks.

- [ ] **Step 8: Verify medium context usage shows yellow bar**

Run:
```bash
echo '{"context_window":{"used_percentage":62.0}}' | ./config/statusline.sh
```

Expected: Yellow context bar with ~6 filled blocks.

- [ ] **Step 9: Verify malformed JSON shows fallback**

Run: `echo 'not json at all' | ./config/statusline.sh`

Expected: Same fallback line as empty stdin. Exit code 0.

- [ ] **Step 10: Commit**

```bash
git add config/statusline.sh
git commit -m "feat: add Claude Code statusline script

Two-line output with dimmed header and color-coded values.
Single jq invocation for all field extraction.
Graceful degradation for missing data and malformed input."
```

---

### Task 2: Update config/settings.json

**Files:**
- Modify: `config/settings.json`

- [ ] **Step 1: Add statusLine block**

Add to the existing JSON in `config/settings.json`, after the last existing key:

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/statusline.sh"
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `jq . config/settings.json`

Expected: Valid JSON output with all existing keys plus the new `statusLine` block.

- [ ] **Step 3: Commit**

```bash
git add config/settings.json
git commit -m "feat: add statusLine config to settings.json"
```

---

### Task 3: Update setup.sh

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add jq dependency check**

Add after line 5 (`CLAUDE_DIR="$HOME/.claude"`), before the `MANAGED_SKILLS` line:

```bash
# Check for jq (required by statusline)
if ! command -v jq &>/dev/null; then
  echo "  ⚠ jq not found — statusline will not work. Install: brew install jq"
fi
```

- [ ] **Step 2: Add statusline script installation**

Add a new section after the settings.json block (after the `fi` on line 155), before the `# --- MCP Config ---` section:

```bash
# --- Statusline ---
echo ""
echo "Installing statusline..."
cp "$SCRIPT_DIR/config/statusline.sh" "$CLAUDE_DIR/statusline.sh"
chmod +x "$CLAUDE_DIR/statusline.sh"
echo "  statusline script installed"
```

- [ ] **Step 3: Add statusLine settings merge for existing users**

Add immediately after the statusline installation block from Step 2:

```bash
# Merge statusLine into existing settings.json if absent
if [ -f "$SETTINGS_FILE" ]; then
  if command -v jq &>/dev/null && ! jq -e '.statusLine' "$SETTINGS_FILE" &>/dev/null; then
    jq '. + {"statusLine": {"type": "command", "command": "~/.claude/statusline.sh"}}' \
      "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
      && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "  statusLine config added to existing settings.json"
  fi
fi
```

Note: Guards on `command -v jq` so the merge is skipped (not errored) if jq is missing.

- [ ] **Step 4: Verify setup.sh syntax**

Run: `bash -n setup.sh`

Expected: No output (no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add setup.sh
git commit -m "feat: add statusline installation to setup.sh

Adds jq dependency check, script copy with chmod +x,
and jq-based settings merge for existing users."
```
