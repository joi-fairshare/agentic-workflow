# Owner-tagged hook merging for ~/.claude/settings.json. Source this file.
# An agentic-workflow hook command ends in "# aw:<name>"; merge_hook only ever
# replaces or removes commands carrying its own tag.
AW_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# merge_hook <settings-file> <event> <id> <entry-json|null>
merge_hook() {
  local file="$1" event="$2" id="$3" entry="$4" tmp
  if [ ! -f "$file" ]; then
    mkdir -p "$(dirname "$file")"
    echo '{}' > "$file"
  fi
  tmp="$(mktemp "$(dirname "$file")/.$(basename "$file").XXXXXX")"
  if jq --arg event "$event" --arg id "$id" --argjson entry "$entry" \
      -f "$AW_LIB_DIR/merge-hook.jq" "$file" > "$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    return 1
  fi
}

# hook_owners <settings-file>
hook_owners() {
  jq -r -f "$AW_LIB_DIR/hook-owners.jq" "$1"
}
