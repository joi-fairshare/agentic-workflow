# One TSV line per hook command: event, matcher, owner, command.
# Handles both the nested shape (Claude Code / Codex: entry.hooks[].command)
# and the flat shape (Cursor: entry.command).
(.hooks // {}) | to_entries[] | .key as $event
| .value[] | (.matcher // "") as $matcher
| (if has("hooks") then (.hooks // [])[] else . end) | (.command // "") as $cmd
| (($cmd | capture("# (?<id>aw:[a-z0-9-]+)$") | .id)
   // (if ($cmd | test("prism-route")) then "prism" else "other" end)) as $owner
| "\($event)\t\($matcher)\t\($owner)\t\($cmd)"
