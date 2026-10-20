#!/usr/bin/env bash
# Which engine implements the DEV step for lane <N> (dashboard: AI & Chi phí → "DEV — viết code").
#   dev-engine.sh <N>   ->  "openhands <provider/model>"  or  "session"
# "session" = the lane's main Claude session codes (ship-feature Stage 1, the default).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
require_lane "${1:-}"
N="$1"
R="$(python3 "$CODE_ROOT/bin/step_model.py" "$(lane_state_file "$N")" "$HARNESS_ROOT/config/models.json" dev "$N")"
MODEL="${R%%$'\t'*}"
case "$MODEL" in
  openhands:?*) echo "openhands ${MODEL#openhands:}" ;;
  *) echo "session" ;;
esac
