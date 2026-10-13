#!/usr/bin/env bash
# migrate — apply DB migrations to this lane's DB. DATABASE_URL is exported.
set -euo pipefail
# Worked example:
#   ( cd "$LANE_DIR/$BACKEND_DIR" && uv run python -m app.db.migrate upgrade )
echo "harness: TODO — implement 'migrate' for your stack (edit this stub; a worked example is in the comment above)" >&2
exit 1
