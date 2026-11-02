#!/usr/bin/env bash
# Mobile QC of lane N on the shared emulator: around the qc-mobile agent's Maestro flows.
#   mobile-qc.sh <N> prepare   # hold the emulator, boot it, put THIS lane's APK on it with clean data
#   mobile-qc.sh <N> release   # let the next lane have it (ALWAYS run, also after a failure)
# Exit: 4 no Android SDK · 5 no APK (run the lane's ci-gate first) · 6 no package id · 7 lock not
# acquired in LOCK_WAIT · 3 emulator did not boot · 8 install failed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
N="${1:?usage: mobile-qc.sh <lane> prepare|release}"
source "$HERE/_common.sh" "$N"
source "$HERE/_android.sh"
LANE_DIR="$(lane_dir "$N")"

case "${2:-}" in
  prepare)
    for t in adb emulator maestro; do
      command -v "$t" >/dev/null 2>&1 || { echo "Chưa cài Android SDK — chạy bin/android-setup.sh (thiếu $t)" >&2; exit 4; }
    done
    APK="$LANE_DIR/${MOBILE_APK:-}"
    [ -n "${MOBILE_APK:-}" ] && [ -f "$APK" ] || { echo "Chưa có APK ($APK) — chạy hooks/ci-gate.sh của lane trước" >&2; exit 5; }
    [ -n "${MOBILE_PACKAGE:-}" ] || { echo "Profile chưa có MOBILE_PACKAGE (package id của app)" >&2; exit 6; }
    "$HERE/lane-lock.sh" acquire "$EMULATOR_LOCK" "$N" "${LOCK_WAIT:-1800}" || exit 7
    rc=0; "$HERE/android-emulator.sh" start || rc=$?
    if [ "$rc" -ne 0 ]; then "$HERE/lane-lock.sh" release "$EMULATOR_LOCK" "$N" >/dev/null 2>&1 || true; exit "$rc"; fi
    adb uninstall "$MOBILE_PACKAGE" >/dev/null 2>&1 || true
    if ! adb install -r "$APK"; then
      "$HERE/lane-lock.sh" release "$EMULATOR_LOCK" "$N" >/dev/null 2>&1 || true
      echo "Không cài được APK lên máy ảo" >&2; exit 8
    fi
    adb shell pm clear "$MOBILE_PACKAGE" >/dev/null 2>&1 || true
    "$HERE/android-emulator.sh" touch
    echo "harness: lane $N đang giữ máy ảo — app $MOBILE_PACKAGE đã cài, dữ liệu sạch"
    ;;
  release)
    "$HERE/android-emulator.sh" touch || true
    "$HERE/lane-lock.sh" release "$EMULATOR_LOCK" "$N"
    ;;
  *) echo "usage: mobile-qc.sh <lane> prepare|release" >&2; exit 2 ;;
esac
