#!/usr/bin/env bash
# config/lib/tests/send-gate-real-judge.test.sh — integration test against
# the real built judge CLI (no stub). Requires the built dist/cli.js and a
# scratch AW_STATE_DIR so it never touches the user's real decisions.sqlite.
#
# Re-review should-fix (2026-09-27 rereview): every message here is chosen to
# hit a wake-gate PRE-RULE for its senderKind, so this test runs fully
# offline with no model call, and asserts reason_code != "invalid-input"
# (the schema-mismatch failure mode Step 1's blocker fix targets) rather than
# asserting a specific decision that would require a real claude-cli call.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JUDGE_DIST="$DIR/../../../judge/dist/cli.js"
STATE_DIR="$(mktemp -d)"
JUDGE() { AW_STATE_DIR="$STATE_DIR" node "$JUDGE_DIST" "$@"; }

assert_pre_rule_and_valid_schema() {
  local sender_kind="$1" text="$2" out rc
  out="$(printf '%s' "$(jq -nc --arg t "$text" --arg sk "$sender_kind" '{text:$t, senderKind:$sk}')" | JUDGE wake-gate)"; rc=$?
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 for senderKind=$sender_kind (schema should accept it), got $rc: $out"; exit 1; }
  local reason; reason="$(echo "$out" | jq -r '.reason_code // empty')"
  [ "$reason" != "invalid-input" ] || { echo "FAIL: senderKind=$sender_kind was rejected by WakeGateInputSchema (invalid-input), got $out"; exit 1; }
  [ "$reason" = "pre-rule" ] || { echo "FAIL: expected this message to hit a pre-rule (offline, no model call) for senderKind=$sender_kind, got reason_code=$reason: $out"; exit 1; }
  echo "$out" | jq -e '.decision' > /dev/null || { echo "FAIL: expected a decision field, got $out"; exit 1; }
  echo "PASS: assert_pre_rule_and_valid_schema($sender_kind)"
}

test_real_judge_accepts_main() {
  # "blocked: ..." hits the URGENT_KEYWORDS pre-rule -> send, regardless of senderKind.
  assert_pre_rule_and_valid_schema "main" "blocked: need your review before I can continue"
}

test_real_judge_accepts_teammate() {
  assert_pre_rule_and_valid_schema "teammate" "blocked: need your review"
}

test_real_judge_accepts_subagent() {
  # "ok" hits the SHORT_MESSAGE_LEN pre-rule -> drop, regardless of senderKind.
  assert_pre_rule_and_valid_schema "subagent" "ok"
}

test_real_judge_accepts_main
test_real_judge_accepts_teammate
test_real_judge_accepts_subagent
echo "All send-gate-real-judge tests passed."
