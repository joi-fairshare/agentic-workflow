#!/usr/bin/env bash
# Tests for providers/lib.sh + providers/*/install.sh (installer plumbing).
# Runs entirely inside a throwaway $HOME; never touches the real one.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

fail() { echo "FAIL: $*"; exit 1; }

setup_env() {
  SANDBOX="$(mktemp -d)"
  export HOME="$SANDBOX/home"
  mkdir -p "$HOME"
  export TOOLKIT_DIR="$ROOT"
  export AW_DRY_RUN=0
  unset AW_STATE_ROOT CODEX_HOME CLAUDE_DIR CURSOR_DIR
  # shellcheck source=../lib.sh
  source "$ROOT/providers/lib.sh"
  source "$ROOT/config/lib/install-agents.sh"
  source "$ROOT/providers/claude/install.sh"
  source "$ROOT/providers/codex/install.sh"
  source "$ROOT/providers/cursor/install.sh"
  MANAGED_SKILLS=(review cso)
  DEPRECATED_SKILLS=(bolder)
  AW_EXTERNAL_SKILL_DIRS=""
}
teardown_env() { rm -rf "$SANDBOX"; }

test_links_managed_and_bootstrap_then_is_idempotent() {
  setup_env
  local d="$HOME/.claude/skills" out
  aw_install_skills_into "$d" </dev/null >/dev/null
  [ "$(readlink "$d/review")" = "$ROOT/skills/review" ] || fail "review not linked"
  [ "$(readlink "$d/bootstrap")" = "$ROOT/bootstrap" ] || fail "bootstrap not linked"
  out="$(aw_install_skills_into "$d" </dev/null)"
  echo "$out" | grep -q "review: up to date" || fail "second run should be up to date"
  teardown_env
  echo "PASS: test_links_managed_and_bootstrap_then_is_idempotent"
}

test_refreshes_legacy_link_and_removes_deprecated() {
  setup_env
  local d="$HOME/.codex/skills"
  mkdir -p "$d/bolder"
  ln -s "/old/place/agentic-workflow/skills/review" "$d/review"
  aw_install_skills_into "$d" </dev/null >/dev/null
  [ "$(readlink "$d/review")" = "$ROOT/skills/review" ] || fail "legacy link not refreshed"
  [ ! -e "$d/bolder" ] || fail "deprecated skill not removed"
  teardown_env
  echo "PASS: test_refreshes_legacy_link_and_removes_deprecated"
}

test_foreign_collision_is_kept_when_stdin_closed() {
  setup_env
  local d="$HOME/.cursor/skills"
  mkdir -p "$d" "$SANDBOX/other/cso"
  ln -s "$SANDBOX/other/cso" "$d/cso"
  aw_install_skills_into "$d" </dev/null >/dev/null || fail "collision prompt aborted the install"
  [ "$(readlink "$d/cso")" = "$SANDBOX/other/cso" ] || fail "foreign symlink was replaced without consent"
  teardown_env
  echo "PASS: test_foreign_collision_is_kept_when_stdin_closed"
}

test_stale_cleanup_only_removes_our_links() {
  setup_env
  local d="$HOME/.claude/skills"
  mkdir -p "$d" "$SANDBOX/foreign/x"
  ln -s "$ROOT/skills/retired-skill" "$d/retired-skill"
  ln -s "$SANDBOX/foreign/x" "$d/foreign-skill"
  AW_ASSUME_YES=1 aw_cleanup_stale_skills "$d" >/dev/null
  [ ! -L "$d/retired-skill" ] || fail "stale toolkit link not removed"
  [ -L "$d/foreign-skill" ] || fail "foreign link removed"
  teardown_env
  echo "PASS: test_stale_cleanup_only_removes_our_links"
}

test_external_skills_link_but_native_wins() {
  setup_env
  local d="$HOME/.claude/skills" ext="$HOME/.agentic-workflow/external-skills/pack/skills"
  mkdir -p "$ext/review" "$ext/polish-x"
  echo "---" > "$ext/review/SKILL.md"; echo "---" > "$ext/polish-x/SKILL.md"
  AW_EXTERNAL_SKILL_DIRS="$ext/review
$ext/polish-x"
  aw_install_skills_into "$d" </dev/null >/dev/null
  [ "$(readlink "$d/review")" = "$ROOT/skills/review" ] || fail "external pack overrode native skill"
  [ "$(readlink "$d/polish-x")" = "$ext/polish-x" ] || fail "external skill not linked"
  teardown_env
  echo "PASS: test_external_skills_link_but_native_wins"
}

test_toolkit_link_and_registry_merge() {
  setup_env
  aw_link_toolkit >/dev/null
  [ "$(readlink "$HOME/.agentic-workflow/toolkit")" = "$ROOT" ] || fail "toolkit link wrong"
  [ -d "$HOME/.agentic-workflow/toolkit/skills/_shared" ] || fail "_shared not reachable via toolkit"
  mkdir -p "$HOME/.claude/skills" "$HOME/.codex/skills"
  printf 'claude %s\ngone %s\n' "$HOME/.claude/skills" "$HOME/nope" > "$HOME/.agentic-workflow/providers"
  aw_write_provider_registry "codex $HOME/.codex/skills" >/dev/null
  local reg="$HOME/.agentic-workflow/providers"
  grep -qx "claude $HOME/.claude/skills" "$reg" || fail "existing provider dropped from registry"
  grep -qx "codex $HOME/.codex/skills" "$reg" || fail "new provider missing from registry"
  ! grep -q '^gone ' "$reg" || fail "provider with missing skills dir kept"
  teardown_env
  echo "PASS: test_toolkit_link_and_registry_merge"
}

test_cursor_mcp_merge_preserves_and_is_idempotent() {
  setup_env
  mkdir -p "$HOME/.cursor"
  echo '{"mcpServers":{"mine":{"url":"https://x"}},"other":1}' > "$HOME/.cursor/mcp.json"
  AW_MCP_SERVERS='[{"name":"agentic-bridge","command":"node","args":["/b/mcp.js"]},{"name":"prism-mcp","command":"npx","args":["-y","p@1"],"env":{"PRISM_DASHBOARD_PORT":"7180"}}]'
  cursor_register_mcp >/dev/null
  local f="$HOME/.cursor/mcp.json"
  jq -e '.mcpServers.mine.url == "https://x" and .other == 1' "$f" >/dev/null || fail "existing entries not preserved"
  jq -e '.mcpServers["agentic-bridge"].args == ["/b/mcp.js"]' "$f" >/dev/null || fail "bridge not added"
  jq -e '.mcpServers["prism-mcp"].env.PRISM_DASHBOARD_PORT == "7180"' "$f" >/dev/null || fail "env not written"
  jq -e '.mcpServers["agentic-bridge"] | has("env") | not' "$f" >/dev/null || fail "empty env should be omitted"
  cursor_register_mcp | grep -q "up to date" || fail "second merge should be a no-op"
  teardown_env
  echo "PASS: test_cursor_mcp_merge_preserves_and_is_idempotent"
}

test_dry_run_writes_nothing() {
  setup_env
  AW_DRY_RUN=1
  AW_MCP_SERVERS='[{"name":"agentic-bridge","command":"node","args":["/b/mcp.js"]}]'
  aw_link_toolkit >/dev/null
  aw_install_skills_into "$HOME/.claude/skills" </dev/null >/dev/null
  cursor_register_mcp >/dev/null
  aw_write_provider_registry "claude $HOME/.claude/skills" >/dev/null
  codex_install_agents >/dev/null
  [ -z "$(ls -A "$HOME")" ] || fail "dry run wrote into HOME: $(ls -A "$HOME")"
  teardown_env
  echo "PASS: test_dry_run_writes_nothing"
}

test_agents_render_per_provider() {
  setup_env
  codex_install_agents >/dev/null
  cursor_install_agents >/dev/null
  local c="$HOME/.codex/agents" u="$HOME/.cursor/agents"
  [ "$(ls "$c"/*.toml | wc -l | tr -d ' ')" = "4" ] || fail "expected 4 codex agent tomls"
  grep -q '^name = "lean-researcher"$' "$c/lean-researcher.toml" || fail "codex name missing"
  grep -q '^sandbox_mode = "read-only"$' "$c/lean-researcher.toml" || fail "read-only agent not sandboxed"
  ! grep -q '^sandbox_mode' "$c/lean-coder.toml" || fail "write agent must not be read-only"
  grep -q '^developer_instructions = """$' "$c/lean-coder.toml" || fail "developer_instructions missing"
  grep -q '^model_reasoning_effort = "low"$' "$c/lean-researcher.toml" || fail "haiku pin not mapped to low effort"
  grep -q '^model: fast$' "$u/lean-researcher.md" || fail "cursor haiku→fast mapping missing"
  grep -q '^readonly: true$' "$u/lean-reviewer.md" || fail "cursor readonly missing"
  ! grep -q '^tools:' "$u/lean-coder.md" || fail "claude tool names leaked into cursor agent"
  jq -e '."lean-coder.toml"' "$HOME/.agentic-workflow/managed/agents-codex.json" >/dev/null || fail "codex manifest missing"
  teardown_env
  echo "PASS: test_agents_render_per_provider"
}

test_links_managed_and_bootstrap_then_is_idempotent
test_refreshes_legacy_link_and_removes_deprecated
test_foreign_collision_is_kept_when_stdin_closed
test_stale_cleanup_only_removes_our_links
test_external_skills_link_but_native_wins
test_toolkit_link_and_registry_merge
test_cursor_mcp_merge_preserves_and_is_idempotent
test_dry_run_writes_nothing
test_agents_render_per_provider
