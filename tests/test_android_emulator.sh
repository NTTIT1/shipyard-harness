#!/usr/bin/env bash
# The shared Android emulator: one for the machine (Shipyard's own, emulator-5580), booted on demand, held
# by one lane at a time while it QCs its APK (uninstall → install → clear data), stopped when idle.
# adb/emulator/maestro are fakes here.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
check() { if [ "$2" == "$3" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "  FAIL: $1"; echo "        expected: $3"; echo "        actual:   $2"; fi; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/config/lanes" "$T/profiles/shop" "$T/fake" "$T/lanes/lane3/mobile/build" "$T/lanes/lane4/mobile/build"
for f in _common.sh lane-lock.sh android-emulator.sh mobile-qc.sh _android.sh; do cp "$REPO/bin/$f" "$T/bin/"; done
printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/state.sh"; chmod +x "$T/bin/"*.sh
cp "$REPO/config/lanes.env" "$T/config/"
printf 'PROFILE="shop"\nLANES_ROOT="%s/lanes"\n' "$T" > "$T/config/local.env"
printf 'APP_KIND="mobile"\nMOBILE_DIR="mobile"\nMOBILE_PACKAGE="com.example.shop"\nMOBILE_API_DEFINE="API_URL"\nMOBILE_APK="mobile/build/app.apk"\n' > "$T/profiles/shop/profile.env"
echo apk > "$T/lanes/lane3/mobile/build/app.apk"; echo apk > "$T/lanes/lane4/mobile/build/app.apk"

# Fake adb: Shipyard's emulator-5580 is up while $T/fake/running exists; $T/fake/other is someone else's
# device. Calls without ANDROID_SERIAL=emulator-5580 fail like real adb does with two devices.
cat > "$T/fake/adb" <<'EOS'
#!/usr/bin/env bash
F="$FAKE_DIR"
echo "adb $* SERIAL=${ANDROID_SERIAL:-}" >> "$F/calls"
case "$1" in
  devices) echo "List of devices attached"; [ -f "$F/running" ] && printf 'emulator-5580\tdevice\n'; [ -f "$F/other" ] && printf 'emulator-5554\tdevice\n' ;;
  shell) [ "${ANDROID_SERIAL:-}" = emulator-5580 ] || { echo "error: more than one device/emulator" >&2; exit 1; }
         if [ "$2" = getprop ]; then [ -f "$F/noboot" ] && echo 0 || echo 1; fi ;;
  install) [ -f "$F/installfail" ] && exit 1 ;;
  emu) [ "${ANDROID_SERIAL:-}" = emulator-5580 ] && rm -f "$F/running" ;;
esac
exit 0
EOS
cat > "$T/fake/emulator" <<'EOS'
#!/usr/bin/env bash
echo "emulator $*" >> "$FAKE_DIR/calls"
touch "$FAKE_DIR/running"
EOS
printf '#!/usr/bin/env bash\nexit 0\n' > "$T/fake/maestro"
chmod +x "$T/fake/"*
run() { env -u PROFILE -u PROFILE_DIR -u LANES_ROOT -u ANDROID_SERIAL HARNESS_ROOT="$T" FAKE_DIR="$T/fake" PATH="$T/fake:/usr/bin:/bin" ANDROID_HOME="$T/nosdk" "$@"; }
calls() { grep -c -- "$1" "$T/fake/calls" 2>/dev/null || true; }
held() { [ -d "$T/locks/android-emulator.held" ] && echo held || echo free; }

# 1. Without the SDK the QC step says so, and exits 4.
out="$(env -u PROFILE -u PROFILE_DIR HARNESS_ROOT="$T" PATH="/usr/bin:/bin" ANDROID_HOME="$T/nosdk" bash "$T/bin/mobile-qc.sh" 3 prepare 2>&1)"; rc=$?
check "no SDK → exit 4" "$rc" "4"
check "no SDK → says how to install" "$(echo "$out" | grep -c 'Chưa cài Android SDK')" "1"

# 2. A device that never finishes booting: start gives up (exit 3) instead of hanging.
touch "$T/fake/noboot"
run EMULATOR_BOOT_TIMEOUT=2 bash "$T/bin/android-emulator.sh" start >/dev/null 2>&1; rc=$?
check "boot never completes → exit 3" "$rc" "3"
rm -f "$T/fake/noboot" "$T/fake/running"; : > "$T/fake/calls"

# 3. prepare: lock, boot, then uninstall → install -r → pm clear, in that order.
run bash "$T/bin/mobile-qc.sh" 3 prepare >/dev/null 2>&1; rc=$?
check "prepare ok" "$rc" "0"
order="$(grep -oE 'uninstall|install -r|pm clear' "$T/fake/calls" | tr '\n' ',')"
check "uninstall, install, clear data" "$order" "uninstall,install -r,pm clear,"
check "lane 3 holds the emulator" "$(awk '{print $1}' "$T/locks/android-emulator.held/owner")" "lane3"

# 4. Lane 4 while lane 3 holds it: waits and never installs over lane 3's app.
: > "$T/fake/calls"
run LOCK_WAIT=1 bash "$T/bin/mobile-qc.sh" 4 prepare >/dev/null 2>&1; rc=$?
check "lane 4 cannot take it" "$([ "$rc" -ne 0 ] && echo refused)" "refused"
check "lane 4 installed nothing" "$(calls 'install -r')" "0"

# 5. The holder re-runs prepare (a retried step): it goes through instead of waiting on itself (I7).
run LOCK_WAIT=1 bash "$T/bin/mobile-qc.sh" 3 prepare >/dev/null 2>&1; rc=$?
check "the holder re-prepares" "$rc" "0"

# 6. Idle: not stopped while held; stopped once released and idle long enough.
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "held → still running" "$([ -f "$T/fake/running" ] && echo running)" "running"
run bash "$T/bin/mobile-qc.sh" 3 release >/dev/null 2>&1
check "released" "$(held)" "free"
echo 0 > "$T/run/android/last-used"
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "idle → stopped" "$([ -f "$T/fake/running" ] && echo running || echo stopped)" "stopped"

# 7. A lane died holding the emulator: past LOCK_MAX_HOLD the lock no longer keeps it running (I3).
touch "$T/fake/running"; echo 0 > "$T/run/android/last-used"
mkdir -p "$T/locks/android-emulator.held"; echo "lane3 1" > "$T/locks/android-emulator.held/owner"
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "stale holder → stopped" "$([ -f "$T/fake/running" ] && echo running || echo stopped)" "stopped"
rm -rf "$T/locks/android-emulator.held"

# 8. Someone else's emulator, never used by Shipyard on this machine: idle-stop leaves it alone (I4).
rm -f "$T/fake/running" "$T/run/android/last-used"; touch "$T/fake/other"; : > "$T/fake/calls"
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "other emulator untouched" "$(calls ' emu ')" "0"
check "other device still there" "$([ -f "$T/fake/other" ] && echo there)" "there"

# 9. With that other device plugged in: Shipyard starts its own on port 5580 and every call targets it (I5).
: > "$T/fake/calls"
run bash "$T/bin/mobile-qc.sh" 4 prepare >/dev/null 2>&1; rc=$?
check "prepare works next to another device" "$rc" "0"
check "emulator started on port 5580" "$(calls 'emulator .*-port 5580')" "1"
check "install targets emulator-5580" "$(grep 'install -r' "$T/fake/calls" | grep -c 'SERIAL=emulator-5580')" "1"
run bash "$T/bin/mobile-qc.sh" 4 release >/dev/null 2>&1
rm -f "$T/fake/other"

# 10. Install fails after the lock was taken: exit 8 and the lock is given back (I7).
touch "$T/fake/installfail"
run bash "$T/bin/mobile-qc.sh" 4 prepare >/dev/null 2>&1; rc=$?
check "install fails → exit 8" "$rc" "8"
check "lock released after the failure" "$(held)" "free"
rm -f "$T/fake/installfail"

# 11. A missing APK is reported before anything is locked.
rm -f "$T/lanes/lane4/mobile/build/app.apk"
run bash "$T/bin/mobile-qc.sh" 4 prepare >/dev/null 2>&1; rc=$?
check "no APK → exit 5" "$rc" "5"
check "no APK → nothing locked" "$(held)" "free"

for s in android-setup.sh android-emulator.sh mobile-qc.sh _android.sh lane-lock.sh; do
  check "bash -n $s" "$(bash -n "$REPO/bin/$s" 2>&1 && echo ok)" "ok"
done
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
