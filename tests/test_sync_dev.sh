#!/usr/bin/env bash
# lane-sync-dev.sh: the dev-based-flow safety primitive. Exercises the exit-code
# contract against a synthetic origin: 5 = migration-number collision (nothing
# merged), 0 = clean --check / clean merge of origin/development INTO the
# feature branch, 4 = merge conflict left in place (+ --continue finishes).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
ln -s "$REPO/bin" "$TMPH/bin"           # scripts reach state.sh via $HARNESS_ROOT/bin

export MIGRATIONS_DIR="db/migrations"   # temp harness has no profile.env, so this sticks

SYNC="$REPO/bin/lane-sync-dev.sh"
ORIGIN="$TMPH/origin.git"
LANE="$LANES_ROOT/lane1"
PUSHER="$TMPH/pusher"

gitc() { git -C "$1" -c user.email=t@h -c user.name=t "${@:2}"; }

# --- fixture: bare origin with development(001_init.sql); lane1 clone; feature branch
git init -q --bare "$ORIGIN"
git init -q -b development "$TMPH/seed"
mkdir -p "$TMPH/seed/db/migrations"
echo "create table a;" > "$TMPH/seed/db/migrations/001_init.sql"
echo "hello" > "$TMPH/seed/README.md"
gitc "$TMPH/seed" add -A; gitc "$TMPH/seed" commit -qm init
gitc "$TMPH/seed" remote add origin "$ORIGIN"; gitc "$TMPH/seed" push -q origin development
git -C "$ORIGIN" symbolic-ref HEAD refs/heads/development

git clone -q "$ORIGIN" "$LANE"; echo 1 > "$LANE/.harness-lane"
git clone -q "$ORIGIN" "$PUSHER"

bash "$REPO/bin/state.sh" 1 init >/dev/null

# feature branch adds 002_a.sql; meanwhile "another lane" lands 002_b.sql on development
gitc "$LANE" checkout -qb feat/thing
echo "create table x;" > "$LANE/db/migrations/002_a.sql"
gitc "$LANE" add -A; gitc "$LANE" commit -qm "feat: add x"
echo "create table y;" > "$PUSHER/db/migrations/002_b.sql"
gitc "$PUSHER" add -A; gitc "$PUSHER" commit -qm "other lane"; gitc "$PUSHER" push -q origin development

# --- (a) --check detects the 002 collision: exit 5 + rename suggestion --------
OUT="$(bash "$SYNC" 1 --check feat/thing 2>&1)"; RC=$?
assert_eq 5 "$RC" "--check exits 5 on a migration-number collision"
assert_contains "$OUT" "collides with" "collision message names the clash"
assert_contains "$OUT" "003_a.sql" "collision message suggests the next free number"

# --- (b) renumber -> --check passes and reports the upstream delta ------------
gitc "$LANE" mv db/migrations/002_a.sql db/migrations/003_a.sql
gitc "$LANE" commit -qm "renumber migration"
OUT="$(bash "$SYNC" 1 --check feat/thing 2>&1)"; RC=$?
assert_eq 0 "$RC" "--check exits 0 after the renumber"
assert_contains "$OUT" "DEV_DELTA: 1" "--check reports 1 upstream file since merge-base"
assert_contains "$OUT" "DEV_OVERLAP: none" "--check reports no overlap with the feature's files"

# --- (c) merge mode: origin/development INTO the feature branch ---------------
OUT="$(bash "$SYNC" 1 feat/thing 2>&1)"; RC=$?
assert_eq 0 "$RC" "clean sync-merge exits 0"
assert_eq "feat/thing" "$(git -C "$LANE" rev-parse --abbrev-ref HEAD)" "lane stays on the feature branch"
assert_ne "" "$(git -C "$LANE" rev-parse -q --verify HEAD^2 || true)" "HEAD is a merge commit"
assert_file "$LANE/db/migrations/002_b.sql" "upstream migration arrived on the branch"

# --- (d) conflicting edits: exit 4, left in place; --continue finishes --------
echo "feature words" > "$LANE/README.md"
gitc "$LANE" add -A; gitc "$LANE" commit -qm "feat: readme"
echo "upstream words" > "$PUSHER/README.md"
gitc "$PUSHER" add -A; gitc "$PUSHER" commit -qm "other readme"; gitc "$PUSHER" push -q origin development
OUT="$(bash "$SYNC" 1 feat/thing 2>&1)"; RC=$?
assert_eq 4 "$RC" "conflicting sync-merge exits 4"
assert_file "$LANE/.git/MERGE_HEAD" "conflicted merge is left in place"
assert_eq "sync-conflict" "$(bash "$REPO/bin/state.sh" 1 get stage)" "state stage=sync-conflict"
echo "merged words" > "$LANE/README.md"
gitc "$LANE" add README.md; gitc "$LANE" commit -q --no-edit
OUT="$(bash "$SYNC" 1 --continue feat/thing 2>&1)"; RC=$?
assert_eq 0 "$RC" "--continue exits 0 after the resolution"
assert_eq "feat/thing" "$(git -C "$LANE" rev-parse --abbrev-ref HEAD)" "--continue stays on the feature branch"

# --- (e) refuses to run ON the integration branch ------------------------------
gitc "$LANE" checkout -q development
OUT="$(bash "$SYNC" 1 2>&1)"; RC=$?
assert_ne 0 "$RC" "merge mode on development dies"
assert_contains "$OUT" "feature branch" "error explains a feature branch is required"
gitc "$LANE" checkout -q feat/thing

# --- (z) spec-dir collision: added spec.md in a dir that exists on origin -> exit 6
gitc "$PUSHER" pull -q origin development
mkdir -p "$PUSHER/specs/2026-10-12-same"; echo a > "$PUSHER/specs/2026-10-12-same/spec.md"
gitc "$PUSHER" add -A; gitc "$PUSHER" commit -qm "other lane spec"; gitc "$PUSHER" push -q origin development
gitc "$LANE" fetch -q origin
gitc "$LANE" checkout -q -B feat/spec-a origin/development~1   # branch point BEFORE the other lane's spec landed
mkdir -p "$LANE/specs/2026-10-12-same"; echo b > "$LANE/specs/2026-10-12-same/spec.md"
gitc "$LANE" add -A; gitc "$LANE" commit -qm "docs(spec): same name"
OUT="$(bash "$SYNC" 1 --check feat/spec-a 2>&1)"; RC=$?
assert_eq 6 "$RC" "--check exits 6 when an added spec dir already exists on origin"
assert_contains "$OUT" "specs/2026-10-12-same-2" "spec collision suggests the -2 rename"

# follow-up: adding followup-1.md into an EXISTING origin spec dir is NOT a collision
gitc "$LANE" checkout -q -B feat/spec-fix1 origin/development
echo f > "$LANE/specs/2026-10-12-same/followup-1.md"
gitc "$LANE" add -A; gitc "$LANE" commit -qm "docs(spec): follow-up"
bash "$SYNC" 1 --check feat/spec-fix1 >/dev/null 2>&1; RC=$?
assert_eq 0 "$RC" "follow-up file in an existing spec dir is not a collision"

finish
