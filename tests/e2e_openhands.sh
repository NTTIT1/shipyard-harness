#!/usr/bin/env bash
# End-to-end OpenHands DEV engine with a fake LLM (needs Docker; first run builds the sandbox image).
#   tests/e2e_openhands.sh
# Proves: run-step routing → image build → sandbox → OpenHands SDK → terminal tool → git commit
# on the feature branch → DONE verdict → usage row (cost from the proxy header) → no key left on disk;
# and that "finished" without a commit is BLOCKED.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "  SKIP: docker not running"; exit 0; }
setup_temp_harness; trap 'kill $MOCK 2>/dev/null; teardown_temp_harness' EXIT
PORT=4599
LANE="$LANES_ROOT/lane1"; mkdir -p "$LANE"
G() { git -C "$LANE" -c user.name=t -c user.email=t@x -c commit.gpgsign=false "$@"; }
G init -q -b main; G commit -q --allow-empty -m init
mkdir -p "$LANE/.shipyard/rules"
echo '{"roles":{"DEV":{"reads":["rules/dev.md"],"skills":[]}}}' > "$LANE/.shipyard/team.json"
printf '# Luật DEV\n- QUY TẮC THỬ: luôn viết test.\n' > "$LANE/.shipyard/rules/dev.md"
G add -A; G commit -qm rules; G branch development; G switch -q -c feat/demo
echo '{"gateway_key":"sk-test-gateway","providers":{"anthropic":{"api_key":"sk-ant-test","models":["claude-sonnet-5-5"]}}}' > "$TMPH/config/providers.json"
echo '{"defaults":{"dev":"openhands:anthropic/claude-sonnet-5-5"}}' > "$TMPH/config/models.json"
echo "Implement tasks.md" > "$TMPH/prompt.md"
run() { GATEWAY_PORT=$PORT OPENHANDS_MAX_ITERATIONS=10 OPENHANDS_TIMEOUT=900 bash "$REPO/bin/run-step.sh" 1 dev "$TMPH/prompt.md" 2>"$TMPH/err"; }

python3 "$REPO/tests/fixtures/mock_llm.py" $PORT "$TMPH/llm.log" & MOCK=$!; sleep 1
out="$(run)"; rc=$?
assert_eq "0" "$rc" "OpenHands run exits 0"
assert_contains "$out" "ROLE-STEP: DONE OpenHands: 1 commit(s) on feat/demo" "DONE only with a commit on the branch"
assert_eq "feat: add hello" "$(G log -1 --format=%s)" "the agent's commit landed in the lane"
assert_eq "OpenHands (Shipyard lane 1)" "$(G log -1 --format=%an)" "commit identity is the sandbox agent"
assert_eq "$(id -un)" "$(stat -c %U "$LANE/hello.txt")" "files owned by the host user, not root"
assert_contains "$(cat "$TMPH/llm.log")" '"has_rules": true' "project AI-team rules reached the model"
assert_contains "$(cat "$TMPH/llm.log")" '"auth_ok": true' "gateway key used as the LLM credential"
assert_contains "$(cat "$TMPH/run/lane1/usage.jsonl")" '"usd": 0.025' "cost from x-litellm-response-cost recorded"
assert_eq "0" "$(grep -rl 'sk-test-gateway\|sk-ant-test' "$TMPH/run" "$TMPH/logs" 2>/dev/null | wc -l)" "no key left in run/ or logs/"
kill $MOCK; wait $MOCK 2>/dev/null

python3 "$REPO/tests/fixtures/mock_llm.py" $PORT "$TMPH/llm.log" nocommit & MOCK=$!; sleep 1
out="$(run)"; rc=$?
assert_eq "2" "$rc" "finished without a commit exits 2"
assert_contains "$out" "ROLE-STEP: BLOCKED OpenHands finished without committing anything" "claims are checked against git"
assert_eq "0" "$(docker ps -a --filter name=shipyard-oh-lane1 --format '{{.Names}}' | wc -l)" "no sandbox container left behind"
finish
