#!/usr/bin/env bash
# The pipeline lane N runs after the code (bin/delivery.py: profile < project default frozen into the
# run < this lane's override), as JSON — for the dashboard's "Quy trình của lane".
#   lane-pipeline.sh <N>
set -euo pipefail
_HARNESS_PIPELINE_DONE=1   # read the profile's own values here, not the already-resolved ones
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
require_lane "${1:-}"
INTEGRATION_BRANCH="${INTEGRATION_BRANCH:-}" BASE_BRANCH="${BASE_BRANCH:-}" \
CI_WAIT_ENABLED="${CI_WAIT_ENABLED:-0}" CI_DEPLOY_CONTEXT="${CI_DEPLOY_CONTEXT:-}" \
DEV_QC_ENABLED="${DEV_QC_ENABLED:-0}" DEV_SITE_URL="${DEV_SITE_URL:-}" TRACKER_ENABLED="${TRACKER_ENABLED:-0}" \
  exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/delivery.py" show "$(lane_state_file "$1")" \
  "$HARNESS_ROOT/config/lanes/lane$1.pipeline.json"
