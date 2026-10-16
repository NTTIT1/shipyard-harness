#!/usr/bin/env bash
# run-step.sh: model resolution, Claude vs gateway routing, verdict + exit codes.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT

mkdir -p "$LANES_ROOT/lane2" "$TMPH/fakebin"
export CLAUDE_BIN="$TMPH/fakebin/claude"
# Fake claude: records argv + gateway env, replies with $FAKE_RESULT as -p json output.
cat > "$CLAUDE_BIN" <<'EOF'
#!/usr/bin/env bash
{ printf '%s\n' "$@"; echo "BASE=${ANTHROPIC_BASE_URL:-}"; echo "TOKEN=${ANTHROPIC_AUTH_TOKEN:-}"; echo "PWD=$PWD"; echo "OPUS=${ANTHROPIC_DEFAULT_OPUS_MODEL:-}"; echo "SONNET=${ANTHROPIC_DEFAULT_SONNET_MODEL:-}"; echo "HAIKU=${ANTHROPIC_DEFAULT_HAIKU_MODEL:-}"; echo "STDIN=$(readlink /proc/self/fd/0)"; } > "$HARNESS_ROOT/claude.args"
[ -n "${FAKE_ERRJSON:-}" ] && { echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"API Error: 529 overloaded_error"}'; exit 1; }
[ -n "${FAKE_EXIT:-}" ] && { echo "API Error: 401 invalid key" >&2; exit "$FAKE_EXIT"; }
python3 -c 'import json,os
d={"type":"result","subtype":"success","is_error":os.environ.get("FAKE_ERR")=="1","result":os.environ["FAKE_RESULT"]}
if os.environ.get("FAKE_USAGE"): d["modelUsage"]={"claude-opus-5-5":{"inputTokens":120,"outputTokens":30,"cacheReadInputTokens":900,"cacheCreationInputTokens":40,"costUSD":0.75}}
print(json.dumps(d))'
EOF
cat > "$TMPH/fakebin/curl" <<'EOF'
#!/usr/bin/env bash
[ -n "${FAKE_CURL_FAIL:-}" ] && exit 7
exit 0
EOF
cat > "$TMPH/fakebin/docker" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$CLAUDE_BIN" "$TMPH/fakebin/curl" "$TMPH/fakebin/docker"
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

# 6. hardening
echo "gate" > "$P"
# 6.1 real error text from stdout JSON, empty stderr
FAKE_ERRJSON=1 FAKE_RESULT=x rs 2 senior-gate "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "stdout error JSON -> exit 2"
LAST="$(st 2 get steps | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["error"])')"
assert_contains "$LAST" "API Error: 529 overloaded_error" "error text taken from stdout JSON result"
# 6.2 stdin is /dev/null
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" "STDIN=/dev/null" "claude stdin is /dev/null"
# 6.3 gateway aliases for opus/sonnet/haiku
FAKE_RESULT='ok' rs 2 code-review "$P" >/dev/null
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_contains "$A" "OPUS=openai/gpt-x" "opus alias -> gateway alias"
assert_contains "$A" "SONNET=openai/gpt-x" "sonnet alias -> gateway alias"
# 6.4 Claude branch drops inherited gateway env
FAKE_RESULT='VERDICT: GO' ANTHROPIC_BASE_URL=http://x ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_OPUS_MODEL=o ANTHROPIC_DEFAULT_SONNET_MODEL=s ANTHROPIC_DEFAULT_HAIKU_MODEL=h rs 2 senior-gate "$P" >/dev/null
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_contains "$A" $'BASE=\nTOKEN=\n' "claude branch: no inherited base url/token"
assert_contains "$A" $'OPUS=\nSONNET=\nHAIKU=\n' "claude branch: no inherited model aliases"
# 6.5 oversized prompt -> 64, no claude call
rm -f "$HARNESS_ROOT/claude.args"
head -c 120000 /dev/zero | tr '\0' 'a' > "$TMPH/big.md"
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$TMPH/big.md" >/dev/null 2>"$TMPH/err"; rc=$?
assert_eq "64" "$rc" "oversized prompt -> 64"
assert_contains "$(cat "$TMPH/err")" "too large" "oversized prompt message"
[ ! -e "$HARNESS_ROOT/claude.args" ]; assert_eq "0" "$?" "claude not called for oversized prompt"
# 6.6 gateway unreachable and start fails
FAKE_CURL_FAIL=1 FAKE_RESULT=ok rs 2 code-review "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "gateway down + start fails -> exit 2"
LAST="$(st 2 get steps | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["error"])')"
assert_contains "$LAST" "gateway not reachable" "gateway failure recorded"
# 6.7 missing gateway_key
echo '{"providers":{}}' > "$HARNESS_ROOT/config/providers.json"
FAKE_RESULT=ok rs 2 code-review "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "no gateway_key -> exit 2"
LAST="$(st 2 get steps | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["error"])')"
assert_contains "$LAST" "no gateway_key" "missing key recorded"
echo '{"providers":{},"gateway_key":"sk-gw-test"}' > "$HARNESS_ROOT/config/providers.json"
# 6.8 plan-critic has no --agent
FAKE_RESULT=ok rs 2 plan-critic "$P" >/dev/null
case "$(cat "$HARNESS_ROOT/claude.args")" in *--agent*) assert_eq "no agent" "agent" "plan-critic has no --agent";; *) assert_eq 1 1 x;; esac
# 6.9 record failure is reported on stderr, non-fatal
chmod -R a-w "$HARNESS_ROOT/state/lane2"
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null 2>"$TMPH/err"; rc=$?
chmod -R u+w "$HARNESS_ROOT/state/lane2"
assert_eq "0" "$rc" "record failure is non-fatal"
assert_contains "$(cat "$TMPH/err")" "harness: run-step: could not record step event" "record failure reported"

# 7. usage
rs 2 nope "$P" >/dev/null 2>&1; assert_eq "64" "$?" "unknown step -> 64"

# role steps map to their agents and require a ROLE-STEP verdict line
for pair in pm:pm-agent ba:ba-agent arch:architect-agent design:designer-agent test:tester-agent; do
  step="${pair%%:*}"; agent="${pair#*:}"
  FAKE_RESULT=$'wrote it\nROLE-STEP: DONE spec.md' rs 2 "$step" "$P" > "$TMPH/out"; rc=$?
  assert_eq "0" "$rc" "$step exits 0 on a ROLE-STEP verdict"
  assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--agent\n'"$agent" "$step maps to $agent"
done
FAKE_RESULT='I forgot the verdict' rs 2 pm "$P" >/dev/null 2>&1; rc=$?
assert_eq "3" "$rc" "a role step without ROLE-STEP verdict exits 3"
assert_contains "$(st 2 get steps)" "did not end with a ROLE-STEP" "the missing verdict is recorded on the step"

# 8. effort: feature state -> config/models.json effort -> none; only for Claude models; bad levels ignored
st 2 set-json models '{}' >/dev/null
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
case "$(cat "$HARNESS_ROOT/claude.args")" in *--effort*) assert_eq "no effort" "effort" "no effort flag by default";; *) assert_eq 1 1 x;; esac
echo '{"defaults":{},"effort":{"senior-gate":"medium","pm":"turbo"}}' > "$HARNESS_ROOT/config/models.json"
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--effort\nmedium' "config effort default used"
st 2 set-json effort '{"senior-gate":"high"}' >/dev/null
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
assert_contains "$(cat "$HARNESS_ROOT/claude.args")" $'--effort\nhigh' "feature effort beats config"
FAKE_RESULT=$'x\nROLE-STEP: DONE' rs 2 pm "$P" >/dev/null
case "$(cat "$HARNESS_ROOT/claude.args")" in *--effort*) assert_eq "ignored" "passed" "invalid effort level ignored";; *) assert_eq 1 1 x;; esac
st 2 set-json models '{"code-review":"openai:gpt-x"}' >/dev/null
st 2 set-json effort '{"code-review":"high"}' >/dev/null
FAKE_RESULT='ok' rs 2 code-review "$P" >/dev/null
case "$(cat "$HARNESS_ROOT/claude.args")" in *--effort*) assert_eq "claude only" "gateway" "no effort for gateway models";; *) assert_eq 1 1 x;; esac

# 9. token usage is appended to run/lane2/usage.jsonl with the step context
st 2 set run_id=run_42 >/dev/null; st 2 set feature_title=Chat >/dev/null
st 2 set-json models '{}' >/dev/null; st 2 set-json effort '{"senior-gate":"high"}' >/dev/null
FAKE_USAGE=1 FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
U="$(tail -1 "$HARNESS_ROOT/run/lane2/usage.jsonl")"
assert_contains "$U" '"step": "senior-gate"' "usage step recorded"
assert_contains "$U" '"effort": "high"' "usage effort recorded"
assert_contains "$U" '"runId": "run_42"' "usage run id recorded"
assert_contains "$U" '"cacheRead": 900' "cache tokens recorded"
assert_contains "$U" '"usd": 0.75' "cost recorded"
FAKE_USAGE=1 FAKE_ERR=1 FAKE_RESULT='overloaded' rs 2 senior-gate "$P" >/dev/null 2>&1
assert_eq "2" "$(wc -l < "$HARNESS_ROOT/run/lane2/usage.jsonl" | tr -d ' ')" "usage recorded even when the step fails"

# 10. per-lane model defaults & per-feature model config in config/models.json
echo '{"defaults":{"senior-gate":"claude:claude-opus-5-5"},"lanes":{"2":{"senior-gate":"claude:claude-sonnet-5-5","effort":{"senior-gate":"low"}}}}' > "$HARNESS_ROOT/config/models.json"
st 2 set-json effort '{}' >/dev/null
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_contains "$A" $'--model\nclaude-sonnet-5-5' "per-lane model default beats global default"
assert_contains "$A" $'--effort\nlow' "per-lane effort default used"

echo '{"defaults":{"senior-gate":"claude:claude-opus-5-5"},"lanes":{"2":{"senior-gate":"claude:claude-sonnet-5-5"}},"features":{"run_42":{"senior-gate":"claude:claude-haiku-5-5","effort":{"senior-gate":"medium"}}}}' > "$HARNESS_ROOT/config/models.json"
FAKE_RESULT='VERDICT: GO' rs 2 senior-gate "$P" >/dev/null
A="$(cat "$HARNESS_ROOT/claude.args")"
assert_contains "$A" $'--model\nclaude-haiku-5-5' "per-feature model config beats per-lane default"
assert_contains "$A" $'--effort\nmedium' "per-feature effort config used"

finish

