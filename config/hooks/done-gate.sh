#!/usr/bin/env bash
# aw:done-gate — Stop hook (main sessions). RF-3 first: stop_hook_active
# means this is our own re-invocation from a prior "continue" — exit 0
# unconditionally before touching anything else, so this can never loop.
set -uo pipefail
[ -n "${AW_JUDGE_CHILD:-}" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

STOP_HOOK_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')"
[ "$STOP_HOOK_ACTIVE" = "true" ] && exit 0

TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')"
[ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || exit 0

# Last complete assistant text turn: grab every whole line whose top-level
# "type" is "assistant" (tail a generous window, not the whole file — a
# transcript can be large), then pick the last one and pull out its text.
# jq itself does the real JSON parse; grep only narrows which whole lines get
# handed to jq, it never extracts a sub-object by hand (never a `[^}]*`
# regex, which breaks on any nested object in the line).
LAST_ASSISTANT_LINE="$(tail -c 1048576 "$TRANSCRIPT" 2>/dev/null | grep '"type":"assistant"' | tail -n 1)"
if [ -z "$LAST_ASSISTANT_LINE" ]; then
  # Rare fallback: even a 1MB tail didn't contain an assistant line — a long
  # run of huge hook-attachment payloads (deferred-tool listings, full skill
  # text, etc.) after the last assistant turn can push it further back than
  # that (2026-09-27 finding: a real headless session did exactly this,
  # making this hook a silent no-op for a bare "Done." with no evidence).
  # Scan the whole file once rather than allowing a done-claim through
  # unevaluated; this path is rare, so the cost of a full scan is acceptable.
  LAST_ASSISTANT_LINE="$(grep '"type":"assistant"' "$TRANSCRIPT" 2>/dev/null | tail -n 1)"
fi
[ -n "$LAST_ASSISTANT_LINE" ] || exit 0
# message.content is real-world either a bare string or an array of blocks
# (scorer/src/transcript/parse-line.ts's own schema confirms both shapes) —
# branch on its type rather than assuming array-shaped content.
CLAIM_TEXT="$(printf '%s' "$LAST_ASSISTANT_LINE" | jq -r '
  if (.message.content | type) == "string" then .message.content
  else ([.message.content[]? | select(.type=="text") | .text] | join("\n"))
  end
' 2>/dev/null)"
[ -n "$CLAIM_TEXT" ] || exit 0

SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
SESSIONS_DIR="${AW_JUDGE_SESSIONS_DIR:-${AW_STATE_DIR:-$HOME/.agentic-workflow}/judge/sessions}"

if ! printf '%s' "$CLAIM_TEXT" | grep -qiE '\b(done|complete|finished|ready for review|merged|shipped)\b'; then
  # Not a done claim — ask whether auto-continue is already authorized
  # (Task 4, N2/R2). judge ask-check's own CLI contract is inverted from
  # every other subcommand here: exit 2 means "continue" (don't actually
  # stop), exit 0 means "ask" (a real stop is fine).
  ASK_INPUT="$(jq -nc --arg t "$CLAIM_TEXT" '{transcriptTail: $t}')"
  set +e
  printf '%s' "$ASK_INPUT" | judge ask-check > /dev/null 2>&1
  ASK_RC=$?
  set -e
  if [ "$ASK_RC" -eq 2 ] && [ -n "$SESSION_ID" ]; then
    mkdir -p "$SESSIONS_DIR"
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{auto_continued_at: $ts}' > "$SESSIONS_DIR/$SESSION_ID.json" 2>/dev/null || true
    exit 2
  fi
  exit 0
fi

BRIEF_JSON="$(judge brief get "task:$SESSION_ID" 2>/dev/null || true)"

if [ -z "$BRIEF_JSON" ]; then
  # RF-2: no brief at all — only check that SOME evidence is mentioned.
  if printf '%s' "$CLAIM_TEXT" | grep -qiE '(https?://|npm (run|test)|pytest|vitest|PR #[0-9]+)'; then
    exit 0
  fi
  echo "Claiming done with no evidence mentioned (no command output, no PR link, no test run). Show the proof." >&2
  exit 2
fi

ACCEPTANCE="$(printf '%s' "$BRIEF_JSON" | jq -r '.acceptanceCriteria // empty')"
if [ -n "$ACCEPTANCE" ] && ! printf '%s' "$CLAIM_TEXT" | grep -qiF "$(printf '%s' "$ACCEPTANCE" | cut -c1-40)"; then
  echo "Claiming done, but the acceptance criteria (\"$ACCEPTANCE\") doesn't appear addressed in the claim. Show how it's met." >&2
  exit 2
fi
exit 0
