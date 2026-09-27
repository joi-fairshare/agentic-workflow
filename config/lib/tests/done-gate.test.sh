#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$DIR/../../hooks/done-gate.sh"

write_transcript_with_assistant_text() {
  local file="$1" text="$2"
  jq -nc --arg t "$text" '{type:"assistant", message:{content:[{type:"text", text:$t}]}}' > "$file"
}

write_transcript_with_string_content() {
  local file="$1" text="$2"
  jq -nc --arg t "$text" '{type:"assistant", message:{content: $t}}' > "$file"
}

setup_fake_judge() {
  local bin_dir brief_json; bin_dir="$(mktemp -d)"; brief_json="${1:-}"
  cat > "$bin_dir/judge" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "brief" ] && [ "\$2" = "get" ]; then
  if [ -n '$brief_json' ]; then
    printf '%s' '$brief_json'
    exit 0
  fi
  exit 1
fi
EOF
  chmod +x "$bin_dir/judge"
  echo "$bin_dir"
}

# RF-3, checked first, literally: stop_hook_active means exit 0 always,
# before even reading the transcript.
test_stop_hook_active_always_exits_0_rf3() {
  local out rc
  set +e
  out="$(bash "$HOOK" <<< '{"stop_hook_active": true, "transcript_path": "/nonexistent-should-never-be-read"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: RF-3 expected exit 0 for stop_hook_active, got $rc"; exit 1; }
  echo "PASS: test_stop_hook_active_always_exits_0_rf3"
}

test_not_a_done_claim_exits_0() {
  local transcript rc
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "still working on the next step"
  set +e
  bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 for a non-done claim, got $rc"; exit 1; }
  echo "PASS: test_not_a_done_claim_exits_0"
}

test_no_brief_found_falls_back_to_any_evidence_check_rf2() {
  local bin_dir transcript rc
  bin_dir="$(setup_fake_judge)"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done — ran npm test and everything passed."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 (evidence present, no brief - RF-2), got $rc"; exit 1; }
  echo "PASS: test_no_brief_found_falls_back_to_any_evidence_check_rf2"
}

test_done_claim_with_no_evidence_at_all_exits_2() {
  local bin_dir transcript rc
  bin_dir="$(setup_fake_judge)"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done, all good."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 for a done claim with zero evidence, got $rc"; exit 1; }
  echo "PASS: test_done_claim_with_no_evidence_at_all_exits_2"
}

test_done_claim_with_matching_brief_and_evidence_exits_0() {
  local bin_dir transcript rc
  bin_dir="$(setup_fake_judge '{"acceptanceCriteria":"tests pass"}')"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done — tests pass, ran npm test."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 for a claim matching the brief's acceptance criteria, got $rc"; exit 1; }
  echo "PASS: test_done_claim_with_matching_brief_and_evidence_exits_0"
}

test_done_claim_not_matching_brief_acceptance_exits_2() {
  local bin_dir transcript rc
  bin_dir="$(setup_fake_judge '{"acceptanceCriteria":"the migration runs cleanly on staging"}')"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done, ran npm test."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 when the claim doesn't address the brief's acceptance criteria, got $rc"; exit 1; }
  echo "PASS: test_done_claim_not_matching_brief_acceptance_exits_2"
}

test_string_shaped_message_content_is_read_too() {
  local bin_dir transcript rc
  bin_dir="$(setup_fake_judge)"
  transcript="$(mktemp)"
  write_transcript_with_string_content "$transcript" "Done, all good."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 — string-shaped message.content must be gated too, got $rc"; exit 1; }
  echo "PASS: test_string_shaped_message_content_is_read_too"
}

test_done_claim_survives_over_1mb_of_trailing_hook_attachments() {
  # 2026-09-27 real-session finding: a headless claude -p session's Stop
  # event can carry well over 1MB of trailing hook-attachment JSON
  # (deferred-tool listings, full skill text, etc.) appended AFTER the last
  # assistant line — the old fixed 64KB tail window missed the assistant
  # line entirely, so the hook silently allowed a bare "Done." through with
  # no evidence, unevaluated. Reproduce with >1MB of padding.
  local transcript rc
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done."
  head -c 1200000 /dev/zero | tr '\0' 'x' | jq -Rsc '{type:"attachment", attachment:{type:"padding", content:.}}' >> "$transcript"
  set +e
  bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 (no evidence) past >1MB of trailing padding, got $rc"; exit 1; }
  echo "PASS: test_done_claim_survives_over_1mb_of_trailing_hook_attachments"
}

test_stop_hook_active_always_exits_0_rf3
test_not_a_done_claim_exits_0
test_no_brief_found_falls_back_to_any_evidence_check_rf2
test_done_claim_with_no_evidence_at_all_exits_2
test_done_claim_with_matching_brief_and_evidence_exits_0
test_done_claim_not_matching_brief_acceptance_exits_2
test_string_shaped_message_content_is_read_too
test_done_claim_survives_over_1mb_of_trailing_hook_attachments
echo "All done-gate tests passed."

setup_fake_judge_ask_check() {
  local bin_dir rc; bin_dir="$(mktemp -d)"; rc="$1"
  cat > "$bin_dir/judge" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "ask-check" ]; then
  cat > /dev/null
  exit $rc
fi
if [ "\$1" = "brief" ] && [ "\$2" = "get" ]; then
  exit 1
fi
EOF
  chmod +x "$bin_dir/judge"
  echo "$bin_dir"
}

test_ask_check_continue_exits_2_and_writes_auto_continued_at() {
  local bin_dir transcript rc sessions_dir
  bin_dir="$(setup_fake_judge_ask_check 2)"
  sessions_dir="$(mktemp -d)"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "still working on the next step"
  set +e
  PATH="$bin_dir:$PATH" AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 when ask-check says continue, got $rc"; exit 1; }
  jq -e '.auto_continued_at' "$sessions_dir/s1.json" > /dev/null || { echo "FAIL: expected auto_continued_at to be written"; exit 1; }
  echo "PASS: test_ask_check_continue_exits_2_and_writes_auto_continued_at"
}

test_ask_check_ask_exits_0() {
  local bin_dir transcript rc sessions_dir
  bin_dir="$(setup_fake_judge_ask_check 0)"
  sessions_dir="$(mktemp -d)"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "still working on the next step"
  set +e
  PATH="$bin_dir:$PATH" AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 when ask-check says ask, got $rc"; exit 1; }
  echo "PASS: test_ask_check_ask_exits_0"
}

test_ask_check_continue_exits_2_and_writes_auto_continued_at
test_ask_check_ask_exits_0

test_judge_missing_from_path_on_done_claim_still_fails_open() {
  local transcript rc empty_path
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done, all good."
  empty_path="/usr/bin:/bin"  # keeps jq/coreutils, excludes judge
  set +e
  PATH="$empty_path" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 2 ] || { echo "FAIL: expected exit 2 (RF-2, no evidence) — must never crash or exit >2 when judge is missing entirely, got $rc"; exit 1; }
  echo "PASS: test_judge_missing_from_path_on_done_claim_still_fails_open"
}

test_judge_nonzero_garbage_stdout_on_done_claim_still_fails_open() {
  local bin_dir transcript rc
  bin_dir="$(mktemp -d)"
  cat > "$bin_dir/judge" <<'EOF'
#!/usr/bin/env bash
echo 'not valid json {{{'
exit 1
EOF
  chmod +x "$bin_dir/judge"
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "Done — tests pass, ran npm test."
  set +e
  PATH="$bin_dir:$PATH" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: garbage/nonzero judge output must not block the stop (evidence is present in the claim itself), got $rc"; exit 1; }
  echo "PASS: test_judge_nonzero_garbage_stdout_on_done_claim_still_fails_open"
}

test_judge_missing_from_path_on_non_done_claim_still_fails_open() {
  local transcript rc empty_path
  transcript="$(mktemp)"
  write_transcript_with_assistant_text "$transcript" "still working on the next step"
  empty_path="/usr/bin:/bin"
  set +e
  PATH="$empty_path" bash "$HOOK" <<< "$(jq -nc --arg t "$transcript" '{transcript_path:$t, session_id:"s1"}')"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || { echo "FAIL: expected exit 0 (ask-check unreachable -> fail safe to a real stop, never auto-continue), got $rc"; exit 1; }
  echo "PASS: test_judge_missing_from_path_on_non_done_claim_still_fails_open"
}

test_judge_missing_from_path_on_done_claim_still_fails_open
test_judge_nonzero_garbage_stdout_on_done_claim_still_fails_open
test_judge_missing_from_path_on_non_done_claim_still_fails_open
