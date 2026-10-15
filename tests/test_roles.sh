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
finish
