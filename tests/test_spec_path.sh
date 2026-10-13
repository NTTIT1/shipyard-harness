#!/usr/bin/env bash
# spec-path.sh: spec dir naming (date + ascii slug), collision suffix, branch slug,
# template lookup (profile override > harness default).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
SP() { bash "$REPO/bin/spec-path.sh" "$@"; }

# --- slugify ---------------------------------------------------------------
assert_eq "xuat-excel-nghi-phep" "$(SP slugify 'Xuất Excel nghỉ phép')" "slugify strips Vietnamese diacritics"
assert_eq "danh-gia-cheo-du-an" "$(SP slugify 'Đánh giá chéo — dự án!!')" "slugify maps đ and collapses punctuation"
assert_eq "50" "$(SP slugify "$(printf 'a%.0s' $(seq 1 80))" | tr -d '\n' | wc -c | tr -d ' ')" "slugify caps at 50 chars"
assert_eq "abc" "$(SP slugify 'abc-')" "slugify trims trailing dash"
SP slugify '!!! 🎉' >/dev/null 2>&1; assert_eq 1 "$?" "slugify of punctuation-only text fails"

# --- new: date prefix + collision suffix -----------------------------------
R="$TMPH/repo"; mkdir -p "$R/specs"
assert_eq "specs/2026-10-12-xuat-excel" "$(SPEC_DATE=2026-10-12 SP new 'Xuất Excel' "$R")" "new = specs/<date>-<slug>"
mkdir -p "$R/specs/2026-10-12-xuat-excel"
assert_eq "specs/2026-10-12-xuat-excel-2" "$(SPEC_DATE=2026-10-12 SP new 'Xuất Excel' "$R")" "new adds -2 on collision"
mkdir -p "$R/specs/2026-10-12-xuat-excel-2"
assert_eq "specs/2026-10-12-xuat-excel-3" "$(SPEC_DATE=2026-10-12 SP new 'Xuất Excel' "$R")" "new adds -3 on second collision"
SP new '!!!' "$R" >/dev/null 2>&1; assert_eq 1 "$?" "new with empty slug fails"
assert_eq "0" "$(ls "$R/specs" | grep -c -- '-$' || true)" "no dash-terminated dir was created"

# --- dirslug ---------------------------------------------------------------
assert_eq "xuat-excel-2" "$(SP dirslug specs/2026-10-12-xuat-excel-2)" "dirslug drops date prefix"
assert_eq "xuat-excel" "$(SP dirslug specs/2026-10-12-xuat-excel/)" "dirslug tolerates trailing slash"

# --- template: default, then profile override ------------------------------
assert_eq "$REPO/templates/spec/spec.md" "$(SP template spec)" "template falls back to harness default"
mkdir -p "$TMPH/profiles/testprof/spec-templates"; echo custom > "$TMPH/profiles/testprof/spec-templates/spec.md"
assert_eq "$TMPH/profiles/testprof/spec-templates/spec.md" "$(SP template spec)" "profile spec-templates override wins"
SP template nope >/dev/null 2>&1; assert_eq 1 "$?" "unknown template fails"

# --- lane-env exposes the branch config the spec skills need ----------------
ENVOUT="$(bash "$REPO/bin/lane-env.sh" 1 2>/dev/null)"
assert_contains "$ENVOUT" "export INTEGRATION_BRANCH='development'" "lane-env emits INTEGRATION_BRANCH"
assert_contains "$ENVOUT" "export BRANCH_PREFIX='feat/'" "lane-env emits BRANCH_PREFIX"

# --- branchslug: unique branch/state slug for this lane (date dropped, -2.. on clash)
L="$LANES_ROOT/lane2"; git init -q -b development "$L"; echo 2 > "$L/.harness-lane"
git -C "$L" -c user.email=t@h -c user.name=t commit -q --allow-empty -m init
BS() { ( cd "$L" && bash "$REPO/bin/spec-path.sh" branchslug "$1" ); }
assert_eq "xuat-excel" "$(BS specs/2026-10-12-xuat-excel)" "branchslug = dirslug when nothing clashes"
git -C "$L" branch feat/xuat-excel
assert_eq "xuat-excel-2" "$(BS specs/2026-10-19-xuat-excel)" "branchslug skips an existing local branch"
git -C "$L" update-ref refs/remotes/origin/feat/xuat-excel-2 HEAD
assert_eq "xuat-excel-3" "$(BS specs/2026-10-19-xuat-excel)" "branchslug skips a branch already on origin"
mkdir -p "$HARNESS_ROOT/state/lane2"; echo '{}' > "$HARNESS_ROOT/state/lane2/xuat-excel-3.json"
assert_eq "xuat-excel-4" "$(BS specs/2026-10-19-xuat-excel)" "branchslug skips an archived lane state record"

finish
