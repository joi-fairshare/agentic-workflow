---
title: "fix: Serena Swift LSP self-healing bridge"
type: fix
status: completed
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-serena-swift-lsp-self-healing-requirements.md
---

# fix: Serena Swift LSP self-healing bridge

## Overview

The Swift LSP bridge between the Serena Docker container and the macOS-native
`sourcekit-lsp` process breaks in three distinct ways, all requiring a manual
session restart today. This plan addresses all three with targeted changes to
`scripts/serena-docker` and `Dockerfile.serena-swift`.

## Problem Statement / Motivation

Three failure modes cause Swift LSP to silently disappear (see origin doc):

1. **Session-restart socket inode desync (most common)** — `serena-docker`
   deletes and recreates the socket file on each invocation, but an already-running
   container holds a bind-mount to the old inode. `connect()` inside the container
   returns `ECONNREFUSED` forever. The container's `/proc/self/fd/` shows the inode
   has `Links: 0` — it was unlinked from the filesystem, but socat still holds it
   open. Result: `check_onboarding_performed` times out after 4 minutes.

2. **`sleep 1` startup race** — on a slow machine or one under load, socat may not
   have finished binding the socket by the time `docker run` executes. The container
   mounts a socket file that isn't listening yet, and the one-shot shim fails
   immediately with ECONNREFUSED at startup — no retry possible.

3. **One-shot shim, no startup retry** — the current shim is `exec socat - UNIX-CONNECT:...`.
   If the socket isn't ready at startup (race with `sleep 1`), it fails immediately with
   no retry. Serena's `LanguageServerManager._ensure_functional_ls()` *does* restart the
   shim on subsequent requests, but the initial startup failure during `from_languages()`
   raises `LanguageServerManagerInitialisationError` and crashes the entire Serena instance.
   A startup retry window in the shim prevents this.

## Proposed Solution

Three targeted changes, each mapping to one requirement from the origin doc:

**R1 — Named container eviction** (`scripts/serena-docker`):
Add `CONTAINER_NAME="serena-${REPO_NAME}"`. Before creating the new socket, run
`docker stop`/`docker rm` on any existing container with that name. Add `--name`
to the `docker run` invocation. This guarantees the new container always holds the
current socket inode.

**R2 — Socket wait loop** (`scripts/serena-docker`):
Replace `sleep 1` (line 74) with a `while` loop that polls for the socket file's
existence, checking every 0.1–0.5s up to ~10s. If the socket never appears, fall
back to the standard image (existing behaviour). This eliminates the race without
increasing normal-case startup latency.

**R3 — Retry shim** (`Dockerfile.serena-swift`):
Replace the one-shot `exec socat` with a startup retry loop: attempt
`socat - UNIX-CONNECT:/tmp/sourcekit-lsp.sock` with back-off for up to ~30s.
After a successful connection closes (for any reason), exit and let Serena's
`LanguageServerManager._ensure_functional_ls()` restart the shim — mid-session
reconnect is handled by Serena, not the shim.
**Requires image rebuild**: `BUILD_SWIFT=1 ./setup.sh`.

## Technical Considerations

### R1 — Named container eviction

```bash
# In scripts/serena-docker, add before socket creation (~line 63):
CONTAINER_NAME="serena-${REPO_NAME}"

# Pre-flight eviction — runs only in the Swift bridge path
if docker inspect "${CONTAINER_NAME}" &>/dev/null; then
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm   "${CONTAINER_NAME}" 2>/dev/null || true
fi
```

Add to `docker run` options:
```bash
DOCKER_OPTS=("--name" "${CONTAINER_NAME}" "--rm" "-i" ...)
```

**Naming collision caveat (G7)**: `REPO_NAME` is derived from `basename`. Two
repos with the same directory name (e.g. `~/work/myapp` and `~/personal/myapp`)
would produce the same `CONTAINER_NAME`. This is accepted for now — the eviction
semantics are still correct (old container stops, new one starts). Document as
known limitation.

**Orphaned host socat (G1)**: When a new session starts, any prior socat process
is orphaned (no longer owned by the now-exited bash wrapper). Kill it before
spawning a new one using the socket path as a search key:

```bash
# Kill any prior socat still holding the socket FD
pkill -f "socat.*UNIX-LISTEN:${SOCKET_PATH}" 2>/dev/null || true
# Also remove the stale file
rm -f "${SOCKET_PATH}"
```

Place this after `SOCKET_PATH` is set, before spawning the new socat.

### R2 — Socket wait loop

Replace lines 73–83 in `scripts/serena-docker`:

```bash
# Wait for socat to bind the socket (up to 10s in 0.2s increments)
_wait=0; _max=50   # 50 × 0.2s = 10s
while [ ! -S "${SOCKET_PATH}" ] && [ "${_wait}" -lt "${_max}" ]; do
  sleep 0.2
  _wait=$(( _wait + 1 ))
done

if [ ! -S "${SOCKET_PATH}" ] || ! kill -0 "${SWIFT_SOCAT_PID}" 2>/dev/null; then
  echo "WARN: Swift LSP bridge failed to bind within 10s. Falling back to standard image." >&2
  IMAGE="serena-local:${BASE_VERSION}"
  SOCKET_PATH=""
  SWIFT_SOCAT_PID=""
else
  echo "Swift LSP bridge active (pid=${SWIFT_SOCAT_PID}, socket=${SOCKET_PATH})" >&2
fi
```

### R3 — Retry shim

**DQ1 resolved**: Serena's `LanguageServerManager._ensure_functional_ls()` detects
`is_running() == False` and calls `restart_language_server()`, which re-invokes the
shim as a fresh subprocess. Mid-session reconnect is Serena's responsibility — the
shim only needs a startup retry window.

**DQ2 resolved** (verified locally): `socat - UNIX-CONNECT:/nonexistent.sock` exits 1
on `ECONNREFUSED`. After a successful connection, both clean remote EOF (sourcekit-lsp
connection close) and Serena stdin shutdown produce exit 0. No exit code ambiguity.

Replace the `RUN printf` block in `Dockerfile.serena-swift` (lines 29–31):

```dockerfile
RUN printf '%s\n' \
    '#!/bin/sh' \
    '# Startup retry loop — up to ~30s for the host socat to bind the socket.' \
    '# After a successful connection closes (any reason), exit and let Serena' \
    '# restart us via LanguageServerManager._ensure_functional_ls().' \
    '_delay=1; _attempts=0; _max=15' \
    'while [ "${_attempts}" -lt "${_max}" ]; do' \
    '  socat - UNIX-CONNECT:/tmp/sourcekit-lsp.sock' \
    '  [ "$?" -eq 0 ] && exit 0  # Connected once; exit cleanly on close' \
    '  _attempts=$(( _attempts + 1 ))' \
    '  sleep "${_delay}"' \
    '  [ "${_delay}" -lt 4 ] && _delay=$(( _delay + 1 ))' \
    'done' \
    'exit 1  # Never connected within retry window' \
    > /usr/local/bin/sourcekit-lsp \
    && chmod +x /usr/local/bin/sourcekit-lsp
```

This gives ~30s of startup retry (1+2+3+4×12 = ~54s worst-case) before giving up.
On the fast path (socket already exists), it connects on the first attempt with zero
additional latency.

### R4 — Image rebuild

Changing `Dockerfile.serena-swift` requires a rebuild. The existing `setup.sh`
auto-triggers the Swift build when `.swift` files are found in the repo (lines
465–508), but will skip if the image already exists. To force a rebuild:

```bash
BUILD_SWIFT=1 ./setup.sh   # from ~/repos/agentic-workflow/
```

## System-Wide Impact

- **Interaction graph**: `serena-docker` is the sole entry point for the container.
  Named container eviction adds a blocking `docker stop`/`rm` step before socket
  creation — adds ~0.5–1s on session restart with a prior container running; ~0ms
  when no prior container exists.
- **Error propagation**: R2 fallback path (socket timeout) falls through to the
  existing `IMAGE="serena-local:${BASE_VERSION}"` assignment. Behaviour is identical
  to the current "swift image not found" fallback — no new user-visible error path.
- **State lifecycle risks**: The `--name` flag combined with `--rm` means Docker
  auto-removes the container on normal exit. Pre-flight eviction only runs if a
  prior container is still alive (e.g. orphaned after a signal/crash). No risk of
  dangling named containers accumulating.
- **API surface parity**: TypeScript LSP path is unaffected. The Swift bridge block
  is gated by `grep -qE '^[[:space:]]*-[[:space:]]*swift'` in `project.yml`.

## Acceptance Criteria

- [x] Starting a new Claude Code session after a prior one left a running Serena
      container does not produce `ECONNREFUSED` inside the container (R1).
- [x] `docker ps` shows at most one container named `serena-<repo>` at any time (R1).
- [x] On a machine under load (socat slow to bind), Serena waits up to 10s before
      falling back — does not silently lose Swift LSP for a fast-binding socat (R2).
- [x] If `sourcekit-lsp` crashes mid-session, Swift LSP resumes on the next Serena
      request (Serena's `_ensure_functional_ls()` restarts the shim; host socat fork
      mode spawns a new sourcekit-lsp child on reconnect) (R3).
- [x] `BUILD_SWIFT=1 ./setup.sh` rebuilds the Swift image successfully with the new
      shim content (R4).
- [x] No new system-level daemons or launchd agents introduced (from success criteria
      in origin doc).
- [x] Orphaned host socat processes from prior sessions are killed before a new one
      is spawned (G1 gap).

## Resolved Questions

**DQ1 — Shim reinvocation behaviour** ✅ *Resolved*
`LanguageServerManager._ensure_functional_ls()` in `src/serena/ls_manager.py` calls
`restart_language_server()` whenever `is_running()` returns False on a request. This
re-invokes the shim binary fresh. Mid-session reconnect is handled at the Serena
manager layer — the shim's retry loop is startup-only.

**DQ2 — Socat exit codes** ✅ *Resolved*
Verified: `socat - UNIX-CONNECT:/nonexistent.sock` exits 1 on `ECONNREFUSED`.
After a successful connection, both clean shutdown and remote EOF exit 0. The retry
logic (`[ "$?" -eq 0 ] && exit 0`) is correct.

## Dependencies & Risks

- **`--rm` + `--name` interaction**: Docker supports `--rm` with `--name`; the
  container auto-removes on exit. Pre-flight eviction handles the case where the
  prior container is still running (not yet removed by `--rm`). Low risk.
- **`docker stop` timeout**: Default 10s SIGTERM grace period before SIGKILL. For a
  Serena container this is nearly instant (no state to flush). Acceptable.
- **Bash 3 compatibility** (`scripts/serena-docker` is `bash` but may run on macOS
  system bash 3.2): `(( _wait++ ))` syntax is not available; use
  `_wait=$(( _wait + 1 ))`. Verify all arithmetic with POSIX-safe syntax.

## Files to Change

| File | Lines affected | Change |
|------|---------------|--------|
| `scripts/serena-docker` | ~63–86 | Add `CONTAINER_NAME`, orphaned socat kill, socket wait loop, `--name` flag |
| `Dockerfile.serena-swift` | 29–31 | Replace one-shot shim with retry loop |

**After editing**: run `BUILD_SWIFT=1 ./setup.sh` then start a new Claude Code
session to test.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-24-serena-swift-lsp-self-healing-requirements.md](../brainstorms/2026-03-24-serena-swift-lsp-self-healing-requirements.md)
  — Key decisions carried forward: named container over anonymous `--rm`; shim-level
  retry over Docker restart policy; silent mid-session reconnect.
- `scripts/serena-docker` — primary implementation target (114 lines)
- `Dockerfile.serena-swift` — shim source (32 lines)
- `setup.sh:465–508` — Swift image build, `BUILD_SWIFT` override, `SERENA_VERSION` derivation
- `skills/_shared/skill-lock.sh:61–110` — existing exponential-backoff pattern in repo
