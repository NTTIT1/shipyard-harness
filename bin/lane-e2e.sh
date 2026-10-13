#!/usr/bin/env bash
# Spec stage 3 (automated part): run the profile's e2e hook against the lane's
# RUNNING feature-branch stack, under e2e.lock. Expects the stack already up
# (via lane-up.sh --qc, so the profile's QC_BOOT_ENV is applied and stubbed
# backends return deterministic responses). Writes lane state.
#   lane-e2e.sh <N>                      # full suite -> stage=e2e-passed
#   lane-e2e.sh <N> -- <playwright args> # SCOPED run (e.g. one spec) -> stage=e2e-scoped
# Scoped runs go through the same lock + timeout + heartbeat as the full suite
# (a bare `pnpm exec playwright test` in the lane heartbeats nothing and the
# dashboard false-flags STALLED). A scoped green never counts as the e2e gate.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
require_lane "${1:-}"
N="$1"; shift
[ "${1:-}" == "--" ] && shift || true
SCOPED=0
if [ $# -gt 0 ]; then SCOPED=1; fi
DIR="$(lane_dir "$N")"
[ -d "$DIR/.git" ] || die "lane $N not bootstrapped"

"$HARNESS_ROOT/bin/state.sh" "$N" set stage=e2e status=running
hb_start "$N"; trap hb_stop EXIT   # e2e can run many minutes (incl. lock wait)
if [ "$SCOPED" = 1 ]; then
  echo "harness: running SCOPED e2e (profile hook): $* ..."
else
  echo "harness: running e2e (profile hook) ..."
fi
run_hook "$N" e2e "$@"
if [ "$SCOPED" = 1 ]; then
  "$HARNESS_ROOT/bin/state.sh" "$N" set stage=e2e-scoped status=running notes="scoped e2e green: $*"
  echo "harness: lane $N — scoped e2e green (NOT the full gate)."
else
  "$HARNESS_ROOT/bin/state.sh" "$N" set stage=e2e-passed status=running
  echo "harness: lane $N — e2e passed."
fi
