#!/usr/bin/env bash
set -euo pipefail

# Browser lockfile for /verify-app skill.
# Ensures only one Playwright browser session runs at a time.
#
# Usage:
#   source browser-lock.sh
#   acquire_browser_lock   # blocks until lock acquired or timeout
#   # ... use browser ...
#   release_browser_lock   # release when done
#
# Environment:
#   BROWSER_LOCK_TIMEOUT  — max seconds to wait (default: 120)

LOCK_FILE="$HOME/.agentic-workflow/.browser.lock"
BROWSER_LOCK_TIMEOUT="${BROWSER_LOCK_TIMEOUT:-120}"

_lock_is_stale() {
  [ ! -f "$LOCK_FILE" ] && return 0
  local pid
  pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  [ -z "$pid" ] && return 0
  # Check if PID is still running
  if kill -0 "$pid" 2>/dev/null; then
    return 1  # not stale — process is alive
  fi
  return 0  # stale — process is gone
}

acquire_browser_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"

  local elapsed=0
  local backoff=1

  while true; do
    # If no lock or stale lock, acquire it
    if _lock_is_stale; then
      echo "$$" > "$LOCK_FILE"
      echo "browser-lock: acquired (pid $$)"
      return 0
    fi

    # Check timeout
    if [ "$elapsed" -ge "$BROWSER_LOCK_TIMEOUT" ]; then
      local holder
      holder=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
      echo "browser-lock: TIMEOUT after ${elapsed}s waiting for pid $holder"
      return 1
    fi

    echo "browser-lock: waiting (held by pid $(cat "$LOCK_FILE" 2>/dev/null)), retry in ${backoff}s..."
    sleep "$backoff"
    elapsed=$((elapsed + backoff))

    # Exponential backoff: 1, 2, 4, 8, 16, 30 (cap)
    backoff=$((backoff * 2))
    [ "$backoff" -gt 30 ] && backoff=30
  done
}

release_browser_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local holder
    holder=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ "$holder" = "$$" ]; then
      rm -f "$LOCK_FILE"
      echo "browser-lock: released (pid $$)"
    else
      echo "browser-lock: not releasing — held by pid $holder, we are pid $$"
    fi
  fi
}
