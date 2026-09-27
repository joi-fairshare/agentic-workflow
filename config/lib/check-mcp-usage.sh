#!/usr/bin/env bash
set -euo pipefail

check_mcp_state() {
  local claude_json="$1" project_path="$2" server_name="$3"
  local disabled
  disabled="$(jq -r --arg p "$project_path" --arg s "$server_name" \
    '.projects[$p].disabledMcpServers // [] | index($s) != null' "$claude_json")"
  if [ "$disabled" = "true" ]; then
    echo "disabled"
  else
    echo "enabled"
  fi
}
