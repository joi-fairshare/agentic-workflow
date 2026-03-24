#!/usr/bin/env bash
# browser-lock.sh — compatibility shim for /verify-web.
#
# Sources skills/_shared/skill-lock.sh with LOCK_NAME=browser and provides
# acquire_browser_lock / release_browser_lock aliases for backward compatibility.
#
# To use the generic lock directly instead:
#   LOCK_NAME=browser source skills/_shared/skill-lock.sh
#   acquire_lock / release_lock

LOCK_NAME="${LOCK_NAME:-browser}"
# Forward BROWSER_LOCK_TIMEOUT → SKILL_LOCK_TIMEOUT for compatibility
SKILL_LOCK_TIMEOUT="${BROWSER_LOCK_TIMEOUT:-${SKILL_LOCK_TIMEOUT:-120}}"

SHARED_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../_shared"
# shellcheck source=../_shared/skill-lock.sh
source "$SHARED_DIR/skill-lock.sh"

acquire_browser_lock() { acquire_lock "$@"; }
release_browser_lock() { release_lock "$@"; }
