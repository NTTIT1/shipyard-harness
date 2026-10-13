#!/usr/bin/env bash
# e2e — run your end-to-end suite against the RUNNING integrated stack.
# Two hard rules, both learned the expensive way:
#   1. Run under the shared e2e lock so lanes don't collide:
#        "$HARNESS_ROOT/bin/with-lock.sh" e2e -- <your command>
#   2. ALWAYS bound the run with a wall-clock timeout so a hung suite fails
#      loudly instead of stranding the lane at stage=e2e forever.
# Worked example (Playwright against the lane's RUNNING host stack):
#   rc=0
#   "$HARNESS_ROOT/bin/with-lock.sh" e2e -- bash -c "cd '$LANE_DIR/$FRONTEND_DIR' && \
#     E2E_API_BASE_URL='$API_BASE' E2E_FRONTEND_URL='$FE_URL' DATABASE_URL='$DATABASE_URL' \
#     timeout -k 30 ${E2E_TIMEOUT:-1200} pnpm exec playwright test --reporter=line" || rc=$?
#   if [ "$rc" -eq 124 ]; then
#     echo "e2e: TIMED OUT after ${E2E_TIMEOUT:-1200}s — treating as FAIL (raise E2E_TIMEOUT if the suite legitimately needs longer)." >&2
#   fi
#   exit "$rc"
set -euo pipefail
echo "harness: TODO — implement 'e2e' for your stack (edit this stub; a worked example is in the comment above)" >&2
exit 1
