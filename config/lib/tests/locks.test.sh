#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/../locks.sh"

test_acquire_then_release_allows_a_second_acquire() {
  local lock; lock="$(mktemp -d)/lock"
  acquire_lock "$lock" 2 || { echo "FAIL: first acquire failed"; exit 1; }
  release_lock "$lock"
  acquire_lock "$lock" 2 || { echo "FAIL: second acquire failed after release"; exit 1; }
  release_lock "$lock"
  echo "PASS: test_acquire_then_release_allows_a_second_acquire"
}

test_acquire_times_out_when_held() {
  local lock; lock="$(mktemp -d)/lock"
  mkdir "$lock"
  if acquire_lock "$lock" 1; then
    echo "FAIL: expected timeout, but acquire succeeded"; rmdir "$lock"; exit 1
  fi
  rmdir "$lock"
  echo "PASS: test_acquire_times_out_when_held"
}

test_release_on_an_already_gone_lock_is_a_no_op() {
  local lock; lock="$(mktemp -d)/lock-never-created"
  release_lock "$lock" || { echo "FAIL: release must tolerate a missing lock dir"; exit 1; }
  echo "PASS: test_release_on_an_already_gone_lock_is_a_no_op"
}

test_acquire_prints_waiting_message_once_not_per_poll() {
  local lock; lock="$(mktemp -d)/lock"
  mkdir "$lock"
  local out
  out="$(acquire_lock "$lock" 2 2>&1 1>/dev/null || true)"
  rmdir "$lock"
  local count
  count="$(echo "$out" | grep -c "waiting on lock" || true)"
  [ "$count" -eq 1 ] || { echo "FAIL: expected exactly one waiting message, got $count"; exit 1; }
  echo "PASS: test_acquire_prints_waiting_message_once_not_per_poll"
}

test_acquire_then_release_allows_a_second_acquire
test_acquire_times_out_when_held
test_release_on_an_already_gone_lock_is_a_no_op
test_acquire_prints_waiting_message_once_not_per_poll
echo "All locks tests passed."
