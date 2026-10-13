#!/usr/bin/env bash
# regen — OPTIONAL hook: regenerate derived/generated artifacts after a merge.
# Only called when profile.env sets GENERATED_MERGE_PATHS (files that get a
# keep-ours merge driver instead of being hand-merged). Regenerate each listed
# artifact from source here; the caller stages + folds the result into the
# merge commit. Worked example (an OpenAPI contract regenerated from the API):
#   OUT="$LANE_DIR/$FRONTEND_DIR/contracts/openapi.json"
#   ( cd "$LANE_DIR/$BACKEND_DIR" && uv run python scripts/generate_openapi.py > "$OUT.tmp" )
#   mv "$OUT.tmp" "$OUT"
set -euo pipefail
echo "harness: TODO — implement 'regen' for your stack (edit this stub; a worked example is in the comment above)" >&2
exit 1
