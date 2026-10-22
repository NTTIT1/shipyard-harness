#!/usr/bin/env bash
# Which account Claude Code runs on: the machine's login by default; the Anthropic API key only when
# "Nhà cung cấp AI" says so and there is one; back to the login when the key fails (bin/claude_auth.py).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap 'teardown_temp_harness' EXIT

mkdir -p "$LANES_ROOT/lane2/specs/f1" "$TMPH/fakebin"
export CLAUDE_BIN="$TMPH/fakebin/claude"
# Fake claude: logs which account it ran on; with $FAKE_BADKEY a key is rejected like the real CLI does.
cat > "$CLAUDE_BIN" <<'FAKE'
#!/usr/bin/env bash
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then echo "key:${ANTHROPIC_API_KEY:0:10}"; else echo login; fi >> "$HARNESS_ROOT/accounts"
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ -n "${FAKE_BADKEY:-}" ]; then
  echo '{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Fix external API key"}'; exit 1
fi
echo '{"type":"result","subtype":"success","is_error":false,"result":"wrote spec.md\nROLE-STEP: DONE spec.md"}'
FAKE
chmod +x "$CLAUDE_BIN"
P="$TMPH/prompt.md"; echo "write the spec" > "$P"
st 2 init >/dev/null; st 2 set spec_dir=specs/f1 run_id=run_a >/dev/null
providers() { printf '%s' "$1" > "$HARNESS_ROOT/config/providers.json"; }
rs() { rm -f "$HARNESS_ROOT/accounts"; bash "$REPO/bin/run-step.sh" 2 pm "$P" >"$TMPH/out" 2>"$TMPH/err"; }
accounts() { paste -sd, "$HARNESS_ROOT/accounts" 2>/dev/null; }
KEY='{"anthropic":{"api_key":"sk-ant-api03-TESTKEY"}}'

# 1. default: the login, even with a key saved and one in the environment
providers "{\"providers\":$KEY}"
ANTHROPIC_API_KEY=sk-ant-api03-INHERITED rs; rc=$?
assert_eq "0" "$rc" "login: step runs"
assert_eq "login" "$(accounts)" "login: no API key reaches claude"

# 2. api_key mode with a usable key: the key
providers "{\"claude_auth\":\"api_key\",\"providers\":$KEY}"
rs; rc=$?
assert_eq "0" "$rc" "api_key: step runs"
assert_eq "key:sk-ant-api" "$(accounts)" "api_key: the saved key is used"
assert_contains "$(cat "$TMPH/err")" "chạy bằng API key Anthropic" "says which account"
assert_eq "0" "$(cat "$TMPH/err" "$TMPH/out" | grep -c TESTKEY)" "the key is never printed"

# 3. the key is rejected: same step reruns on the login, and the key is skipped afterwards
FAKE_BADKEY=1 rs; rc=$?
assert_eq "0" "$rc" "bad key: step still succeeds"
assert_eq "key:sk-ant-api,login" "$(accounts)" "bad key: rerun on the login"
assert_contains "$(cat "$TMPH/err")" "chạy lại bằng tài khoản đăng nhập" "explains the fallback"
assert_eq "1" "$([ -f "$HARNESS_ROOT/run/claude_auth_fail.json" ] && echo 1)" "failure remembered"
rs
assert_eq "login" "$(accounts)" "next step goes straight to the login for a while"

# 4. no key / a key Claude Code cannot use: the login
rm -f "$HARNESS_ROOT/run/claude_auth_fail.json"
providers '{"claude_auth":"api_key","providers":{}}'
rs; assert_eq "login" "$(accounts)" "api_key mode without a key -> login"
providers '{"claude_auth":"api_key","providers":{"anthropic":{"api_key":"sk-ant-usr-x"}}}'
rs; assert_eq "login" "$(accounts)" "non sk-ant-api key -> login"

# 5. the helper itself
assert_eq "0" "$(python3 "$REPO/bin/claude_auth.py" is-auth-error 'API Error: 401 {"type":"authentication_error"}'; echo $?)" "401 is a key error"
assert_eq "1" "$(python3 "$REPO/bin/claude_auth.py" is-auth-error 'tests failed in billing module'; echo $?)" "a normal failure is not"
finish
