#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/../install-agents.sh"

sha() { shasum -a 256 "$1" | awk '{print $1}'; }

test_installs_all_four_and_records_their_hashes() {
  local src dest manifest
  src="$(mktemp -d)"; dest="$(mktemp -d)"; manifest="$(mktemp)"; echo '{}' > "$manifest"
  cp "$DIR/../../agents/"*.md "$src/"
  install_agents "$src" "$dest" "$manifest"
  local count
  count="$(ls "$dest"/*.md | wc -l | tr -d ' ')"
  if [ "$count" -ne 4 ]; then
    echo "FAIL: expected 4 installed agent files, got $count"; rm -rf "$src" "$dest" "$manifest"; exit 1
  fi
  local recorded actual
  recorded="$(jq -r '.["lean-coder.md"]' "$manifest")"
  actual="$(sha "$dest/lean-coder.md")"
  if [ "$recorded" != "$actual" ]; then
    echo "FAIL: manifest hash doesn't match installed file"; rm -rf "$src" "$dest" "$manifest"; exit 1
  fi
  rm -rf "$src" "$dest" "$manifest"
  echo "PASS: test_installs_all_four_and_records_their_hashes"
}

test_skips_a_file_hand_edited_since_install() {
  local src dest manifest
  src="$(mktemp -d)"; dest="$(mktemp -d)"; manifest="$(mktemp)"
  cp "$DIR/../../agents/lean-coder.md" "$src/"
  echo "---
name: lean-coder
description: the user's own hand-edited version
---
Not the managed content." > "$dest/lean-coder.md"
  # Manifest claims we installed a DIFFERENT hash than what's on disk now — simulates a hand-edit since install.
  echo '{"lean-coder.md": "0000000000000000000000000000000000000000000000000000000000000000"}' > "$manifest"
  local before
  before="$(cat "$dest/lean-coder.md")"
  install_agents "$src" "$dest" "$manifest" 2>/tmp/install-agents-warn.txt
  local after
  after="$(cat "$dest/lean-coder.md")"
  if [ "$before" != "$after" ]; then
    echo "FAIL: overwrote a hand-edited agent file"; rm -rf "$src" "$dest" "$manifest"; exit 1
  fi
  if ! grep -q "lean-coder.md" /tmp/install-agents-warn.txt; then
    echo "FAIL: expected a warning naming the skipped file"; rm -rf "$src" "$dest" "$manifest"; exit 1
  fi
  rm -rf "$src" "$dest" "$manifest"
  echo "PASS: test_skips_a_file_hand_edited_since_install"
}

test_upgrades_a_file_unmodified_since_install() {
  local src dest manifest
  src="$(mktemp -d)"; dest="$(mktemp -d)"; manifest="$(mktemp)"; echo '{}' > "$manifest"
  cp "$DIR/../../agents/lean-coder.md" "$src/"
  install_agents "$src" "$dest" "$manifest"   # first install
  echo "model: haiku" >> "$src/lean-coder.md"  # a real upstream update to the source
  install_agents "$src" "$dest" "$manifest"   # second install — target still matches manifest, so it upgrades
  if ! grep -q "model: haiku" "$dest/lean-coder.md"; then
    echo "FAIL: expected the unmodified installed file to be upgraded"; rm -rf "$src" "$dest" "$manifest"; exit 1
  fi
  rm -rf "$src" "$dest" "$manifest"
  echo "PASS: test_upgrades_a_file_unmodified_since_install"
}

test_installs_all_four_and_records_their_hashes
test_skips_a_file_hand_edited_since_install
test_upgrades_a_file_unmodified_since_install
