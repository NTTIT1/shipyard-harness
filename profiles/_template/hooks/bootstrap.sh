#!/usr/bin/env bash
# bootstrap — install your app's dependencies in this lane clone.
# Env from run_hook: LANE LANE_DIR API_PORT FE_PORT DATABASE_URL REDIS_URL
#   UPLOAD_DIR DB_NAME API_BASE FE_URL RUN_DIR LOG_DIR PROFILE_DIR SOURCE_REPO
#   HARNESS_ROOT + every key from your profile.env (BACKEND_DIR, FRONTEND_DIR, …).
set -euo pipefail
# Worked example (CI=true is scoped to the install: pnpm prompts before
# purging node_modules and hard-aborts with no TTY; never export CI globally —
# it flips app behavior like CI-only test workers):
#   ( cd "$LANE_DIR/$BACKEND_DIR"  && uv sync --extra dev )
#   ( cd "$LANE_DIR/$FRONTEND_DIR" && CI=true pnpm install --frozen-lockfile )
echo "harness: TODO — implement 'bootstrap' for your stack (edit this stub; a worked example is in the comment above)" >&2
exit 1
