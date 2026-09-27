#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCTOR="$DIR/../../doctor.sh"

setup_fake_bins() {
  local bin_dir="$1" login_html="$2" pg_ready="$3" port_open="$4"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/curl" <<EOF
#!/usr/bin/env bash
echo "$login_html"
EOF
  cat > "$bin_dir/docker" <<EOF
#!/usr/bin/env bash
[ "$pg_ready" = "1" ] && exit 0 || exit 1
EOF
  cat > "$bin_dir/nc" <<EOF
#!/usr/bin/env bash
[ "$port_open" = "1" ] && exit 0 || exit 1
EOF
  chmod +x "$bin_dir/curl" "$bin_dir/docker" "$bin_dir/nc"
}

test_healthy_stack_exits_0() {
  local bin_dir; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<title>TestApp</title>" 1 1
  PATH="$bin_dir:$PATH" UI_EVIDENCE_APP_TITLE="TestApp" bash "$DOCTOR" > /dev/null && echo "PASS: test_healthy_stack_exits_0" || { echo "FAIL: expected exit 0 for a healthy stack"; exit 1; }
}

test_foreign_process_on_3000_is_refused_not_double_driven() {
  local bin_dir out; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<html>some other app</html>" 1 1
  if out="$(PATH="$bin_dir:$PATH" UI_EVIDENCE_APP_TITLE="TestApp" bash "$DOCTOR" 2>&1)"; then
    echo "FAIL: expected a non-zero exit when :3000 isn't this app (RF-1)"; exit 1
  fi
  echo "$out" | grep -qi "not.*this app\|foreign" || { echo "FAIL: expected a clear refusal reason, got: $out"; exit 1; }
  echo "PASS: test_foreign_process_on_3000_is_refused_not_double_driven"
}

test_postgres_not_ready_fails_with_reason() {
  local bin_dir out; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<title>TestApp</title>" 0 1
  if out="$(PATH="$bin_dir:$PATH" UI_EVIDENCE_APP_TITLE="TestApp" bash "$DOCTOR" 2>&1)"; then echo "FAIL: expected non-zero when postgres isn't ready"; exit 1; fi
  echo "$out" | grep -qi postgres || { echo "FAIL: expected postgres named in the failure, got: $out"; exit 1; }
  echo "PASS: test_postgres_not_ready_fails_with_reason"
}

test_docker_invoked_exactly_once_for_postgres_check() {
  local bin_dir; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<title>TestApp</title>" 1 1
  # Own tempdir for the call log, not "$bin_dir/.." — that resolves to the
  # shared system temp dir (mktemp -d always creates directly under it), so
  # every run of this test was appending to the SAME file and inflating the
  # count on repeat/parallel runs (root cause of the "got 2"/"got 3" flake).
  local call_log; call_log="$(mktemp -d)/docker-calls"
  cat > "$bin_dir/docker" <<EOF
#!/usr/bin/env bash
echo "call" >> "$call_log"
exit 0
EOF
  chmod +x "$bin_dir/docker"
  PATH="$bin_dir:$PATH" UI_EVIDENCE_APP_TITLE="TestApp" bash "$DOCTOR" > /dev/null
  local n; n="$(wc -l < "$call_log" | tr -d ' ')"
  [ "$n" -eq 1 ] || { echo "FAIL: expected docker invoked exactly once (single pg_isready branch), got $n"; exit 1; }
  echo "PASS: test_docker_invoked_exactly_once_for_postgres_check"
}

test_api_server_not_open_fails_with_reason() {
  local bin_dir out; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<title>TestApp</title>" 1 0
  if out="$(PATH="$bin_dir:$PATH" UI_EVIDENCE_APP_TITLE="TestApp" bash "$DOCTOR" 2>&1)"; then echo "FAIL: expected non-zero when :5002 isn't open"; exit 1; fi
  echo "$out" | grep -qi "api-server\|5002" || { echo "FAIL: expected api-server named in the failure, got: $out"; exit 1; }
  echo "PASS: test_api_server_not_open_fails_with_reason"
}

test_missing_app_title_config_fails_with_reason() {
  local bin_dir out; bin_dir="$(mktemp -d)"
  setup_fake_bins "$bin_dir" "<title>TestApp</title>" 1 1
  if out="$(PATH="$bin_dir:$PATH" env -u UI_EVIDENCE_APP_TITLE UI_EVIDENCE_CONFIG="/nonexistent" bash "$DOCTOR" 2>&1)"; then
    echo "FAIL: expected non-zero when UI_EVIDENCE_APP_TITLE isn't configured"; exit 1
  fi
  echo "$out" | grep -qi "UI_EVIDENCE_APP_TITLE" || { echo "FAIL: expected the missing config var named in the failure, got: $out"; exit 1; }
  echo "PASS: test_missing_app_title_config_fails_with_reason"
}

test_healthy_stack_exits_0
test_foreign_process_on_3000_is_refused_not_double_driven
test_postgres_not_ready_fails_with_reason
test_docker_invoked_exactly_once_for_postgres_check
test_api_server_not_open_fails_with_reason
test_missing_app_title_config_fails_with_reason
echo "All doctor tests passed."
