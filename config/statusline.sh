#!/usr/bin/env bash

# Claude Code statusline — reads session JSON from stdin
# Two-line output: dimmed header row + color-coded values
# Spec: docs/superpowers/specs/2026-03-21-statusline-config-design.md
#
# Column priority (left → right, leftmost always survive tier drops):
#   5h Usage | 7d Usage | Context | Model | Branch | Cost | Time | Cache | API | Lines
#
# Width detection: ~/.claude/terminal_width (shell-integration.sh) → stty /dev/tty → $COLUMNS → 200
# Tiers (total visible chars, approx):
#   ≥116: FULL      — all columns, branch×15, full ctx bar
#   ≥101: MEDIUM    — no Lines, branch×12, full ctx bar
#   ≥78:  NARROW    — no Lines/Cache/API, 7d % only (no reset), narrow ctx, branch×12
#   ≥65:  COMPACT   — 5h % only (no reset), narrow ctx, model, branch×10, cost, time (64 chars)
#   <65:  COMPACT-S — same as COMPACT but drops Time column (54 chars)

INPUT=$(cat)

# Brief pause so the shell's WINCH trap has time to write terminal_width before
# we read it. Claude Code re-renders the statusline immediately on SIGWINCH;
# without this sleep the file may still hold the pre-resize value.
sleep 0.05

# Width detection: read ~/.claude/terminal_width (written by shell-integration.sh
# on every prompt and on SIGWINCH resize). This is the only reliable source because
# Claude Code runs the statusline in a subprocess where /dev/tty is inaccessible,
# $COLUMNS is 0, and tput cols returns the internal PTY default (80), not the
# actual window width. The interactive shell always has the correct $COLUMNS.
COLS=$(cat "$HOME/.claude/terminal_width" 2>/dev/null)
# Fallbacks for first run before shell integration is active
if [ -z "$COLS" ] || ! [ "$COLS" -gt 0 ] 2>/dev/null; then
  TERM_SIZE=$(stty size </dev/tty 2>/dev/null)
  [ -n "$TERM_SIZE" ] && COLS=$(echo "$TERM_SIZE" | awk '{print $2}')
fi
if [ -z "$COLS" ] || ! [ "$COLS" -gt 0 ] 2>/dev/null; then
  COLS=${COLUMNS:-}
fi
: "${COLS:=200}"

# Fallback for empty or invalid input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  if [ "$COLS" -ge 116 ] 2>/dev/null; then
    printf '%b\n' '\033[2m5h Usage  │ 7d Usage  │ Context         │ Model      │ Branch          │ Cost    │ Time    │ Cache │ API  │ Lines    \033[0m'
    printf '%b\n' '--        │ --        │ ░░░░░░░░░░ --   │ --         │ --              │ --      │ --      │ --    │ --   │ --       '
  elif [ "$COLS" -ge 101 ] 2>/dev/null; then
    printf '%b\n' '\033[2m5h Usage  │ 7d Usage  │ Context         │ Model      │ Branch       │ Cost    │ Time    │ Cache │ API  \033[0m'
    printf '%b\n' '--        │ --        │ ░░░░░░░░░░ --   │ --         │ --           │ --      │ --      │ --    │ --   '
  elif [ "$COLS" -ge 78 ] 2>/dev/null; then
    printf '%b\n' '\033[2m5h Usage  │ 7d    │ Context    │ Model      │ Branch       │ Cost    │ Time    \033[0m'
    printf '%b\n' '--        │ --    │ ░░░░░ --   │ --         │ --           │ --      │ --      '
  else
    printf '%b\n' '\033[2m5h    │ Context    │ Model      │ Branch     │ Cost    │ Time    \033[0m'
    printf '%b\n' '--    │ ░░░░░ --   │ --         │ --         │ --      │ --      '
  fi
  exit 0
fi

# Single jq call — extract all fields at once via eval-safe shell assignments.
# Why eval/@sh instead of @tsv/IFS: bash 3.2 on macOS does not preserve
# non-whitespace IFS characters in herestrings, causing @tsv tab-split to fail.
# Safety: every field is piped through @sh before reaching eval.
eval "$(echo "$INPUT" | jq -r '
  "MODEL=\(.model.display_name // "--" | ltrimstr("Claude ") | .[0:10] | @sh)",
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
  "RATE5H_PCT=\(.rate_limits.five_hour.used_percentage // "" | tostring | @sh)",
  "RATE5H_RESET=\(.rate_limits.five_hour.resets_at // "" | if type == "number" then floor | tostring else . end | @sh)",
  "RATE7D_PCT=\(.rate_limits.seven_day.used_percentage // "" | tostring | @sh)",
  "RATE7D_RESET=\(.rate_limits.seven_day.resets_at // "" | if type == "number" then floor | tostring else . end | @sh)"
')"

# --- Git branch ---
BRANCH="--"
if [ -n "$DIR" ] && [ "$DIR" != "null" ]; then
  BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "--")
  if [ "$BRANCH" = "HEAD" ]; then
    BRANCH=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo "--")
  fi
fi
BRANCH15="$BRANCH"; [ "${#BRANCH}" -gt 15 ] && BRANCH15="${BRANCH:0:12}..."
BRANCH12="$BRANCH"; [ "${#BRANCH}" -gt 12 ] && BRANCH12="${BRANCH:0:9}..."
BRANCH10="$BRANCH"; [ "${#BRANCH}" -gt 10 ] && BRANCH10="${BRANCH:0:7}..."

# --- Context bar and color ---
BARS="██████████"
SPACES="░░░░░░░░░░"
BAR_FILL=${BAR_FILL:-0}; [ "$BAR_FILL" = "null" ] && BAR_FILL=0
BAR_FILL5=${BAR_FILL5:-0}; [ "$BAR_FILL5" = "null" ] && BAR_FILL5=0

CTX_INT=$(printf '%.0f' "${CTX_PCT:-0}" 2>/dev/null || echo "0")
if [ "$CTX_INT" -gt 75 ] 2>/dev/null; then CTX_COLOR='\033[31m'
elif [ "$CTX_INT" -ge 50 ] 2>/dev/null; then CTX_COLOR='\033[33m'
else CTX_COLOR='\033[32m'
fi

# Context column: colored bar + space + right-padded percentage
# %-4s pads "0%" → "0%  ", "76%" → "76% ", "100%" → "100%" — fixed column width
CTX_PCT_FMT=$(printf '%-4s' "${CTX_INT}%")
# Full (bar=10): 10 + 1 + 4 = 15 visible chars
CTX_FULL="${CTX_COLOR}${BARS:0:$BAR_FILL}${SPACES:0:$((10 - BAR_FILL))}\033[0m ${CTX_PCT_FMT}"
# Narrow (bar=5): 5 + 1 + 4 = 10 visible chars
CTX_NARROW="${CTX_COLOR}${BARS:0:$BAR_FILL5}${SPACES:0:$((5 - BAR_FILL5))}\033[0m ${CTX_PCT_FMT}"

# --- Cost ---
COST_FMT=$(printf '$%.2f' "${COST:-0}" 2>/dev/null || echo '$0.00')

# --- Time ---
TOTAL_MIN=${TOTAL_MIN:-0}; [ "$TOTAL_MIN" = "null" ] && TOTAL_MIN=0
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

# --- Usage color helper ---
# Args: $1 = integer percentage
usage_color() {
  if [ "$1" -gt 75 ] 2>/dev/null; then printf '\033[31m'
  elif [ "$1" -ge 50 ] 2>/dev/null; then printf '\033[33m'
  else printf '\033[32m'
  fi
}

# --- 5-hour rate limit ---
# Format: "87% 4pm" (percent + space + reset time — space avoids double-wide Unicode)
# Width 9 (full with reset) or 5 (compact, percent only)
HAS_RATE=false
USAGE5H=""       # 9-char colored field for FULL/MEDIUM/NARROW tiers
USAGE5H_SHORT="" # 5-char colored field for COMPACT tier (no reset time)

if [ -n "$RATE5H_PCT" ] && [ "$RATE5H_PCT" != "null" ] && [ "$RATE5H_PCT" != "" ]; then
  HAS_RATE=true
  PCT5H=$(printf '%.0f' "$RATE5H_PCT" 2>/dev/null || echo "0")
  COLOR5H=$(usage_color "$PCT5H")

  # Format reset time as 12-hour clock: "4pm", "12am", etc.
  RESET5H=""
  if [ -n "$RATE5H_RESET" ] && [ "$RATE5H_RESET" != "null" ] && [ "$RATE5H_RESET" != "" ]; then
    RESET5H=$(date -r "$RATE5H_RESET" "+%I%p" 2>/dev/null | sed 's/^0//' | tr '[:upper:]' '[:lower:]' || \
              date -d "@$RATE5H_RESET" "+%I%p" 2>/dev/null | sed 's/^0//' | tr '[:upper:]' '[:lower:]')
  fi

  if [ -n "$RESET5H" ]; then
    TEXT5H="${PCT5H}% ${RESET5H}"   # e.g. "87% 4pm" — space avoids double-wide Unicode char
  else
    TEXT5H="${PCT5H}%"
  fi
  USAGE5H="${COLOR5H}$(printf '%-9s' "$TEXT5H")\033[0m"
  USAGE5H_SHORT="${COLOR5H}$(printf '%-5s' "${PCT5H}%")\033[0m"
fi

# --- 7-day rate limit ---
# Format: "65% Fri" (percent + space + day-of-week — space avoids double-wide Unicode)
# Width 9 (full with reset) or 5 (narrow, percent only)
USAGE7D=""       # 9-char colored field for FULL/MEDIUM tiers
USAGE7D_SHORT="" # 5-char colored field for NARROW tier (no reset day)

if [ -n "$RATE7D_PCT" ] && [ "$RATE7D_PCT" != "null" ] && [ "$RATE7D_PCT" != "" ]; then
  PCT7D=$(printf '%.0f' "$RATE7D_PCT" 2>/dev/null || echo "0")
  COLOR7D=$(usage_color "$PCT7D")

  # Format reset as day-of-week: "Fri", "Mon", etc.
  RESET7D=""
  if [ -n "$RATE7D_RESET" ] && [ "$RATE7D_RESET" != "null" ] && [ "$RATE7D_RESET" != "" ]; then
    RESET7D=$(date -r "$RATE7D_RESET" "+%a" 2>/dev/null || date -d "@$RATE7D_RESET" "+%a" 2>/dev/null)
  fi

  if [ -n "$RESET7D" ]; then
    TEXT7D="${PCT7D}% ${RESET7D}"   # e.g. "65% Fri" — space avoids double-wide Unicode char
  else
    TEXT7D="${PCT7D}%"
  fi
  USAGE7D="${COLOR7D}$(printf '%-9s' "$TEXT7D")\033[0m"
  USAGE7D_SHORT="${COLOR7D}$(printf '%-5s' "${PCT7D}%")\033[0m"
fi

# --- Adaptive output ---
# When rate limits are absent (API-key sessions), usage columns are hidden.
# Header strings are manually padded to match printf field widths in value rows.
#
# Tier visible widths (content + separators):
#   FULL:    9+9+15+10+15+7+7+5+4+9 = 90 content + 9×3 sep = 117
#   MEDIUM:  9+9+15+10+12+7+7+5+4   = 78 content + 8×3 sep = 102
#   NARROW:  9+5+10+10+12+7+7       = 60 content + 6×3 sep = 78
#   COMPACT: 5+10+10+10+7+7         = 49 content + 5×3 sep = 64

if [ "$COLS" -ge 116 ] 2>/dev/null; then
  # FULL: all columns, branch×15, full ctx bar
  if $HAS_RATE; then
    printf '%b\n' "\033[2m5h Usage  │ 7d Usage  │ Context         │ Model      │ Branch          │ Cost    │ Time    │ Cache │ API  │ Lines    \033[0m"
    printf '%b\n' "${USAGE5H} │ ${USAGE7D} │ ${CTX_FULL} │ $(printf '%-10s' "$MODEL") │ $(printf '%-15s' "$BRANCH15") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-9s' "$LINES_FMT")"
  else
    printf '%b\n' "\033[2mContext         │ Model      │ Branch          │ Cost    │ Time    │ Cache │ API  │ Lines    \033[0m"
    printf '%b\n' "${CTX_FULL} │ $(printf '%-10s' "$MODEL") │ $(printf '%-15s' "$BRANCH15") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT") │ $(printf '%-9s' "$LINES_FMT")"
  fi
elif [ "$COLS" -ge 101 ] 2>/dev/null; then
  # MEDIUM: no Lines, branch×12, full ctx bar
  if $HAS_RATE; then
    printf '%b\n' "\033[2m5h Usage  │ 7d Usage  │ Context         │ Model      │ Branch       │ Cost    │ Time    │ Cache │ API  \033[0m"
    printf '%b\n' "${USAGE5H} │ ${USAGE7D} │ ${CTX_FULL} │ $(printf '%-10s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT")"
  else
    printf '%b\n' "\033[2mContext         │ Model      │ Branch       │ Cost    │ Time    │ Cache │ API  \033[0m"
    printf '%b\n' "${CTX_FULL} │ $(printf '%-10s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT") │ $(printf '%-5s' "$CACHE_FMT") │ $(printf '%-4s' "$API_FMT")"
  fi
elif [ "$COLS" -ge 78 ] 2>/dev/null; then
  # NARROW: no Lines/Cache/API, 7d % only (no reset day), narrow ctx bar, branch×12
  if $HAS_RATE; then
    printf '%b\n' "\033[2m5h Usage  │ 7d    │ Context    │ Model      │ Branch       │ Cost    │ Time    \033[0m"
    printf '%b\n' "${USAGE5H} │ ${USAGE7D_SHORT} │ ${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT")"
  else
    printf '%b\n' "\033[2mContext    │ Model      │ Branch       │ Cost    │ Time    \033[0m"
    printf '%b\n' "${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-12s' "$BRANCH12") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT")"
  fi
else
  # COMPACT: 5h % only (no reset), narrow ctx, model, branch×10, cost, time
  #   Full COMPACT:  5+10+10+10+7+7 = 49 content + 5×3 sep = 64 chars
  #   No-Time COMPACT: drop Time when cols < 65 → 54 chars fits ≥54 col terminals
  if [ "$COLS" -ge 65 ] 2>/dev/null; then
    if $HAS_RATE; then
      printf '%b\n' "\033[2m5h    │ Context    │ Model      │ Branch     │ Cost    │ Time    \033[0m"
      printf '%b\n' "${USAGE5H_SHORT} │ ${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-10s' "$BRANCH10") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT")"
    else
      printf '%b\n' "\033[2mContext    │ Model      │ Branch     │ Cost    │ Time    \033[0m"
      printf '%b\n' "${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-10s' "$BRANCH10") │ $(printf '%-7s' "$COST_FMT") │ $(printf '%-7s' "$TIME_FMT")"
    fi
  else
    if $HAS_RATE; then
      printf '%b\n' "\033[2m5h    │ Context    │ Model      │ Branch     │ Cost    \033[0m"
      printf '%b\n' "${USAGE5H_SHORT} │ ${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-10s' "$BRANCH10") │ $(printf '%-7s' "$COST_FMT")"
    else
      printf '%b\n' "\033[2mContext    │ Model      │ Branch     │ Cost    \033[0m"
      printf '%b\n' "${CTX_NARROW} │ $(printf '%-10s' "$MODEL") │ $(printf '%-10s' "$BRANCH10") │ $(printf '%-7s' "$COST_FMT")"
    fi
  fi
fi
