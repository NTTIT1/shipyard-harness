#!/usr/bin/env bash
# The ONE Android emulator of this machine, shared by every lane of a mobile project (one at a time,
# under the "android-emulator" lock — see bin/mobile-qc.sh). Booted on demand, stopped when idle so it
# does not hold 2–4 GB of RAM the web lanes need.
#   android-emulator.sh start      # boot AVD "shipyard" headless if needed; wait until booted (exit 3 if not)
#   android-emulator.sh stop
#   android-emulator.sh status     # running|stopped, and who holds it
#   android-emulator.sh touch      # mark it just used
#   android-emulator.sh idle-stop  # stop it when nobody holds it and it was idle EMULATOR_IDLE_SEC (600)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_common.sh"
source "$HERE/_android.sh"
RUN="$HARNESS_ROOT/run/android"; mkdir -p "$RUN"
HELD="$HARNESS_ROOT/locks/$EMULATOR_LOCK.held"
now() { date +%s; }
running() { command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -qE '^emulator-[0-9]+[[:space:]]+device'; }
booted() { [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; }
mark() { now > "$RUN/last-used"; }

case "${1:-status}" in
  start)
    command -v emulator >/dev/null 2>&1 && command -v adb >/dev/null 2>&1 \
      || { echo "Chưa cài Android SDK — chạy bin/android-setup.sh" >&2; exit 4; }
    if ! running; then
      echo "harness: bật máy ảo Android ($ANDROID_AVD)…"
      nohup emulator -avd "$ANDROID_AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save >"$RUN/emulator.log" 2>&1 &
      echo $! > "$RUN/emulator.pid"
    fi
    limit="${EMULATOR_BOOT_TIMEOUT:-300}"; start=$(now)
    until running && booted; do
      if [ $(( $(now) - start )) -ge "$limit" ]; then
        echo "Máy ảo không khởi động xong trong ${limit}s (xem run/android/emulator.log)" >&2; exit 3
      fi
      sleep 2
    done
    mark; echo "harness: máy ảo Android sẵn sàng"
    ;;
  stop)
    if running; then adb emu kill >/dev/null 2>&1 || true; fi
    if [ -f "$RUN/emulator.pid" ]; then kill "$(cat "$RUN/emulator.pid")" 2>/dev/null || true; rm -f "$RUN/emulator.pid"; fi
    echo "harness: đã tắt máy ảo Android"
    ;;
  status)
    if running; then echo running; else echo stopped; fi
    [ -f "$HELD/owner" ] && echo "held by $(awk '{print $1}' "$HELD/owner")" || true
    ;;
  touch) mark ;;
  idle-stop)
    command -v adb >/dev/null 2>&1 || exit 0
    [ -d "$HELD" ] && exit 0
    running || exit 0
    last="$(cat "$RUN/last-used" 2>/dev/null || echo 0)"
    [[ "$last" =~ ^[0-9]+$ ]] || last=0
    if [ $(( $(now) - last )) -ge "${EMULATOR_IDLE_SEC:-600}" ]; then "$0" stop; fi
    ;;
  *) echo "usage: android-emulator.sh start|stop|status|touch|idle-stop" >&2; exit 2 ;;
esac
