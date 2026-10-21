#!/usr/bin/env bash
# Multi-project lanes: _common.sh loads config/lanes/lane<N>.env for lane N (first arg or
# HARNESS_LANE) — its PROFILE/SOURCE_REPO/DB_PREFIX — and leaves unbound lanes on the main project.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
check() { if [ "$2" == "$3" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "  FAIL: $1"; echo "        expected: $3"; echo "        actual:   $2"; fi; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/config/lanes" "$T/profiles/mainp" "$T/profiles/other"
cp "$REPO/bin/_common.sh" "$T/bin/"; cp "$REPO/config/lanes.env" "$T/config/"
printf 'PROFILE="mainp"\nSOURCE_REPO="/repos/main"\nDB_PREFIX="main_l"\n' > "$T/config/local.env"
echo 'BACKEND_DIR="main-be"' > "$T/profiles/mainp/profile.env"
echo 'BACKEND_DIR="other-be"' > "$T/profiles/other/profile.env"
echo 'PLATFORM_PROJECT_ID="proj_other"' > "$T/profiles/other/integrations.env"
printf 'PROFILE=other\nSOURCE_REPO=/repos/other\nORIGIN_URL=/repos/other\nDB_PREFIX=other_l\n' > "$T/config/lanes/lane7.env"
probe() { env -u PROFILE -u PROFILE_DIR -u SOURCE_REPO -u DB_PREFIX HARNESS_ROOT="$T" "$@"; }
out="$(probe bash -c 'source "$HARNESS_ROOT/bin/_common.sh" 7; echo "$PROFILE|$BACKEND_DIR|$SOURCE_REPO|$(lane_db 7)|${PLATFORM_PROJECT_ID:-}"')"
check "lane 7 (bound) via first arg" "$out" "other|other-be|/repos/other|other_l7|proj_other"
out="$(probe bash -c 'source "$HARNESS_ROOT/bin/_common.sh" 3; echo "$PROFILE|$BACKEND_DIR|$SOURCE_REPO|$(lane_db 3)"')"
check "lane 3 (unbound) keeps the main project" "$out" "mainp|main-be|/repos/main|main_l3"
out="$(probe HARNESS_LANE=7 bash -c 'source "$HARNESS_ROOT/bin/_common.sh"; echo "$PROFILE|$BACKEND_DIR"')"
check "HARNESS_LANE selects the binding" "$out" "other|other-be"
out="$(probe bash -c 'source "$HARNESS_ROOT/bin/_common.sh" build; echo "$PROFILE"')"
check "a non-lane first arg is ignored" "$out" "mainp"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
