#!/usr/bin/env bash

# Claude Code statusline — reads session JSON from stdin
# Two-line output: dimmed header row + color-coded values
# Spec: docs/superpowers/specs/2026-03-21-statusline-config-design.md
#
# Adapts to terminal width — drops lower-priority columns as space shrinks:
#   ≥95 cols: full   (branch×15, bar×10, cost, time, cache, api, lines, rate)
#   ≥80 cols: medium (branch×12, bar×10, cost, time, cache, api, lines — no rate)
#   ≥65 cols: narrow (branch×12, bar×5,  cost, time, api, lines — no cache/rate)
#    <65 cols: compact(branch×10, bar×5,  cost, time, lines — no cache/api/rate)

INPUT=$(cat)
COLS=$(tput cols 2>/dev/null || echo 200)

# Fallback for empty or invalid input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  if [ "$COLS" -ge 95 ] 2>/dev/null; then
    printf '%b\n' '\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m'
    printf '%b\n' '--      │ --              │ ░░░░░░░░░░ │ --     │ --    │ --    │ --   │ --'
  elif [ "$COLS" -ge 80 ] 2>/dev/null; then
    printf '%b\n' '\033[2mModel   │ Branch       │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m'
    printf '%b\n' '--      │ --           │ ░░░░░░░░░░ │ --     │ --    │ --    │ --   │ --'
  elif [ "$COLS" -ge 65 ] 2>/dev/null; then
    printf '%b\n' '\033[2mModel   │ Branch       │ Ctx   │ Cost   │ Time  │ API  │ Lines\033[0m'
    printf '%b\n' '--      │ --           │ ░░░░░ │ --     │ --    │ --   │ --'
  else
    printf '%b\n' '\033[2mModel   │ Branch     │ Ctx   │ Cost   │ Time  │ Lines\033[0m'
    printf '%b\n' '--      │ --         │ ░░░░░ │ --     │ --    │ --'
  fi
  exit 0
fi

# Single jq call — extract all fields at once via eval-safe shell assignments.
# Computes: bar fill counts (10-char and 5-char), time in minutes, cache %, API %.
# Why eval/@sh instead of @tsv/IFS: bash 3.2 on macOS (the system shell) does not preserve
# non-whitespace IFS characters in herestrings, causing @tsv tab-split to silently fail.
# Safety: every field is piped through @sh before reaching eval, which POSIX-quotes the
# value. String fields (MODEL, DIR) use @sh directly. Numeric fields use
# | tostring | @sh so that unexpected strings in the JSON cannot inject shell code.
eval "$(echo "$INPUT" | jq -r '
  "MODEL=\(.model.display_name // "--" | @sh)",
  "DIR=\(.workspace.current_dir // "" | @sh)",
  "CTX_PCT=\(.context_window.used_percentage // "" | tostring | @sh)",
  "BAR_FILL=\(if (.context_window.used_percentage // 0) > 0 then
      ((.context_window.used_percentage / 10) | round |
       if . > 10 then 10 elif . < 0 then 0 else . end)
     else 0 end | tostring | @sh)",
  "BAR_FILL5=\(if (.context_window.used_percentage // 0) > 0 then
      ((.context_window.used_percentage / 20) | round |
       if . > 5 then 5 elif . < 0 then 0 else . end)
     else 0 end | tostring | @sh)",
  "COST=\(.cost.total_cost_usd // 0 | tostring | @sh)",
  "TOTAL_MIN=\((.cost.total_duration_ms // 0) / 60000 | floor | tostring | @sh)",
  "API_PCT=\(if (.cost.total_duration_ms // 0) > 0 and (.cost.total_api_duration_ms != null) then
      (.cost.total_api_duration_ms * 100 / .cost.total_duration_ms | floor | tostring)
     else "" end | @sh)",
  "CACHE_PCT=\(if .context_window.current_usage then
      ((.context_window.current_usage.cache_read_input_tokens // 0) as $read |
       ((.context_window.current_usage.cache_creation_input_tokens // 0) + $read +
        (.context_window.current_usage.input_tokens // 0)) as $total |
       if $total > 0 then ($read * 100 / $total | floor | tostring) else "" end)
     else "" end | @sh)",
  "LINES_ADD=\(.cost.total_lines_added // 0 | tostring | @sh)",
  "LINES_DEL=\(.cost.total_lines_removed // 0 | tostring | @sh)",
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
# Width-specific truncations
BRANCH15="$BRANCH"
[ "${#BRANCH}" -gt 15 ] && BRANCH15="${BRANCH:0:12}..."
BRANCH12="$BRANCH"
[ "${#BRANCH}" -gt 12 ] && BRANCH12="${BRANCH:0:9}..."
BRANCH10="$BRANCH"
[ "${#BRANCH}" -gt 10 ] && BRANCH10="${BRANCH:0:7}..."

# --- Context bars ---
BARS="██████████"
SPACES="░░░░░░░░░░"
BAR_FILL=${BAR_FILL:-0}
[ "$BAR_FILL" = "null" ] && BAR_FILL=0
BAR_FILL5=${BAR_FILL5:-0}
[ "$BAR_FILL5" = "null" ] && BAR_FILL5=0

CTX_INT=$(printf '%.0f' "${CTX_PCT:-0}" 2>/dev/null || echo "0")
if [ "$CTX_INT" -gt 75 ] 2>/dev/null; then
  CTX_COLOR='\033[31m'
elif [ "$CTX_INT" -ge 50 ] 2>/dev/null; then
  CTX_COLOR='\033[33m'
else
  CTX_COLOR='\033[32m'
fi
BAR="${CTX_COLOR}${BARS:0:$BAR_FILL}${SPACES:0:$((10 - BAR_FILL))}\033[0m"
BAR5="${CTX_COLOR}${BARS:0:$BAR_FILL5}${SPACES:0:$((5 - BAR_FILL5))}\033[0m"

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

# --- Rate limit ---
RATE_FMT=""
if [ -n "$RATE_PCT" ] && [ "$RATE_PCT" != "null" ] && [ "$RATE_PCT" != "" ]; then
  RATE_INT=$(printf '%.0f' "$RATE_PCT" 2>/dev/null || echo "0")
  if [ "$RATE_INT" -gt 75 ] 2>/dev/null; then
    RATE_FMT="\033[31m5h: ${RATE_INT}%\033[0m"
  elif [ "$RATE_INT" -ge 50 ] 2>/dev/null; then
    RATE_FMT="\033[33m5h: ${RATE_INT}%\033[0m"
  else
    RATE_FMT="\033[32m5h: ${RATE_INT}%\033[0m"
  fi
fi

# --- Adaptive output ---
if [ "$COLS" -ge 95 ] 2>/dev/null; then
  # FULL: all columns, branch=15, bar=10, rate if available (~81 cols / ~92 with rate)
  if [ -n "$RATE_FMT" ]; then
    printf '%b\n' "\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines    │ Rate\033[0m"
    printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-15s' "$BRANCH15") │ ${BAR} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT") │ ${RATE_FMT}"
  else
    printf '%b\n' "\033[2mModel   │ Branch          │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m"
    printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-15s' "$BRANCH15") │ ${BAR} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT")"
  fi
elif [ "$COLS" -ge 80 ] 2>/dev/null; then
  # MEDIUM: branch=12, bar=10, no rate (~78 cols)
  printf '%b\n' "\033[2mModel   │ Branch       │ Context    │ Cost   │ Time  │ Cache │ API  │ Lines\033[0m"
  printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ ${BAR} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT")"
elif [ "$COLS" -ge 65 ] 2>/dev/null; then
  # NARROW: branch=12, bar=5, no cache, no rate (~65 cols)
  printf '%b\n' "\033[2mModel   │ Branch       │ Ctx   │ Cost   │ Time  │ API  │ Lines\033[0m"
  printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ ${BAR5} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-8s' "$LINES_FMT")"
else
  # COMPACT: branch=10, bar=5, no cache, no api, no rate (~56 cols)
  printf '%b\n' "\033[2mModel   │ Branch     │ Ctx   │ Cost   │ Time  │ Lines\033[0m"
  printf '%b\n' "$(printf '%-7s' "$MODEL") │ $(printf '%-10s' "$BRANCH10") │ ${BAR5} │ $(printf '%-6s' "$COST_FMT") │ $(printf '%-5s' "$TIME_FMT") │ $(printf '%-8s' "$LINES_FMT")"
fi
