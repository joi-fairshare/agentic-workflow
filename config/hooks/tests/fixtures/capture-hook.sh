#!/usr/bin/env bash
# Test double for a canonical hook: records its stdin, argv, cwd and
# AW_HOOK_PROVIDER, then prints $CAPTURE_OUT / $CAPTURE_ERR and exits $CAPTURE_RC.
cat > "${CAPTURE_FILE:?}"
printf '%s\n' "$@" > "$CAPTURE_FILE.argv"
pwd -P > "$CAPTURE_FILE.cwd"
printf '%s' "${AW_HOOK_PROVIDER:-}" > "$CAPTURE_FILE.provider"
[ -n "${CAPTURE_OUT:-}" ] && printf '%s\n' "$CAPTURE_OUT"
[ -n "${CAPTURE_ERR:-}" ] && printf '%s\n' "$CAPTURE_ERR" >&2
exit "${CAPTURE_RC:-0}"
