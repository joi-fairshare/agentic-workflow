#!/usr/bin/env bash
# Bump EXTERNAL_PINS.env entries to upstream HEAD for each external pack.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PINS_FILE="$REPO_ROOT/EXTERNAL_PINS.env"

declare -A PACKS=(
  [IMPECCABLE_PIN]="pbakaus/impeccable"
  [EMIL_PIN]="emilkowalski/skill"
  [TASTE_PIN]="Leonxlnx/taste-skill"
)

for var in "${!PACKS[@]}"; do
  repo="${PACKS[$var]}"
  sha=$(gh api "repos/$repo/commits/HEAD" --jq .sha)
  echo "  $var = $sha ($repo)"
  if grep -q "^${var}=" "$PINS_FILE"; then
    sed -i "s|^${var}=.*|${var}=${sha}|" "$PINS_FILE"
  else
    echo "${var}=${sha}" >> "$PINS_FILE"
  fi
done

echo "Updated $PINS_FILE"
