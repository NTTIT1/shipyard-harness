#!/usr/bin/env bash
# run-step.sh on a mobile project (profile APP_KIND=mobile): browser QC becomes the emulator QC agent,
# and a step set to OpenHands (no Flutter in its images) runs on Claude instead. Web lanes are untouched.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
mkdir -p "$LANES_ROOT/lane2" "$TMPH/fakebin" "$TMPH/profiles/testprof"
export CLAUDE_BIN="$TMPH/fakebin/claude"
cat > "$CLAUDE_BIN" <<'EOS'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$HARNESS_ROOT/claude.args"
echo "SERIAL=${ANDROID_SERIAL:-}" > "$HARNESS_ROOT/claude.env"
python3 -c 'import json,os; print(json.dumps({"type":"result","subtype":"success","is_error":False,"result":os.environ["FAKE_RESULT"]}))'
EOS
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPH/fakebin/curl"
chmod +x "$TMPH/fakebin/"*
export PATH="$TMPH/fakebin:$PATH"
P="$TMPH/prompt.md"; echo "QC the feature" > "$P"
rs() { bash "$REPO/bin/run-step.sh" "$@"; }
st 2 init >/dev/null

# Web project: qc-local stays qc-local.
: > "$TMPH/profiles/testprof/profile.env"
FAKE_RESULT=$'ok\nLOCAL-QC: PASS' rs 2 qc-local "$P" >/dev/null; rc=$?
assert_eq "0" "$rc" "web qc-local runs"
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--agent\nqc-local' "web project keeps the browser QC agent"

# Mobile project: qc-local runs the emulator QC agent, same verdict line.
printf 'APP_KIND="mobile"\nMOBILE_PACKAGE="com.example.shop"\nMOBILE_APK="mobile/build/app.apk"\n' > "$TMPH/profiles/testprof/profile.env"
FAKE_RESULT=$'ok\nLOCAL-QC: PASS — 4 kịch bản' rs 2 qc-local "$P" > "$TMPH/out"; rc=$?
assert_eq "0" "$rc" "mobile qc-local runs"
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--agent\nqc-mobile' "mobile project uses the emulator QC agent"
assert_contains "$(cat "$TMPH/out")" "LOCAL-QC: PASS" "same verdict line"
assert_eq "SERIAL=emulator-5580" "$(cat "$HARNESS_ROOT/claude.env")" "the QC agent targets Shipyard's emulator"

# Mobile project, TEST set to OpenHands: runs on Claude (OpenHands images have no Flutter).
st 2 set-json models '{"test":"openhands:gpt-x"}' >/dev/null
rm -f "$HARNESS_ROOT/claude.args"
FAKE_RESULT=$'checked\nROLE-STEP: DONE test' rs 2 test "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "0" "$rc" "mobile test step runs"
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--agent\ntester-agent' "it ran on Claude"
# Mobile project, DEV set to OpenHands: the lane's own Claude session implements it.
st 2 set-json models '{"dev":"openhands:gpt-x"}' >/dev/null
assert_eq "session" "$(bash "$REPO/bin/dev-engine.sh" 2 2>/dev/null)" "mobile DEV stays in the session"
: > "$TMPH/profiles/testprof/profile.env"
assert_eq "openhands gpt-x" "$(bash "$REPO/bin/dev-engine.sh" 2 2>/dev/null)" "web DEV still honours OpenHands"
finish
