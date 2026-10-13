#!/usr/bin/env bash
# Boot a lane's stack via the active profile's boot + health hooks.
#   lane-up.sh <N> [--no-build] [--qc]
#   --no-build  reuse the existing FE build
#   --qc        apply the profile's QC_BOOT_ENV first (set-if-unset) — the
#               standard boot for QC/e2e stacks (stubs paid/LLM backends etc.)
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
require_lane "${1:-}"
N="$1"; shift
BUILD=1; QC=0
for a in "$@"; do case "$a" in
  --no-build) BUILD=0 ;;
  --qc)       QC=1 ;;
  *) die "unknown arg '$a' (usage: lane-up.sh <N> [--no-build] [--qc])" ;;
esac; done
if [ "$QC" = 1 ] && [ -n "$QC_BOOT_ENV" ]; then
  echo "harness: applying profile QC boot env: $QC_BOOT_ENV"
  for kv in $QC_BOOT_ENV; do
    k="${kv%%=*}"
    [ -n "${!k+x}" ] || export "$kv"   # explicit caller env always wins
  done
fi
DIR="$(lane_dir "$N")"
[ -d "$DIR/.git" ] || die "lane $N not bootstrapped (run: lane-bootstrap.sh $N)"

# Defensive: stop any existing stack first so a re-run (e.g. dashboard ▶ up on a
# live lane) can't double-start services / fight over the lane's ports.
"$HARNESS_ROOT/bin/lane-down.sh" "$N" >/dev/null 2>&1 || true

mkdir -p "$(lane_run_dir "$N")" "$(lane_log_dir "$N")" "$(lane_upload_dir "$N")"
API_PORT="$(lane_api_port "$N")"; FE_PORT="$(lane_fe_port "$N")"

# Ensure backend/.env exists (seeded from the source repo's real .env, with the
# per-lane DATABASE_URL/REDIS_URL/UPLOAD_DIR written INTO the file).
"$HARNESS_ROOT/bin/lane-env-seed.sh" "$N" || echo "harness: WARNING — .env seed failed; run bin/lane-env-seed.sh $N"

"$HARNESS_ROOT/bin/state.sh" "$N" set stage=booting status=running
hb_start "$N"; trap hb_stop EXIT   # build may wait on the build-lock + compile

# Lane DBs drift: main/development ship migrations while the lane sits idle,
# and a stale schema cascade-fails 30+ e2e specs later. Ensure the DB exists,
# then apply migrations on every boot (no-op seconds when already current).
if ! docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
     psql -U "$PG_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$(lane_db "$N")'" 2>/dev/null | grep -q 1; then
  echo "harness: lane DB $(lane_db "$N") missing — creating ..."
  docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" createdb -U "$PG_USER" "$(lane_db "$N")"
  NEW_DB=1
else
  NEW_DB=0
fi
echo "harness: applying migrations to $(lane_db "$N") ..."
run_hook "$N" migrate
if [ "$NEW_DB" = 1 ]; then
  echo "harness: seeding fresh DB ..."
  run_hook "$N" seed
fi

echo "harness: booting lane $N stack (profile: $PROFILE) ..."
if [ "$BUILD" == 1 ]; then run_hook "$N" boot; else run_hook "$N" boot --no-build; fi

if run_hook "$N" health; then
  "$HARNESS_ROOT/bin/state.sh" "$N" set stage=live status=running notes="api=:$API_PORT fe=:$FE_PORT"
  echo "harness: lane $N live -> $(lane_fe_url "$N")"
else
  "$HARNESS_ROOT/bin/state.sh" "$N" set stage=boot-failed status=failed \
    notes="health check failed; see logs/lane$N"
  die "lane $N failed to become healthy"
fi
