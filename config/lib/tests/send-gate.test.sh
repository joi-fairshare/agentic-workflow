#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$DIR/../../hooks/send-gate.sh"

setup_fake_judge() {
  local bin_dir decision; bin_dir="$(mktemp -d)"; decision="$1"
  cat > "$bin_dir/judge" <<EOF
#!/usr/bin/env bash
echo '{"decision":"$decision","confidence":0.9,"model":"claude-cli","reason_code":"model","id":"fixed-id"}'
EOF
  chmod +x "$bin_dir/judge"
  echo "$bin_dir"
}

run_hook() {
  local input="$1" bin_dir="$2" outbox_dir="$3"
  PATH="$bin_dir:$PATH" AW_OUTBOX_DIR="$outbox_dir" bash "$HOOK" <<< "$input"
}

test_send_is_allowed_unmodified() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge send)"; outbox="$(mktemp -d)"
  out="$(run_hook '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"done: PR #100 merged"}}' "$bin_dir" "$outbox")"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null || { echo "FAIL: expected allow, got $out"; exit 1; }
  echo "PASS: test_send_is_allowed_unmodified"
}

test_drop_denies_with_no_ack_reason() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge drop)"; outbox="$(mktemp -d)"
  out="$(run_hook '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"ok"}}' "$bin_dir" "$outbox")"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null || { echo "FAIL: expected deny for drop, got $out"; exit 1; }
  echo "PASS: test_drop_denies_with_no_ack_reason"
}

test_batch_denies_and_queues_tagged_by_agent_type() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge batch)"; outbox="$(mktemp -d)"
  out="$(run_hook '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"still working on task 2"}}' "$bin_dir" "$outbox")"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null || { echo "FAIL: expected deny for batch, got $out"; exit 1; }
  [ -f "$outbox/s1.jsonl" ] || { echo "FAIL: expected an outbox file for session s1"; exit 1; }
  grep -q '"agentType":"builder-a"' "$outbox/s1.jsonl" || { echo "FAIL: queued item must be tagged by sender agent_type"; exit 1; }
  echo "PASS: test_batch_denies_and_queues_tagged_by_agent_type"
}

test_batch_from_main_session_queues_with_null_agent_type() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge batch)"; outbox="$(mktemp -d)"
  out="$(run_hook '{"session_id":"s1","tool_input":{"to":"main","message":"progress"}}' "$bin_dir" "$outbox")"
  grep -q '"agentType":null' "$outbox/s1.jsonl" || { echo "FAIL: expected a null agentType for a main-session sender"; exit 1; }
  echo "PASS: test_batch_from_main_session_queues_with_null_agent_type"
}

test_a_judge_failure_fails_open_to_allow_rf1() {
  local bin_dir out outbox; bin_dir="$(mktemp -d)"; outbox="$(mktemp -d)"
  cat > "$bin_dir/judge" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$bin_dir/judge"
  out="$(run_hook '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"x"}}' "$bin_dir" "$outbox")"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null || { echo "FAIL: expected fail-open allow when judge fails (RF-1), got $out"; exit 1; }
  echo "PASS: test_a_judge_failure_fails_open_to_allow_rf1"
}

test_send_with_a_pending_digest_rewrites_updated_input_and_clears_the_queue() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge send)"; outbox="$(mktemp -d)"
  # deviation from plan draft (2026-09-27, this build): the plan's literal
  # fixture timestamp "2026-09-27T00:00:00Z" is more than 2h before this
  # machine's real wall clock on the same date, so it fails the send-gate's
  # own expiry filter and this test spuriously fails. Use "now" instead so the
  # item is always fresh regardless of when this test runs.
  jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{ts:$ts, agentType:"builder-a", text:"still on task 2"}' > "$outbox/s1.jsonl"
  out="$(run_hook '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"done: task 3 too"}}' "$bin_dir" "$outbox")"
  echo "$out" | jq -e '.hookSpecificOutput.updatedInput.message | contains("still on task 2")' > /dev/null \
    || { echo "FAIL: expected the queued digest to ride along in updatedInput.message, got $out"; exit 1; }
  [ -s "$outbox/s1.jsonl" ] && { echo "FAIL: expected the outbox to be cleared after riding along"; exit 1; }
  echo "PASS: test_send_with_a_pending_digest_rewrites_updated_input_and_clears_the_queue"
}

test_concurrent_batch_appends_dont_lose_an_item_rf4() {
  local bin_dir outbox; bin_dir="$(setup_fake_judge batch)"; outbox="$(mktemp -d)"
  run_hook '{"session_id":"s1","agent_type":"a","tool_input":{"to":"main","message":"first"}}' "$bin_dir" "$outbox" > /dev/null &
  run_hook '{"session_id":"s1","agent_type":"b","tool_input":{"to":"main","message":"second"}}' "$bin_dir" "$outbox" > /dev/null &
  wait
  local n; n="$(wc -l < "$outbox/s1.jsonl" | tr -d ' ')"
  [ "$n" -eq 2 ] || { echo "FAIL: expected 2 queued items after concurrent batches, got $n (RF-4)"; exit 1; }
  echo "PASS: test_concurrent_batch_appends_dont_lose_an_item_rf4"
}

test_aw_judge_child_guard() {
  local bin_dir out outbox; bin_dir="$(setup_fake_judge send)"; outbox="$(mktemp -d)"
  out="$(PATH="$bin_dir:$PATH" AW_OUTBOX_DIR="$outbox" AW_JUDGE_CHILD=1 bash "$HOOK" <<< '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","message":"x"}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null || { echo "FAIL: guard must still produce an explicit allow, got $out"; exit 1; }
  echo "PASS: test_aw_judge_child_guard"
}

test_control_messages_bypass_the_classifier_entirely_f6() {
  local bin_dir out outbox; bin_dir="$(mktemp -d)"; outbox="$(mktemp -d)"
  cat > "$bin_dir/judge" <<'EOF'
#!/usr/bin/env bash
echo "FAIL: judge must never be called for a control message" >&2
exit 1
EOF
  chmod +x "$bin_dir/judge"
  out="$(PATH="$bin_dir:$PATH" AW_OUTBOX_DIR="$outbox" bash "$HOOK" <<< '{"session_id":"s1","agent_type":"builder-a","tool_input":{"to":"main","type":"shutdown_request","message":{"type":"shutdown_request","reason":"context full"}}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null || { echo "FAIL: expected an unconditional allow for a shutdown_request, got $out"; exit 1; }
  echo "PASS: test_control_messages_bypass_the_classifier_entirely_f6"
}

test_send_is_allowed_unmodified
test_drop_denies_with_no_ack_reason
test_batch_denies_and_queues_tagged_by_agent_type
test_batch_from_main_session_queues_with_null_agent_type
test_a_judge_failure_fails_open_to_allow_rf1
test_send_with_a_pending_digest_rewrites_updated_input_and_clears_the_queue
test_concurrent_batch_appends_dont_lose_an_item_rf4
test_aw_judge_child_guard
test_control_messages_bypass_the_classifier_entirely_f6
echo "All send-gate tests passed."
