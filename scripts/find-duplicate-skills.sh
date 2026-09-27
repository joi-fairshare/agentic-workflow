#!/usr/bin/env bash
# Finds skills installed under both a camelCase (or exact) name in one
# directory listing and a kebab-case name in another. Prints one
# "<name-in-file-a><TAB><name-in-file-b>" pair per line.
#
# A name matches its kebab-case counterpart by lowercasing and inserting
# a hyphen before every internal capital: "bugHunt" -> "bug-hunt".
# An exact string match (e.g. "cso", "autoplan") also counts.
set -euo pipefail

camel_to_kebab() {
  # "planDesignReview" -> "plan-design-review"
  echo "$1" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]'
}

find_duplicate_skills() {
  local file_a="$1" file_b="$2"
  while IFS= read -r name_a; do
    [ -z "$name_a" ] && continue
    local kebab
    kebab="$(camel_to_kebab "$name_a")"
    while IFS= read -r name_b; do
      [ -z "$name_b" ] && continue
      if [ "$name_b" = "$kebab" ] || [ "$name_b" = "$name_a" ]; then
        printf '%s\t%s\n' "$name_a" "$name_b"
      fi
    done < "$file_b"
  done < "$file_a"
}
