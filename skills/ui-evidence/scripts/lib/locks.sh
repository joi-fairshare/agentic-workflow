#!/usr/bin/env bash
# skills/ui-evidence/scripts/lib/locks.sh — sources the repo's canonical
# mkdir-based mutex primitives (config/lib/locks.sh, owned by this plan) and
# adds only the ui-evidence-specific composite: both the box-wide stack lock
# and this session's own heavy-job lock, taken together and released even on
# failure (Global Constraints — a real Playwright run is a heavy job, and
# :3000/:5002/Postgres/Redis are shared by every session on the box).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/../../../../config/lib/locks.sh"

with_stack_lock_and_heavy_job_lock() {
  local timeout_s="$1"; shift
  local stack_lock="${AW_QA_STACK_LOCK:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/locks/qa-stack.lock}"
  local heavy_lock="${AW_HEAVY_JOB_LOCK:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/locks/heavy-job.lock}"
  mkdir -p "$(dirname "$stack_lock")" "$(dirname "$heavy_lock")"

  # Wider lock first (box-wide stack lock), then the session-scoped one, to
  # avoid a box-wide/session-wide deadlock ordering inversion.
  acquire_lock "$stack_lock" "$timeout_s" || { echo "could not acquire qa-stack.lock within ${timeout_s}s" >&2; return 1; }
  if ! acquire_lock "$heavy_lock" "$timeout_s"; then
    release_lock "$stack_lock"
    echo "could not acquire heavy-job.lock within ${timeout_s}s" >&2
    return 1
  fi

  # Both locks are freed no matter how the command exits (crash, timeout, or
  # normal failure) — Global Constraints requires this.
  local rc=0
  trap 'release_lock "'"$heavy_lock"'"; release_lock "'"$stack_lock"'"' RETURN
  "$@" || rc=$?
  return $rc
}
