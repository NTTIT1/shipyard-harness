#!/usr/bin/env bash
# health — exit 0 only when this lane's app is fully ready. API_BASE / FE_URL exported.
# Prefer curl --retry (handles backoff itself; no shell sleep).
set -euo pipefail
# Worked example:
#   curl -fsS --retry 60 --retry-delay 2 --retry-connrefused --max-time 5 "$API_BASE/health" >/dev/null
#   curl -fsS --retry 40 --retry-delay 2 --retry-connrefused --max-time 5 "$FE_URL/login"     >/dev/null
echo "harness: TODO — implement 'health' for your stack (edit this stub; a worked example is in the comment above)" >&2
exit 1
