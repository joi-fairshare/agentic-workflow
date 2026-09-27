#!/usr/bin/env bash
# config/lib/tests/judge-brief-real-cli.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STATE_DIR="$(mktemp -d)"
JUDGE() { AW_STATE_DIR="$STATE_DIR" node "$ROOT/judge/dist/cli.js" "$@"; }

test_save_then_get_round_trips_through_the_real_binary() {
  echo '{"toolUseId":"tu1","sessionId":"s1","promptId":"p1","dispatchName":null,"subagentType":"lean-coder","goal":"add X","acceptanceCriteria":"tests pass","proofCommand":"npm test"}' | JUDGE brief save
  local out; out="$(JUDGE brief get tu1)"
  echo "$out" | jq -e '.goal == "add X"' > /dev/null || { echo "FAIL: expected the real CLI to round-trip the saved brief, got: $out"; exit 1; }
  echo "PASS: test_save_then_get_round_trips_through_the_real_binary"
}

test_map_by_name_then_set_agent_id_through_the_real_binary() {
  echo '{"toolUseId":"tu2","sessionId":"s1","promptId":"p2","dispatchName":"builder-a","subagentType":"general-purpose","goal":"x","acceptanceCriteria":"y","proofCommand":"z"}' | JUDGE brief save
  local mapped; mapped="$(JUDGE brief map-by-name builder-a)"
  [ "$mapped" = "tu2" ] || { echo "FAIL: expected tu2 from the real binary, got: $mapped"; exit 1; }
  JUDGE brief set-agent-id "$mapped" agent-42
  local out; out="$(JUDGE brief get tu2)"
  echo "$out" | jq -e '.agentId == "agent-42"' > /dev/null || { echo "FAIL: expected agentId set via the real binary, got: $out"; exit 1; }
  echo "PASS: test_map_by_name_then_set_agent_id_through_the_real_binary"
}

test_save_then_get_round_trips_through_the_real_binary
test_map_by_name_then_set_agent_id_through_the_real_binary
echo "All judge-brief-real-cli tests passed."
