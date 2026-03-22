#!/usr/bin/env bash

# Claude Code statusline — reads session JSON from stdin
# Two-line output: dimmed header row + color-coded values
# Spec: docs/superpowers/specs/2026-03-21-statusline-config-design.md

INPUT=$(cat)

# Fallback for empty or invalid input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  printf '%b\n' '\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines    │ Rate\033[0m'
  printf '%b\n' '--      │ --              │ ░░░░░░░░░░ │ --     │ --    │ --    │ --   │ --       │ --'
  exit 0
fi

# Single jq call — extract all fields at once via eval-safe shell assignments
# Computes: bar fill count, time in minutes, cache %, API % — avoids extra subprocesses
# @sh quoting handles model names/paths with spaces; eval avoids bash 3.2 IFS/herestring issues
eval "$(echo "$INPUT" | jq -r '
  "MODEL=\(.model.display_name // "--" | @sh)",
  "DIR=\(.workspace.current_dir // "" | @sh)",
  "CTX_PCT=\(.context_window.used_percentage // "")",
  "BAR_FILL=\(if (.context_window.used_percentage // 0) > 0 then
      ((.context_window.used_percentage / 10) | round |
       if . > 10 then 10 elif . < 0 then 0 else . end)
     else 0 end)",
  "COST=\(.cost.total_cost_usd // 0)",
  "TOTAL_MIN=\((.cost.total_duration_ms // 0) / 60000 | floor)",
  "API_PCT=\(if (.cost.total_duration_ms // 0) > 0 then
      ((.cost.total_api_duration_ms // 0) * 100 / (.cost.total_duration_ms) | floor | tostring)
     else "" end | @sh)",
  "CACHE_PCT=\(if .context_window.current_usage then
      ((.context_window.current_usage.cache_read_input_tokens // 0) as $read |
       ((.context_window.current_usage.cache_creation_input_tokens // 0) + $read +
        (.context_window.current_usage.input_tokens // 0)) as $total |
       if $total > 0 then ($read * 100 / $total | floor | tostring) else "" end)
     else "" end | @sh)",
  "LINES_ADD=\(.cost.total_lines_added // 0)",
  "LINES_DEL=\(.cost.total_lines_removed // 0)",
  "RATE_PCT=\(.rate_limits.five_hour.used_percentage // "" | tostring | @sh)"
')"

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
elif [ "$CTX_INT" -ge 50 ] 2>/dev/null; then
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
  elif [ "$RATE_INT" -ge 50 ] 2>/dev/null; then
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
