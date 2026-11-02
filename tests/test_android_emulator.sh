#!/usr/bin/env bash
# The shared Android emulator: one for the machine, booted on demand, held by one lane at a time while it
# QCs its APK (uninstall → install → clear data), stopped when idle. adb/emulator/maestro are fakes here.
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

# Fakes: adb logs every call; the device is "running" while $T/fake/running exists; boot completes
# unless $T/fake/noboot exists. `emulator` marks the device running.
cat > "$T/fake/adb" <<EOF
#!/usr/bin/env bash
echo "adb \$*" >> "$T/fake/calls"
case "\$1" in
  devices) echo "List of devices attached"; [ -f "$T/fake/running" ] && printf 'emulator-5554\tdevice\n' ;;
  shell) if [ "\$2" = getprop ]; then [ -f "$T/fake/noboot" ] && echo 0 || echo 1; fi ;;
  emu) rm -f "$T/fake/running" ;;
esac
exit 0
EOF
printf '#!/usr/bin/env bash\necho "emulator $*" >> "%s/fake/calls"\ntouch "%s/fake/running"\n' "$T" "$T" > "$T/fake/emulator"
printf '#!/usr/bin/env bash\nexit 0\n' > "$T/fake/maestro"
chmod +x "$T/fake/"*
run() { env -u PROFILE -u PROFILE_DIR -u LANES_ROOT HARNESS_ROOT="$T" PATH="$T/fake:/usr/bin:/bin" ANDROID_HOME="$T/nosdk" "$@"; }
calls() { grep -c "$1" "$T/fake/calls" 2>/dev/null || true; }

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

# 5. Idle: not stopped while held; stopped once released and idle long enough.
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "held → still running" "$([ -f "$T/fake/running" ] && echo running)" "running"
run bash "$T/bin/mobile-qc.sh" 3 release >/dev/null 2>&1
check "released" "$([ -d "$T/locks/android-emulator.held" ] && echo held || echo free)" "free"
echo 0 > "$T/run/android/last-used"
run EMULATOR_IDLE_SEC=1 bash "$T/bin/android-emulator.sh" idle-stop >/dev/null 2>&1
check "idle → stopped" "$([ -f "$T/fake/running" ] && echo running || echo stopped)" "stopped"

# 6. A missing APK is reported before anything is locked.
rm -f "$T/lanes/lane4/mobile/build/app.apk"
run bash "$T/bin/mobile-qc.sh" 4 prepare >/dev/null 2>&1; rc=$?
check "no APK → exit 5" "$rc" "5"
check "no APK → nothing locked" "$([ -d "$T/locks/android-emulator.held" ] && echo held || echo free)" "free"

for s in android-setup.sh android-emulator.sh mobile-qc.sh _android.sh; do
  check "bash -n $s" "$(bash -n "$REPO/bin/$s" 2>&1 && echo ok)" "ok"
done
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
