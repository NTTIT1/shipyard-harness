#!/usr/bin/env bash
# run-step.sh: model resolution, Claude vs gateway routing, verdict + exit codes.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT

mkdir -p "$LANES_ROOT/lane2" "$TMPH/fakebin"
export CLAUDE_BIN="$TMPH/fakebin/claude"
# Fake claude: records argv + gateway env, replies with $FAKE_RESULT as -p json output.
cat > "$CLAUDE_BIN" <<'EOF'
#!/usr/bin/env bash
{ printf '%s\n' "$@"; echo "BASE=${ANTHROPIC_BASE_URL:-}"; echo "TOKEN=${ANTHROPIC_AUTH_TOKEN:-}"; echo "PWD=$PWD"; } > "$HARNESS_ROOT/claude.args"
[ -n "${FAKE_EXIT:-}" ] && { echo "API Error: 401 invalid key" >&2; exit "$FAKE_EXIT"; }
python3 -c 'import json,os;print(json.dumps({"type":"result","subtype":"success","is_error":os.environ.get("FAKE_ERR")=="1","result":os.environ["FAKE_RESULT"]}))'
EOF
cat > "$TMPH/fakebin/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$CLAUDE_BIN" "$TMPH/fakebin/curl"
export PATH="$TMPH/fakebin:$PATH"
P="$TMPH/prompt.md"; echo "review the gate" > "$P"
rs() { bash "$REPO/bin/run-step.sh" "$@"; }

st 2 init >/dev/null

# 1. no config at all -> Opus via Claude, agent mapped, cwd = lane dir
FAKE_RESULT=$'all good\nVERDICT: GO' rs 2 senior-gate "$P" > "$TMPH/out"; rc=$?
assert_eq "0" "$rc" "exit 0 on a verdict line"
assert_contains "$(cat "$TMPH/out")" "VERDICT: GO" "prints the step's answer"
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_contains "$A" $'--model\nclaude-opus-5-5' "default model is Opus"
assert_contains "$A" $'--agent\nsenior-gate-reviewer' "senior-gate maps to its agent"
assert_contains "$A" "BASE=" "no gateway for Claude"
assert_contains "$A" "PWD=$LANES_ROOT/lane2" "runs in the lane clone"

# 2. config/models.json default beats the built-in default
echo '{"defaults":{"qc-local":"claude:claude-sonnet-5-5"}}' > "$HARNESS_ROOT/config/models.json"
FAKE_RESULT='LOCAL-QC: PASS' rs 2 qc-local "$P" >/dev/null
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--model\nclaude-sonnet-5-5' "config default used"

# 3. feature state beats config; non-Claude goes through the gateway
st 2 set-json models '{"code-review":"openai:gpt-x"}' >/dev/null
echo '{"providers":{},"gateway_key":"sk-gw-test"}' > "$HARNESS_ROOT/config/providers.json"
echo "/code-review high origin/development...feat/x" > "$P"
FAKE_RESULT='no findings' rs 2 code-review "$P" >/dev/null; rc=$?
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_eq "0" "$rc" "code-review has no verdict requirement"
assert_contains "$A" $'--model\nopenai/gpt-x' "gateway alias is provider/model"
assert_contains "$A" "BASE=http://127.0.0.1:4000" "gateway base url set"
assert_contains "$A" "TOKEN=sk-gw-test" "gateway master key used"
assert_contains "$A" "/code-review high origin/development...feat/x" "prompt passed through"

# 4. verdict only counts on the LAST non-empty line
echo "gate" > "$P"
FAKE_RESULT=$'VERDICT: GO\nactually there are problems\n' rs 2 senior-gate "$P" >/dev/null; rc=$?
assert_eq "3" "$rc" "verdict mid-text is not accepted (exit 3)"

# 5. provider/claude failure -> exit 2 and recorded
FAKE_EXIT=1 FAKE_RESULT=x rs 2 senior-gate "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "claude failure -> exit 2"
FAKE_ERR=1 FAKE_RESULT='rate limited' rs 2 senior-gate "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "is_error result -> exit 2"
LAST="$(st 2 get steps | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["error"])')"
assert_contains "$LAST" "rate limited" "error recorded in steps[]"
EVENTS="$(st 2 get steps | python3 -c 'import json,sys;print(" ".join(e["event"] for e in json.load(sys.stdin)))')"
assert_eq "start end start end start end start end start end start end" "$EVENTS" "start+end recorded per run"

# 6. usage
rs 2 nope "$P" >/dev/null 2>&1; assert_eq "64" "$?" "unknown step -> 64"

finish
