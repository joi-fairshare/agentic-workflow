#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/../check-mcp-usage.sh"

test_reports_disabled_server_from_claude_json() {
  local fixture
  fixture="$(mktemp)"
  cat > "$fixture" <<'EOF'
{
  "projects": {
    "/fake/repo": {
      "disabledMcpServers": ["xcodebuildmcp"]
    }
  }
}
EOF
  local result
  result="$(check_mcp_state "$fixture" "/fake/repo" "xcodebuildmcp")"
  if [ "$result" != "disabled" ]; then
    echo "FAIL: expected 'disabled', got '$result'"
    rm "$fixture"; exit 1
  fi
  rm "$fixture"
  echo "PASS: test_reports_disabled_server_from_claude_json"
}

test_reports_enabled_when_absent() {
  local fixture
  fixture="$(mktemp)"
  echo '{"projects": {"/fake/repo": {}}}' > "$fixture"
  local result
  result="$(check_mcp_state "$fixture" "/fake/repo" "some-server")"
  if [ "$result" != "enabled" ]; then
    echo "FAIL: expected 'enabled' (absent = not disabled), got '$result'"
    rm "$fixture"; exit 1
  fi
  rm "$fixture"
  echo "PASS: test_reports_enabled_when_absent"
}

test_reports_disabled_server_from_claude_json
test_reports_enabled_when_absent
