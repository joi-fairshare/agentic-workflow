# Replace every hook command under $event that ends in "# $id" with $entry
# (or remove them when $entry is null). Never touches commands it doesn't own.
#
# Two config shapes:
#   nested (default) — Claude Code settings.json and Codex hooks.json:
#     .hooks[$event] = [{matcher?, hooks: [{type, command, ...}]}]
#   flat ($flat == true) — Cursor hooks.json:
#     {version: 1, hooks: {$event: [{command, matcher?, timeout?, ...}]}}
def tag: "# " + $id;
def owned: ((.command // "") | endswith(tag));
def is_flat: ($ARGS.named.flat // false) == true;

def entry_ok:
  if is_flat then ($entry | owned)
  else ([$entry.hooks[]? | owned] | (length > 0 and all(.)))
  end;

if $entry != null and (entry_ok | not)
then error("every command in the entry must end with '" + tag + "'")
else
  .hooks = (
    (.hooks // {}) as $h
    | $h + {
        ($event): (
          (if is_flat then
             [ ($h[$event] // [])[] | select(owned | not) ]
           else
             [ ($h[$event] // [])[]
               | .hooks = [ (.hooks // [])[] | select(owned | not) ]
               | select(.hooks | length > 0) ]
           end)
          + (if $entry == null then [] else [$entry] end)
        )
      }
  )
  | if (.hooks[$event] | length) == 0 then .hooks |= del(.[$event]) else . end
  | if is_flat then .version = (.version // 1) else . end
end
