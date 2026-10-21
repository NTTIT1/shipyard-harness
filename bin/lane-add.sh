#!/usr/bin/env bash
# Provision a brand-new lane in the next free slot (1-9): clone + deps +
# migrate + seed. Writes state so the dashboard shows progress.
#   lane-add.sh [--and-up] [--profile P --source REPO [--origin URL] [--db-prefix X]]
#     --and-up   also boots the stack afterwards
#     --profile  bind the new lane to another project (multi-project lanes): its
#                profile, source repo and DB prefix go to config/lanes/lane<N>.env
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
AND_UP=0; BIND_PROFILE=""; BIND_SOURCE=""; BIND_ORIGIN=""; BIND_DB_PREFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --and-up) AND_UP=1 ;;
    --profile) BIND_PROFILE="${2:-}"; shift ;;
    --source) BIND_SOURCE="${2:-}"; shift ;;
    --origin) BIND_ORIGIN="${2:-}"; shift ;;
    --db-prefix) BIND_DB_PREFIX="${2:-}"; shift ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done
if [ -n "$BIND_PROFILE" ]; then
  [[ "$BIND_PROFILE" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "invalid profile name '$BIND_PROFILE'"
  [ -f "$HARNESS_ROOT/profiles/$BIND_PROFILE/profile.env" ] || die "profile '$BIND_PROFILE' not found"
  [ -d "$BIND_SOURCE/.git" ] || die "--source must be a git repo (got '$BIND_SOURCE')"
  [ -z "$BIND_DB_PREFIX" ] && BIND_DB_PREFIX="$(echo "$BIND_PROFILE" | tr '-' '_')_l"
  [[ "$BIND_DB_PREFIX" =~ ^[a-z][a-z0-9_]*$ ]] || die "invalid db prefix '$BIND_DB_PREFIX'"
fi

N=""
for n in 1 2 3 4 5 6 7 8 9; do
  [ ! -d "$LANES_ROOT/lane$n" ] && { N="$n"; break; }
done
[ -n "$N" ] || die "all lane slots 1-9 are occupied"

if [ -n "$BIND_PROFILE" ]; then
  mkdir -p "$HARNESS_ROOT/config/lanes"
  {
    echo "# Lane $N is bound to project profile '$BIND_PROFILE' (written by lane-add.sh; removed by lane-remove.sh)."
    printf 'PROFILE=%q\n' "$BIND_PROFILE"
    printf 'SOURCE_REPO=%q\n' "$BIND_SOURCE"
    printf 'ORIGIN_URL=%q\n' "${BIND_ORIGIN:-$BIND_SOURCE}"
    printf 'DB_PREFIX=%q\n' "$BIND_DB_PREFIX"
  } > "$HARNESS_ROOT/config/lanes/lane$N.env"
  echo "harness: lane $N bound to profile $BIND_PROFILE ($BIND_SOURCE)"
fi
echo "harness: provisioning new lane $N at $(lane_dir "$N") ..."
"$HARNESS_ROOT/bin/state.sh" "$N" init >/dev/null
# status=provisioning (a dedicated loading state — the dashboard shows a spinner
# and does NOT present the lane as ready until bootstrap fully finishes).
"$HARNESS_ROOT/bin/state.sh" "$N" set stage=provisioning status=provisioning \
  feature_title="(provisioning new lane…)" notes="setting up clone, deps, DB, MCPs, agents, sessions" >/dev/null

# HARNESS_PROVISION_STATE=1 makes bootstrap emit per-step progress to the state.
# LANE_DEV_QC_EMAIL/PASSWORD (when passed by the dashboard add modal) flow through
# to lane-qa-creds so the new lane's dev-QC account is set non-interactively.
if HARNESS_PROVISION_STATE=1 "$HARNESS_ROOT/bin/lane-bootstrap.sh" "$N"; then
  if [ "$AND_UP" == 1 ]; then
    "$HARNESS_ROOT/bin/state.sh" "$N" set stage=provisioning status=provisioning notes="booting stack" >/dev/null
    "$HARNESS_ROOT/bin/lane-up.sh" "$N"
  fi
  "$HARNESS_ROOT/bin/state.sh" "$N" init >/dev/null   # clean idle = READY (only now)
  echo "harness: lane $N ready -> $(lane_fe_url "$N")  (clone: $(lane_dir "$N"))"
else
  "$HARNESS_ROOT/bin/state.sh" "$N" set stage=bootstrap-failed status=failed \
    notes="bootstrap failed; see logs/dashboard-actions.log" >/dev/null
  die "lane $N bootstrap failed"
fi
