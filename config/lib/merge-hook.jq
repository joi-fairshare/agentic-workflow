# Replace every hook command under $event that ends in "# $id" with $entry
# (or remove them when $entry is null). Never touches commands it doesn't own.
def tag: "# " + $id;
def owned: ((.command // "") | endswith(tag));

if $entry != null and ([$entry.hooks[]? | owned] | (length == 0 or any(. == false)))
then error("every command in the entry must end with '" + tag + "'")
else
  .hooks = (
    (.hooks // {}) as $h
    | $h + {
        ($event): (
          [ ($h[$event] // [])[]
            | .hooks = [ (.hooks // [])[] | select(owned | not) ]
            | select(.hooks | length > 0) ]
          + (if $entry == null then [] else [$entry] end)
        )
      }
  )
  | if (.hooks[$event] | length) == 0 then .hooks |= del(.[$event]) else . end
end
