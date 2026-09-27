#!/usr/bin/env bash
set -euo pipefail

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

install_agents() {
  local src_dir="$1" dest_dir="$2" manifest_file="$3"
  mkdir -p "$dest_dir"
  [ -f "$manifest_file" ] || echo '{}' > "$manifest_file"
  local f name dest_file new_hash recorded_hash current_hash
  for f in "$src_dir"/*.md; do
    name="$(basename "$f")"
    dest_file="$dest_dir/$name"
    new_hash="$(sha256_of "$f")"
    if [ -f "$dest_file" ]; then
      current_hash="$(sha256_of "$dest_file")"
      recorded_hash="$(jq -r --arg n "$name" '.[$n] // empty' "$manifest_file")"
      if [ -n "$recorded_hash" ] && [ "$recorded_hash" = "$current_hash" ]; then
        cp "$f" "$dest_file"   # unmodified since we installed it — safe to upgrade
      else
        echo "skip: $name exists and was modified since install (or was never installed by us) — not overwriting" >&2
        continue
      fi
    else
      cp "$f" "$dest_file"
    fi
    local tmp
    tmp="$(mktemp)"
    jq --arg n "$name" --arg h "$new_hash" '.[$n] = $h' "$manifest_file" > "$tmp"
    mv "$tmp" "$manifest_file"
  done
}

uninstall_agents() {
  local dest_dir="$1" manifest_file="$2"
  [ -f "$manifest_file" ] || return 0
  local name recorded_hash current_hash tmp
  tmp="$(mktemp)"
  cp "$manifest_file" "$tmp"
  for name in $(jq -r 'keys[]' "$manifest_file"); do
    recorded_hash="$(jq -r --arg n "$name" '.[$n]' "$manifest_file")"
    if [ -f "$dest_dir/$name" ]; then
      current_hash="$(sha256_of "$dest_dir/$name")"
      if [ "$current_hash" = "$recorded_hash" ]; then
        rm "$dest_dir/$name"
        jq --arg n "$name" 'del(.[$n])' "$tmp" > "$tmp.next" && mv "$tmp.next" "$tmp"
      else
        echo "skip removing $name: modified since install" >&2
      fi
    fi
  done
  mv "$tmp" "$manifest_file"
}
