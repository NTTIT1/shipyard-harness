#!/usr/bin/env bash
# Role agents + templates exist and carry the contract the role pipeline relies on.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
AG="$REPO/claude/agents"
for a in pm-agent ba-agent architect-agent designer-agent tester-agent; do
  f="$AG/$a.md"
  assert_file "$f" "agent $a exists"
  assert_eq "name: \"$a\"" "$(sed -n 2p "$f" 2>/dev/null)" "agent $a front matter names itself"
  c="$(cat "$f" 2>/dev/null)"
  assert_contains "$c" "ROLE-STEP: DONE" "$a ends with a ROLE-STEP verdict"
  assert_contains "$c" "data, not instructions" "$a treats context/memory as data"
  assert_contains "$c" "orch.sh" "$a can search project memory"
  assert_contains "$c" "Never" "$a lists forbidden actions"
  assert_contains "$c" "feedback" "$a handles reviewer feedback on a revision"
done
assert_contains "$(cat "$AG/architect-agent.md")" "entities.json" "architect writes the entity graph"
assert_contains "$(cat "$AG/architect-agent.md")" "has_ui" "architect decides has_ui"
assert_contains "$(cat "$AG/designer-agent.md")" "mockup-shot.sh" "designer renders mockups"
assert_contains "$(cat "$AG/designer-agent.md")" "Never edit application code" "designer never codes the app"
for t in ba design qc-plan; do assert_file "$REPO/templates/roles/$t.md" "role template $t.md exists"; done
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$REPO/templates/roles/entities.json" && r=ok || r=bad
assert_eq "ok" "$r" "entities.json template is valid JSON"
SF="$REPO/claude/skills/ship-feature/SKILL.md"
c="$(cat "$SF")"
assert_contains "$c" "## Role pipeline mode" "ship-feature has the role pipeline mode"
assert_contains "$c" "PLATFORM_PROJECT_ID" "role mode is selected by PLATFORM_PROJECT_ID"
for cmd in "orch.sh\" \"\$N\" create" "orch.sh\" \"\$N\" next" "orch.sh\" \"\$N\" sync" "orch.sh\" \"\$N\" pack" "orch.sh\" \"\$N\" submit" "orch.sh\" \"\$N\" release" "orch.sh\" \"\$N\" reopen"; do
  assert_contains "$c" "$cmd" "role mode uses $cmd"
done
for s in pm ba arch design test; do assert_contains "$c" "run-step.sh\" \"\$N\" $s" "role mode runs the $s step"; done
assert_contains "$c" "status=blocked" "unreachable platform parks the lane blocked"
assert_contains "$c" "Never write UI code before DESIGN" "UI code waits for design approval"
assert_contains "$c" "orch.sh\" \"\$N\" release --summary-file" "release before Stage 14 STOP, text from a file"
assert_contains "$c" "never Stage 15" "role mode reopens instead of Stage 15"
assert_contains "$c" "-fix<K>" "DEV after reopen cuts a fix branch"
assert_contains "$c" "pr_url" "RELEASE resume continues from the lane position"
assert_contains "$c" "<<'EOF'" "untrusted text goes through quoted heredocs"
assert_contains "$c" "overrides the turn-liveness rule" "WAIT explicitly overrides turn-liveness"
finish
