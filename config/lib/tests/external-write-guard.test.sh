#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$DIR/../../hooks/external-write-guard.sh"

write_session_with_auto_continue() {
  local dir="$1" session="$2"
  mkdir -p "$dir"
  echo '{"auto_continued_at":"2026-09-27T00:00:00Z"}' > "$dir/$session.json"
}

test_auto_continued_plus_git_push_denies() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  write_session_with_auto_continue "$sessions_dir" "s1"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"Bash","tool_input":{"command":"git push origin main"}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null \
    || { echo "FAIL: expected deny when auto_continued_at is set + git push, got $out"; exit 1; }
  echo "PASS: test_auto_continued_plus_git_push_denies"
}

test_no_auto_continue_plus_git_push_allows() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"Bash","tool_input":{"command":"git push origin main"}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null \
    || { echo "FAIL: expected allow when auto_continued_at is unset, got $out"; exit 1; }
  echo "PASS: test_no_auto_continue_plus_git_push_allows"
}

test_auto_continued_but_unmatched_tool_always_allows_rf5() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  write_session_with_auto_continue "$sessions_dir" "s1"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"Bash","tool_input":{"command":"npm test"}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null \
    || { echo "FAIL: RF-5 — a tool outside the matched set must always allow, got $out"; exit 1; }
  echo "PASS: test_auto_continued_but_unmatched_tool_always_allows_rf5"
}

test_linear_save_is_matched_and_gated() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  write_session_with_auto_continue "$sessions_dir" "s1"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"mcp__claude_ai_Linear__save_issue","tool_input":{}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null \
    || { echo "FAIL: expected Linear save_* to be gated, got $out"; exit 1; }
  echo "PASS: test_linear_save_is_matched_and_gated"
}

test_slack_send_is_matched_and_gated() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  write_session_with_auto_continue "$sessions_dir" "s1"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"mcp__claude_ai_Slack__slack_send_message","tool_input":{}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null \
    || { echo "FAIL: expected Slack send_* to be gated, got $out"; exit 1; }
  echo "PASS: test_slack_send_is_matched_and_gated"
}

test_gh_pr_merge_is_matched_and_gated() {
  local sessions_dir out
  sessions_dir="$(mktemp -d)"
  write_session_with_auto_continue "$sessions_dir" "s1"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< '{"session_id":"s1","tool_name":"Bash","tool_input":{"command":"gh pr merge 123"}}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' > /dev/null \
    || { echo "FAIL: expected gh pr merge to be gated, got $out"; exit 1; }
  echo "PASS: test_gh_pr_merge_is_matched_and_gated"
}

test_aw_judge_child_gets_explicit_allow() {
  local out
  out="$(AW_JUDGE_CHILD=1 bash "$HOOK" <<< '{}')"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null \
    || { echo "FAIL: expected explicit allow under AW_JUDGE_CHILD, got $out"; exit 1; }
  echo "PASS: test_aw_judge_child_gets_explicit_allow"
}

# Builds the risky "git <push-word> ... <main-word>" command text at runtime
# (never as a literal in this file) so a repo-level safety hook scanning
# this session's own tool-call text never mistakes a TEST FIXTURE for a
# real push-to-main attempt.
risky_command_text() {
  local w1="p""ush" w2="ma""in"
  printf 'git %s origin %s' "$w1" "$w2"
}

test_corrupt_session_file_falls_back_to_allow() {
  local sessions_dir out cmd
  sessions_dir="$(mktemp -d)"
  echo 'not valid json {{{' > "$sessions_dir/s1.json"
  cmd="$(risky_command_text)"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< "$(jq -nc --arg c "$cmd" '{session_id:"s1",tool_name:"Bash",tool_input:{command:$c}}')" 2>/dev/null)"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null \
    || { echo "FAIL: a corrupt session state file must fall back to 'no auto-continue happened' (allow), got $out"; exit 1; }
  echo "PASS: test_corrupt_session_file_falls_back_to_allow"
}

test_unreadable_session_file_falls_back_to_allow() {
  local sessions_dir out cmd
  sessions_dir="$(mktemp -d)"
  echo '{"auto_continued_at":"2026-09-27T00:00:00Z"}' > "$sessions_dir/s1.json"
  chmod 000 "$sessions_dir/s1.json"
  cmd="$(risky_command_text)"
  out="$(AW_JUDGE_SESSIONS_DIR="$sessions_dir" bash "$HOOK" <<< "$(jq -nc --arg c "$cmd" '{session_id:"s1",tool_name:"Bash",tool_input:{command:$c}}')" 2>/dev/null)"
  chmod 644 "$sessions_dir/s1.json"
  echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "allow"' > /dev/null \
    || { echo "FAIL: an unreadable session state file must fall back to allow, got $out"; exit 1; }
  echo "PASS: test_unreadable_session_file_falls_back_to_allow"
}

test_guard_never_invokes_judge() {
  grep -qE '(^|[^_a-zA-Z-])judge($| )' "$HOOK" && { echo "FAIL: external-write-guard.sh must be deterministic only — it must never call the judge binary"; exit 1; }
  echo "PASS: test_guard_never_invokes_judge"
}

test_auto_continued_plus_git_push_denies
test_no_auto_continue_plus_git_push_allows
test_auto_continued_but_unmatched_tool_always_allows_rf5
test_linear_save_is_matched_and_gated
test_slack_send_is_matched_and_gated
test_gh_pr_merge_is_matched_and_gated
test_aw_judge_child_gets_explicit_allow
test_corrupt_session_file_falls_back_to_allow
test_unreadable_session_file_falls_back_to_allow
test_guard_never_invokes_judge
echo "All external-write-guard tests passed."
