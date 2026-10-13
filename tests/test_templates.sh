#!/usr/bin/env bash
# Source skills/agents must stay PROJECT-AGNOSTIC: no hardcoded machine path or
# project literal in the templates. The harness path is the @@HARNESS_ROOT@@
# placeholder, baked in only at install time; lane paths resolve at runtime.
#
# Check 1 is a LEAK GUARD driven by THIS install's real config: the active
# profile name, tracker/dev-site identifiers, and machine paths must not appear
# in any git-tracked file (profiles + config/local.env are untracked — a
# project's identity lives only there). Extra patterns can be added one per
# line in config/leak-terms.txt (untracked; extended regex; '#' comments).
# The tracked test itself names no project, yet every install guards its own
# identifiers before anything is committed or published.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SK="$REPO/claude/skills"; AG="$REPO/claude/agents"

cfgval() {  # <VAR> -> value under the real install config (empty if unset)
  bash -c 'source "$1/bin/_common.sh" 2>/dev/null || exit 0; eval "printf %s \"\${$2:-}\""' _ "$REPO" "$1"
}

# --- 1) leak guard -----------------------------------------------------------
leak_hits=""
note_hits() { [ -z "$2" ] || leak_hits="${leak_hits}
  [$1] $(printf '%s' "$2" | head -3)"; }
scan_tracked_fixed() {  # <label> <fixed string> — whole tracked tree
  local t="$2" h; [ -n "$t" ] || return 0
  case "$t" in _template|default) return 0;; esac  # generic defaults, not identifiers
  h="$(git -C "$REPO" grep -I -n -i -F -e "$t" 2>/dev/null || true)"
  note_hits "$1=$t" "$h"
}
scan_tracked_regex() {  # <extended regex> — whole tracked tree
  local p="$1" h; [ -n "$p" ] || return 0
  h="$(git -C "$REPO" grep -I -n -i -E -e "$p" 2>/dev/null || true)"
  note_hits "$p" "$h"
}
scan_templates_fixed() {  # <label> <fixed string> — skills/agents sources only
  local t="$2" h; [ -n "$t" ] || return 0
  h="$(grep -rniF -e "$t" "$SK" "$AG" 2>/dev/null || true)"
  note_hits "$1=$t" "$h"
}

for v in PROFILE TRACKER_PROVIDER TRACKER_PROJECT TRACKER_ASSIGNEE DEV_SITE_URL CI_REPO LANES_ROOT SOURCE_REPO; do
  scan_tracked_fixed "$v" "$(cfgval "$v")"
done
for v in TRACKER_MCP DEV_QC_MCP; do   # install-injected via @@…@@ — sources must use the placeholder
  scan_templates_fixed "$v" "$(cfgval "$v")"
done
scan_tracked_regex '/Users/[A-Za-z0-9._-]+'
scan_tracked_regex '(\$HOME|~)/[A-Za-z0-9._-]+/(lane[0-9]|harness)'
if [ -f "$REPO/config/leak-terms.txt" ]; then
  while IFS= read -r p; do
    case "$p" in ''|'#'*) continue;; esac
    scan_tracked_regex "$p"
  done < "$REPO/config/leak-terms.txt"
fi
assert_eq "" "$leak_hits" "no install identifier / machine path / denylisted term in tracked files"

# 1c) no APP-TOOLCHAIN tool name in the pipeline skill or the agents. These files
#     are copied verbatim into every adopter's project, so naming one stack's
#     tools (pytest / pnpm / openapi-check / build:check / uv / …) misleads an
#     adopter on a different stack. harness-adapt is EXEMPT — enumerating a repo's
#     lockfiles/tools to infer the stack is exactly that skill's job.
tool="$(grep -rniE 'pytest|pnpm|openapi-check|build:check|poetry|\balembic\b|\byarn\b|\buv\b' "$SK" "$AG" | grep -v '/harness-adapt/' || true)"
assert_eq "" "$tool" "no app-toolchain tool name in pipeline skill/agents (harness-adapt exempt)"

# 2) every HARNESS= assignment in the sources uses the placeholder (never a literal)
bad="$(grep -rn 'HARNESS=' "$SK" "$AG" | grep -v '@@HARNESS_ROOT@@' || true)"
assert_eq "" "$bad" "every HARNESS= in sources uses the @@HARNESS_ROOT@@ placeholder"

# 3) the placeholder is actually present, so install has something to populate
assert_ne "" "$(grep -rl '@@HARNESS_ROOT@@' "$SK" "$AG" || true)" "@@HARNESS_ROOT@@ placeholder present in sources"

# 4) the installer's substitution leaves no token behind and bakes the real path
rendered="$(sed "s|@@HARNESS_ROOT@@|/tmp/some/harness|g" "$SK/ship-feature/SKILL.md")"
case "$rendered" in *@@HARNESS_ROOT@@*) tok=remained;; *) tok=gone;; esac
assert_eq "gone" "$tok" "render leaves no @@HARNESS_ROOT@@ token behind"
case "$rendered" in *'HARNESS="/tmp/some/harness"'*) baked=yes;; *) baked=no;; esac
assert_eq "yes" "$baked" "render bakes the real harness path into HARNESS="

# 5) stack/provider lore is parameterized: agents read it via profile-cat.sh, and
#    an install with a real profile actually provides those notes.
assert_ne "" "$(grep -rl 'profile-cat.sh' "$SK" "$AG" || true)" "agents read stack lore via profile-cat.sh"
RP="$(cfgval PROFILE)"
if [ -n "$RP" ] && [ "$RP" != "_template" ] && [ -d "$REPO/profiles/$RP" ]; then
  [ -s "$REPO/profiles/$RP/review-checks.md" ] && r=ok || r=missing
  assert_eq "ok" "$r" "profiles/$RP/review-checks.md provides the active profile's review checks"
  [ -s "$REPO/profiles/$RP/tracker-notes.md" ] && t=ok || t=missing
  assert_eq "ok" "$t" "profiles/$RP/tracker-notes.md provides the active profile's provider notes"
fi

# 7) spec templates exist, are project-agnostic, and spec.md opens with front matter
TP="$REPO/templates/spec"
for t in constitution spec plan tasks; do assert_file "$TP/$t.md" "spec template $t.md exists"; done
assert_eq "---" "$(head -1 "$TP/spec.md")" "spec.md template starts with YAML front matter"
assert_contains "$(cat "$TP/spec.md")" "## Tiêu chí chấp nhận" "spec.md template has acceptance criteria section"
assert_contains "$(cat "$TP/constitution.md" 2>/dev/null)" "MUST" "constitution template explains MUST/SHOULD levels"
assert_contains "$(cat "$TP/tasks.md" 2>/dev/null)" "- [ ] T1" "tasks template shows checkbox task format"

# 8) spec-* skills exist, name themselves, and use the harness placeholder
for s in spec-constitution spec-new spec-plan spec-tasks; do
  f="$SK/$s/SKILL.md"
  assert_file "$f" "skill /$s exists"
  assert_eq "name: $s" "$(sed -n 2p "$f" 2>/dev/null)" "skill /$s front matter names itself"
  assert_contains "$(cat "$f" 2>/dev/null)" '@@HARNESS_ROOT@@' "skill /$s uses the harness placeholder"
done

# 9) ship-feature is spec-driven: Stage 0c approval, committed spec dir, no gitignored lane spec
SF="$SK/ship-feature/SKILL.md"
assert_contains "$(cat "$SF")" "### 0c — Spec approval" "ship-feature has the Stage 0c approval stop"
assert_contains "$(cat "$SF")" "stage=spec-review status=waiting" "Stage 0c parks the lane as spec-review/waiting"
assert_contains "$(cat "$SF")" "Exit 6 — spec dir collision" "ship-feature handles the spec collision exit"
assert_eq "" "$(grep -n 'docs/superpowers/specs' "$SF" || true)" "ship-feature no longer uses the gitignored lane spec"

# 10) agents read the committed spec dir; gate + reviewer enforce the constitution
assert_eq "" "$(grep -rn 'docs/superpowers/specs' "$AG" || true)" "agents no longer use the gitignored lane spec"
assert_contains "$(cat "$AG/senior-gate-reviewer.md")" "specs/constitution.md" "senior gate checks the constitution"
assert_contains "$(cat "$AG/senior-gate-reviewer.md")" "tasks.md" "senior gate checks tasks.md is ticked"
assert_contains "$(cat "$AG/pr-reviewer.md")" "specs/constitution.md" "pr-reviewer checks the constitution"

# 11) review fixes: unique branch slug, follow-up skips Stage-1 setup, exit 6 at publish/sync,
#     constitution looked up on the profile's integration branch, 0c approval words
assert_contains "$(cat "$SF")" "spec-path.sh\" branchslug" "Stage 1 derives a lane-unique branch slug"
assert_contains "$(cat "$SF")" "Follow-up run (Stage 15)" "Stage 1 says what a follow-up skips"
assert_contains "$(cat "$SF")" "Exit 6 (a spec dir collision landed" "Stage 8 preflight handles exit 6"
assert_contains "$(cat "$SF")" "Exit 6 → spec dir collision during sync" "Stage 12 sync handles exit 6"
assert_contains "$(cat "$SF")" 'origin/$INTEGRATION_BRANCH:specs/constitution.md' "constitution looked up on the integration branch"
assert_contains "$(cat "$SF")" "SPEC_DIR=\"\$(\"\$HARNESS/bin/state.sh\" \"\$N\" get spec_dir)\"" "Stage 15 captures the parent spec_dir before init"
assert_contains "$(cat "$SF")" "\`continue\` / \`tiếp tục\` count as approval" "Stage 0c defines continue as approval"

finish
