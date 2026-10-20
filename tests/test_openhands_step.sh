#!/usr/bin/env bash
# OpenHands DEV engine: engine routing, refusals and verdicts that need no Docker/LLM.
# The real sandbox + SDK path is covered by tests/e2e_openhands.sh (needs Docker).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT

LANE="$LANES_ROOT/lane1"; mkdir -p "$LANE"
G() { git -C "$LANE" -c user.name=t -c user.email=t@x -c commit.gpgsign=false "$@"; }
G init -q -b main; G commit -q --allow-empty -m init; G branch development
echo "do DEV" > "$TMPH/prompt.md"
models() { echo "{\"defaults\": {\"dev\": \"$1\"}}" > "$TMPH/config/models.json"; }

# engine resolution
models "claude:claude-opus-5-5"
assert_eq "session" "$(bash "$REPO/bin/dev-engine.sh" 1)" "claude model => main session codes DEV"
models "openhands:anthropic/claude-sonnet-5-5"
assert_eq "openhands anthropic/claude-sonnet-5-5" "$(bash "$REPO/bin/dev-engine.sh" 1)" "openhands engine + gateway alias"

# run-step refuses dev when the engine is the session
models "claude:claude-opus-5-5"
out="$(bash "$REPO/bin/run-step.sh" 1 dev "$TMPH/prompt.md" 2>&1)"; rc=$?
assert_eq "1" "$rc" "run-step dev with session engine exits 1"
assert_contains "$out" "main session" "explains that the session implements DEV"

# branch guard: never let OpenHands code on the integration/main branch
models "openhands:anthropic/claude-sonnet-5-5"
out="$(OPENHANDS_MOCK=1 bash "$REPO/bin/run-step.sh" 1 dev "$TMPH/prompt.md" 2>/dev/null)"; rc=$?
assert_eq "2" "$rc" "on main => blocked"
assert_contains "$out" "ROLE-STEP: BLOCKED lane 1 is on 'main'" "names the wrong branch"

# mock run on a feature branch: task assembled with approved docs, DONE
G switch -q -c feat/x
mkdir -p "$LANE/specs/f"; echo "# tasks: T1" > "$LANE/specs/f/tasks.md"
st 1 init >/dev/null; st 1 set spec_dir=specs/f feature_title="Tính năng X" >/dev/null
out="$(OPENHANDS_MOCK=1 bash "$REPO/bin/run-step.sh" 1 dev "$TMPH/prompt.md" 2>/dev/null)"; rc=$?
assert_eq "0" "$rc" "mock run exits 0"
assert_contains "$out" "ROLE-STEP: DONE OpenHands (mock) on feat/x" "mock verdict"
task="$(cat "$(ls -d "$TMPH"/run/lane1/openhands/dev-* | tail -1)/task.md")"
assert_contains "$task" "# DEV: Tính năng X" "task titled with the feature"
assert_contains "$task" "# tasks: T1" "approved tasks.md attached"
assert_contains "$task" "never switch branches" "rules of the road included"
assert_eq "start,end" "$(st 1 get steps | python3 -c 'import json,sys; print(",".join(s["event"] for s in json.load(sys.stdin) if s["step"]=="dev"))')" "step start/end recorded"

# invalid alias and unconfigured provider are refused before any container starts
out="$(bash "$REPO/bin/openhands-step.sh" 1 "$TMPH/prompt.md" 'bad alias' 2>&1)"; rc=$?
assert_eq "1" "$rc" "invalid alias rejected"
mkdir -p "$TMPH/fakebin"; printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPH/fakebin/docker"; printf '#!/usr/bin/env bash\nexit 0\n' > "$TMPH/fakebin/curl"
chmod +x "$TMPH/fakebin/"*
out="$(PATH="$TMPH/fakebin:$PATH" bash "$REPO/bin/openhands-step.sh" 1 "$TMPH/prompt.md" anthropic/claude-sonnet-5-5 2>/dev/null)"; rc=$?
assert_eq "2" "$rc" "no providers.json => blocked"
assert_contains "$out" "Nhà cung cấp" "tells where to configure"
echo '{"gateway_key":"k","providers":{"anthropic":{"api_key":"a","models":["claude-haiku-5-5"]}}}' > "$TMPH/config/providers.json"
out="$(PATH="$TMPH/fakebin:$PATH" bash "$REPO/bin/openhands-step.sh" 1 "$TMPH/prompt.md" anthropic/claude-sonnet-5-5 2>/dev/null)"
assert_contains "$out" "model 'claude-sonnet-5-5' is not in provider 'anthropic' list" "model must be listed"
[ -z "$(find "$TMPH/run" -name llm.env)" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  FAIL: llm.env left behind"; }

finish
