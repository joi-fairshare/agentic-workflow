#!/usr/bin/env bash
# config/lib/locks.sh — canonical mkdir-based mutexes for this repo. Owned by
# Plan 6 (UI evidence); Plan 4 sources this same file rather than defining its
# own lock primitives. Two callers care about this: a box-wide lock (a shared
# resource like the local web-app stack, used by many sessions on one box) and
# a per-session heavy-job lock (a real Playwright/build/test run).

acquire_lock() {
  local lock_dir="$1" timeout_s="$2" waited=0 printed=0
  while ! mkdir "$lock_dir" 2>/dev/null; do
    if [ "$printed" -eq 0 ]; then
      echo "waiting on lock: $lock_dir" >&2
      printed=1
    fi
    [ "$waited" -ge "$timeout_s" ] && return 1
    sleep 1
    waited=$((waited + 1))
  done
  return 0
}

release_lock() {
  local lock_dir="$1"
  rmdir "$lock_dir" 2>/dev/null || true
}
