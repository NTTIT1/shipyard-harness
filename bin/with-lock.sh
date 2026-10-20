#!/usr/bin/env bash
# Serialize a heavy step across all lanes via a named lock.
#   with-lock.sh <name> -- <command...>
# Names: build | e2e | qc | integration | openhands  (any string works).
# Parallelism: LOCK_SLOTS_<NAME> (e.g. LOCK_SLOTS_BUILD=2 in config/local.env) lets that many
# lanes hold the lock at once — size it to the machine (RAM/CPU). Default 1 = strictly serial.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

command -v flock >/dev/null 2>&1 || die "flock not found — run: brew install flock"

NAME="${1:?lock name required}"; shift
[ "${1:-}" == "--" ] || die "usage: with-lock.sh <name> -- <command...>"
shift
mkdir -p "$HARNESS_ROOT/locks"
LOCKFILE="$HARNESS_ROOT/locks/$NAME.lock"

# Portable across util-linux flock and macOS `brew install flock` (discoteq):
# hold the lock for the duration of the command, release on exit.
# Bounded wait (LOCK_TIMEOUT, default 30 min): a hung lock-holder produces a
# loud, actionable failure instead of an eternal silent hang. Feature-detect
# `-w` against a probe file; fall back to an unbounded wait if unsupported.
LOCK_TIMEOUT="${LOCK_TIMEOUT:-1800}"
SLOT_VAR="LOCK_SLOTS_$(printf '%s' "$NAME" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_')"
SLOTS="${!SLOT_VAR:-1}"
case "$SLOTS" in ''|*[!0-9]*) SLOTS=1 ;; esac
# Feature-detect `flock -E` on a private probe file (a shared one races between lanes).
PROBE="$LOCKFILE.probe.$$"
if [ "$SLOTS" -gt 1 ] && flock -n -E 75 "$PROBE" true 2>/dev/null && rm -f "$PROBE"; then
  # N slots = N lock files; take the first free one (flock -n exits 75 when it is held).
  echo "harness: acquiring one of $SLOTS '$NAME' slots (timeout ${LOCK_TIMEOUT}s; then running: $*)" >&2
  deadline=$(( $(date +%s) + LOCK_TIMEOUT ))
  while :; do
    for i in $(seq 1 "$SLOTS"); do
      rc=0; flock -n -E 75 "$LOCKFILE.$i" "$@" || rc=$?
      [ "$rc" -eq 75 ] && continue
      exit "$rc"
    done
    [ "$(date +%s)" -lt "$deadline" ] || { echo "harness: no '$NAME' slot free within ${LOCK_TIMEOUT}s" >&2; exit 75; }
    sleep 0.5
  done
fi
echo "harness: acquiring '$NAME' lock (timeout ${LOCK_TIMEOUT}s; then running: $*)" >&2
if flock -w 1 "$LOCKFILE.probe" true 2>/dev/null; then
  rc=0
  flock -w "$LOCK_TIMEOUT" "$LOCKFILE" "$@" || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "harness: '$NAME' step exited rc=$rc — either the wrapped command failed," >&2
    echo "harness: or the lock wasn't acquired within ${LOCK_TIMEOUT}s (holder check:" >&2
    echo "harness:   ps aux | grep -Ei 'build|test|playwright|e2e').  Re-run this step." >&2
    exit "$rc"
  fi
else
  exec flock "$LOCKFILE" "$@"
fi
