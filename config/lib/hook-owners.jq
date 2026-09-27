# One TSV line per hook command: event, matcher, owner, command.
(.hooks // {}) | to_entries[] | .key as $event
| .value[] | (.matcher // "") as $matcher
| (.hooks // [])[] | (.command // "") as $cmd
| (($cmd | capture("# (?<id>aw:[a-z0-9-]+)$") | .id)
   // (if ($cmd | test("prism-route")) then "prism" else "other" end)) as $owner
| "\($event)\t\($matcher)\t\($owner)\t\($cmd)"
