#!/usr/bin/env bash
set -euo pipefail

# Generic skill lockfile — prevents concurrent skill sessions for a given resource.
#
# Usage:
#   LOCK_NAME=browser  source skill-lock.sh   # for browser/Playwright sessions
#   LOCK_NAME=ios-sim  source skill-lock.sh   # for iOS simulator sessions
#   acquire_lock    # blocks until lock acquired or timeout
#   # ... use resource ...
#   release_lock    # release when done
#
# Environment:
#   LOCK_NAME             — lock identifier written into the lock file path (default: "skill")
#   SKILL_LOCK_TIMEOUT    — max seconds to wait (default: 120)

LOCK_NAME="${LOCK_NAME:-skill}"

# sec-2: Validate LOCK_NAME to prevent path traversal and shell metacharacter injection.
# Only alphanumeric characters, hyphens, and underscores are allowed.
if ! [[ "$LOCK_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "skill-lock: invalid LOCK_NAME '$LOCK_NAME' — must match ^[a-zA-Z0-9_-]+$" >&2
  return 1 2>/dev/null || exit 1
fi

LOCK_FILE="$HOME/.agentic-workflow/.${LOCK_NAME}.lock"
SKILL_LOCK_TIMEOUT="${SKILL_LOCK_TIMEOUT:-120}"

_lock_is_stale() {
  [ ! -f "$LOCK_FILE" ] && return 0
  local pid
  pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  [ -z "$pid" ] && return 0
  # Check if PID is still running.
  # Known limitation (sec-4): kill -0 checks process existence, but PIDs can be
  # reused by the OS after a process exits. In theory, a new unrelated process
  # could have the same PID, causing us to treat a stale lock as still held.
  # In practice, PID reuse is rare enough on modern systems (PID space is large
  # and wraps infrequently) that this is acceptable for skill-level locking.
  if kill -0 "$pid" 2>/dev/null; then
    return 1  # not stale — process is alive
  fi
  return 0  # stale — process is gone
}

acquire_lock() {
  # sec-5: Explicitly check that lock directory creation succeeds.
  # When sourced, mkdir failure could be silently ignored without this guard.
  mkdir -p "$(dirname "$LOCK_FILE")" || {
    echo "skill-lock[$LOCK_NAME]: failed to create lock directory $(dirname "$LOCK_FILE")" >&2
    return 1
  }

  local elapsed=0
  local backoff=1

  while true; do
    # sec-1: Attempt atomic O_EXCL write via noclobber — avoids TOCTOU race
    # where two processes could both see a stale lock and both write their PID.
    # The subshell ensures noclobber is scoped and does not leak into the caller.
    if ( set -o noclobber; echo "$$" > "$LOCK_FILE" ) 2>/dev/null; then
      echo "skill-lock[$LOCK_NAME]: acquired (pid $$)"
      return 0
    fi

    # File exists — check if the holder is still alive
    if _lock_is_stale; then
      # Stale lock: remove and retry immediately (loop will re-attempt atomic write)
      rm -f "$LOCK_FILE"
      continue
    fi

    # Check timeout
    if [ "$elapsed" -ge "$SKILL_LOCK_TIMEOUT" ]; then
      local holder
      holder=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
      echo "skill-lock[$LOCK_NAME]: TIMEOUT after ${elapsed}s waiting for pid $holder"
      return 1
    fi

    echo "skill-lock[$LOCK_NAME]: waiting (held by pid $(cat "$LOCK_FILE" 2>/dev/null)), retry in ${backoff}s..."
    sleep "$backoff"
    elapsed=$((elapsed + backoff))

    # Exponential backoff: 1, 2, 4, 8, 16, 30 (cap)
    backoff=$((backoff * 2))
    [ "$backoff" -gt 30 ] && backoff=30
  done
}

release_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local holder
    holder=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ "$holder" = "$$" ]; then
      rm -f "$LOCK_FILE"
      echo "skill-lock[$LOCK_NAME]: released (pid $$)"
    else
      echo "skill-lock[$LOCK_NAME]: not releasing — held by pid $holder, we are pid $$"
    fi
  fi
}
