#!/usr/bin/env bash
set -euo pipefail

# For each "camelCase<TAB>kebab-case" pair in pairs_file, diff the two
# skills' SKILL.md content and print a verdict line: "IDENTICAL\t<a>\t<b>"
# or "DIFFERS\t<a>\t<b>". Never prints the diff body — the user reads the
# actual files herself; this only tells her which pairs need a look.
# Decides whether a single diff_skill_pairs verdict for pair "$a" (the camelCase/aw-side
# name) should refuse a profile write, given a space-separated list of exact-name pairs
# (autoplan, cso, verify-web) that are never gated — those are excluded from the profile
# entirely (overriding by name would also hit the project's own copy), so their verdict
# never matters here.
#
# Revised 2026-09-27 (RF-6): the 11 case-fold pairs' web-app kebab-case skills are
# intentional, adapted ports — smaller, repo-specific, carrying a "Part of the
# agentic-workflow skill family" preamble — not stale duplicates. DIFFERS is therefore
# expected and informational for those, not a refusal. MISSING still refuses: turning
# the camelCase copy "off" when the kebab-case copy doesn't exist would remove the
# skill entirely.
skill_pair_refuse() {
  local verdict="$1" a="$2" exact_name_pairs="$3"
  case " $exact_name_pairs " in
    *" $a "*) return 1 ;;
  esac
  [ "$verdict" = "MISSING" ]
}

diff_skill_pairs() {
  local aw_dir="$1" wa_dir="$2" pairs_file="$3"
  while IFS=$'\t' read -r a b; do
    [ -z "$a" ] && continue
    local file_a="$aw_dir/$a/SKILL.md" file_b="$wa_dir/$b/SKILL.md"
    if [ ! -f "$file_a" ] || [ ! -f "$file_b" ]; then
      printf 'MISSING\t%s\t%s\n' "$a" "$b"
      continue
    fi
    if diff -q "$file_a" "$file_b" > /dev/null 2>&1; then
      printf 'IDENTICAL\t%s\t%s\n' "$a" "$b"
    else
      printf 'DIFFERS\t%s\t%s\n' "$a" "$b"
    fi
  done < "$pairs_file"
}
