#!/usr/bin/env bash
# Cursor adapter for the Vitalize Workflow Toolkit installer.
# Sourced by setup.sh (after providers/lib.sh). Defines cursor_* functions only.
#
# Verified against cursor-agent 2026.09.02 (bundle source, 2026-09-28):
#   - Skills: user dirs scanned in order ~/.cursor/skills, ~/.claude/skills*,
#     ~/.codex/skills*, ~/.grok/skills*, ~/.agents/skills (*third-party dirs,
#     on by default). Entries are de-duplicated by the path suffix after the
#     config dir (e.g. `skills/review/SKILL.md`), first wins — so linking the
#     same skill names into ~/.cursor/skills does not double-register when the
#     Claude or Codex dirs are also populated, and ~/.cursor/skills wins.
#   - Custom agents: ~/.cursor/agents/*.md (also ~/.claude/agents when
#     third-party is on), merged by `name`, .cursor first. Frontmatter keys:
#     name, description, model (default "inherit"; "fast" allowed), readonly,
#     background/is_background, tools. Files must be real files (symlinks
#     pointing outside the root are rejected), so agents are rendered+copied.
#   - MCP: ~/.cursor/mcp.json `mcpServers` (no CLI `add`; `cursor-agent mcp`
#     only lists/enables/logs in). New servers may need approval on first use
#     (`cursor-agent mcp enable <name>` or `--approve-mcps`).

CURSOR_DIR="${CURSOR_DIR:-$HOME/.cursor}"

cursor_detect() { aw_has cursor-agent || aw_has cursor; }
cursor_skills_dir() { echo "$CURSOR_DIR/skills"; }
cursor_agents_dir() { echo "$CURSOR_DIR/agents"; }

# Merge our servers into ~/.cursor/mcp.json with jq. Idempotent; every server
# not named by the toolkit is preserved untouched. Our entries are upserted so
# a moved repo path (bridge dist, serena wrapper) is corrected on re-run.
cursor_register_mcp() {
  local mcp_file="$CURSOR_DIR/mcp.json" servers tmp
  echo ""
  echo "Registering MCP servers with Cursor ($mcp_file)..."
  servers="$(printf '%s' "${AW_MCP_SERVERS:-[]}" | jq -c '
    map({key: .name, value: ({command: .command, args: (.args // [])}
      + (if (.env // {}) == {} then {} else {env: .env} end))}) | from_entries')"
  tmp="$(mktemp)"
  if [ -f "$mcp_file" ]; then
    if ! jq -e 'type == "object"' "$mcp_file" &>/dev/null; then
      echo "  WARN: $mcp_file is not valid JSON — leaving it alone"
      rm -f "$tmp"; return 0
    fi
    cp "$mcp_file" "$tmp"
  else
    echo '{}' > "$tmp"
  fi
  jq --argjson ours "$servers" '.mcpServers = ((.mcpServers // {}) + $ours)' "$tmp" > "$tmp.next"
  mv "$tmp.next" "$tmp"

  if [ -f "$mcp_file" ] && cmp -s "$tmp" "$mcp_file"; then
    echo "  mcp.json: up to date ($(printf '%s' "$servers" | jq -r 'keys | join(", ")'))"
  elif aw_dry; then
    echo "  [dry-run] would upsert into $mcp_file: $(printf '%s' "$servers" | jq -r 'keys | join(", ")')"
  else
    mkdir -p "$CURSOR_DIR"
    mv "$tmp" "$mcp_file"
    chmod 600 "$mcp_file"
    echo "  mcp.json: upserted $(printf '%s' "$servers" | jq -r 'keys | join(", ")')"
  fi
  rm -f "$tmp"
}

cursor_install_hooks() {
  local hooks_script="$TOOLKIT_DIR/providers/cursor/install-hooks.sh"
  echo ""
  if [ -f "$hooks_script" ]; then
    TOOLKIT_DIR="$TOOLKIT_DIR" AW_DRY_RUN="${AW_DRY_RUN:-0}" bash "$hooks_script"
  else
    echo "  (no providers/cursor/install-hooks.sh — skipping)"
  fi
  # judge's SessionStart health hook (honors AW_DRY_RUN itself).
  AW_DRY_RUN="${AW_DRY_RUN:-0}" bash "$TOOLKIT_DIR/scripts/install-judge.sh" --hook-only --provider cursor
}

cursor_install_agents() {
  local manifest="$AW_STATE_ROOT/managed/agents-cursor.json"
  aw_run mkdir -p "$AW_STATE_ROOT/managed"
  aw_dry || { [ -f "$manifest" ] || echo '{}' > "$manifest"; }
  install_agents "$TOOLKIT_DIR/config/agents" "$(cursor_agents_dir)" "$manifest" cursor
  echo "  cursor: lean agent types → $(cursor_agents_dir) (manifest: $manifest)"
}

cursor_install() {
  echo ""
  echo "=== Provider: Cursor ==="
  aw_install_skills_into "$(cursor_skills_dir)"
  cursor_install_hooks
  aw_install_levers cursor
  cursor_register_mcp
}
