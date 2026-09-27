#!/usr/bin/env bash
# skills/ui-evidence/scripts/doctor.sh — read-only health check mirroring
# verify-web-app's own doctor contract. Exits 0 only when the local stack is
# healthy and reachable at localhost:3000 and owned by this convention's app
# (never "start a second stack" against a foreign process on :3000 — RF-1).
#
# The app's <title> is deployment-specific, so it comes from config, never a
# hardcoded string (see SKILL.md's "Configuration" section): the
# UI_EVIDENCE_APP_TITLE env var, or a local, uncommitted
# .ui-evidence.local.env file next to this skill.
set -uo pipefail
FAILS=()
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CONFIG="${UI_EVIDENCE_CONFIG:-$DIR/../.ui-evidence.local.env}"

if [ -z "${UI_EVIDENCE_APP_TITLE:-}" ] && [ -f "$LOCAL_CONFIG" ]; then
  # shellcheck source=/dev/null
  source "$LOCAL_CONFIG"
fi

if [ -z "${UI_EVIDENCE_APP_TITLE:-}" ]; then
  printf 'ui-evidence doctor: UI_EVIDENCE_APP_TITLE is not set — set it in the environment or in %s (see SKILL.md)\n' "$LOCAL_CONFIG"
  exit 1
fi

LOGIN_HTML="$(curl -s --max-time 5 http://localhost:3000/login 2>/dev/null || true)"
if ! printf '%s' "$LOGIN_HTML" | grep -q "<title>${UI_EVIDENCE_APP_TITLE}</title>"; then
  FAILS+=(":3000 does not look like this app (foreign process, or stack not up) — refusing to double-drive it")
fi

if ! docker exec postgres_container pg_isready -U postgres > /dev/null 2>&1; then
  FAILS+=("postgres_container is not ready")
fi

if ! nc -z localhost 5002 2>/dev/null; then
  FAILS+=("api-server (:5002) is not accepting connections")
fi

if [ "${#FAILS[@]}" -gt 0 ]; then
  printf 'ui-evidence doctor: NOT healthy\n'
  for f in "${FAILS[@]}"; do printf ' - %s\n' "$f"; done
  exit 1
fi
echo "ui-evidence doctor: healthy"
exit 0
