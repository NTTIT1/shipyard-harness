#!/usr/bin/env bash
# The dev-based-flow safety primitive (spec 2026-07-16). The ONLY sanctioned
# merge in the harness: origin/$INTEGRATION_BRANCH INTO the lane's feature
# branch. Never touches development/main, never pushes.
#   lane-sync-dev.sh <N> --check [branch]     read-only preflight: fetch +
#       migration-number collision check + DEV_DELTA / DEV_OVERLAP report
#   lane-sync-dev.sh <N> [branch]             merge origin/development into the
#       feature branch (rerere + keep-ours driver + regen fold-in)
#   lane-sync-dev.sh <N> --continue [branch]  finish after the session resolved
#       a conflicted sync-merge and committed it (regen fold-in only)
# Exit 4 = MERGE CONFLICT, left IN PLACE on purpose: resolve the conflicted
# files ON THE FEATURE BRANCH (keep development's behavior for code unrelated
# to the feature, the feature's intent where they overlap), `git add` the
# conflicted files, `git commit --no-edit`, then `lane-sync-dev.sh <N> --continue`.
# Exit 5 = MIGRATION NUMBER COLLISION (nothing merged): a migration added on
# the feature branch reuses a number already on origin/development — renumber
# on the feature branch (exact rename printed), then re-run the gates.
# Exit 6 = SPEC DIR COLLISION (nothing merged): a specs/<dir>/spec.md added on
# the feature branch already exists on origin/development — git mv to <dir>-2.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
require_lane "${1:-}"
N="$1"; DIR="$(lane_dir "$N")"
[ -d "$DIR/.git" ] || die "lane $N not bootstrapped"

MODE=merge
case "${2:-}" in
  --check)    MODE=check;    FEATURE="${3:-}";;
  --continue) MODE=continue; FEATURE="${3:-}";;
  *)          FEATURE="${2:-}";;
esac
[ -n "$FEATURE" ] || FEATURE="$(git -C "$DIR" rev-parse --abbrev-ref HEAD)"
if [ "$FEATURE" == "$INTEGRATION_BRANCH" ] || [ "$FEATURE" == "main" ]; then
  die "branch is '$FEATURE' — lane-sync-dev works on a feature branch (pass it explicitly)"
fi
git -C "$DIR" rev-parse --verify "$FEATURE" >/dev/null 2>&1 \
  || die "feature branch '$FEATURE' not found in lane $N"

"$HARNESS_ROOT/bin/state.sh" "$N" set >/dev/null 2>&1 || true   # heartbeat; never fatal

# Drop generated paths from a newline-separated file list on stdin (they are
# regenerated per-merge; counting them as "delta" or "overlap" is noise).
filter_generated() {
  if [ -n "${GENERATED_MERGE_PATHS:-}" ]; then
    # shellcheck disable=SC2086
    grep -vxF -f <(printf '%s\n' $GENERATED_MERGE_PATHS) || true
  else
    cat
  fi
}

# Migration-number collision guard (profiles with a numbered-migrations dir):
# two lanes independently add NNN_* files with the same number; git merges both
# without conflict and the collision only surfaces as red CI on development
# AFTER the human merges the PR. Detect from refs alone, fail fast with the rename.
collision_check() {
  local added dev_migrations maxnum nextnum clash_msg f num clash sugg
  [ -n "${MIGRATIONS_DIR:-}" ] || return 0
  added="$(git -C "$DIR" diff --name-only --diff-filter=A \
      "origin/$INTEGRATION_BRANCH...$FEATURE" -- "$MIGRATIONS_DIR" 2>/dev/null || true)"
  [ -n "$added" ] || return 0
  dev_migrations="$(git -C "$DIR" ls-tree -r --name-only "origin/$INTEGRATION_BRANCH" -- "$MIGRATIONS_DIR" \
    | grep -E '/[0-9]+_[^/]*$' || true)"
  maxnum="$(printf '%s\n' "$dev_migrations" | sed -nE 's|.*/([0-9]+)_[^/]*$|\1|p' | sort -n | tail -1)"
  nextnum=$(( 10#${maxnum:-0} + 1 ))
  clash_msg=""
  for f in $added; do
    num="$(basename "$f" | sed -nE 's/^([0-9]+)_.*/\1/p')"
    [ -n "$num" ] || continue
    clash="$(printf '%s\n' "$dev_migrations" | grep -E "/${num}_" | head -1 || true)"
    if [ -n "$clash" ]; then
      sugg="$(printf '%03d' "$nextnum")_$(basename "$f" | sed -E 's/^[0-9]+_//')"
      clash_msg="${clash_msg}
harness:   $f collides with $(basename "$clash") on origin/$INTEGRATION_BRANCH — rename to $sugg (git mv on '$FEATURE', update any in-file references, re-run gates)"
      nextnum=$((nextnum + 1))
    fi
  done
  if [ -n "$clash_msg" ]; then
    "$HARNESS_ROOT/bin/state.sh" "$N" set stage=migration-collision status=running \
      notes="migration number collision vs origin/$INTEGRATION_BRANCH — renumber on the feature branch, then re-run lane-sync-dev" \
      >/dev/null 2>&1 || true
    echo "harness: lane $N — MIGRATION NUMBER COLLISION (nothing merged):$clash_msg" >&2
    exit 5
  fi
}

# Spec-dir collision guard (spec-driven flow): two lanes can name a spec dir the
# same (same day + same title). Only a NEWLY ADDED spec.md counts — a follow-up
# adding followup-K.md into its parent's (already merged) dir is expected.
spec_collision_check() {
  local added f d clash_msg=""
  added="$(git -C "$DIR" diff --name-only --diff-filter=A \
      "origin/$INTEGRATION_BRANCH...$FEATURE" -- 'specs/*/spec.md' 2>/dev/null || true)"
  [ -n "$added" ] || return 0
  for f in $added; do
    d="$(dirname "$f")"
    if git -C "$DIR" cat-file -e "origin/$INTEGRATION_BRANCH:$f" 2>/dev/null; then
      clash_msg="${clash_msg}
harness:   $d already exists on origin/$INTEGRATION_BRANCH — rename to $d-2 (git mv on '$FEATURE', update lane state spec_dir, re-run gates)"
    fi
  done
  if [ -n "$clash_msg" ]; then
    "$HARNESS_ROOT/bin/state.sh" "$N" set stage=spec-collision status=running \
      notes="spec dir name collision vs origin/$INTEGRATION_BRANCH — rename on the feature branch" \
      >/dev/null 2>&1 || true
    echo "harness: lane $N — SPEC DIR COLLISION (nothing merged):$clash_msg" >&2
    exit 6
  fi
}

# What moved on origin/development since this branch's merge-base, and does it
# touch the feature's own files? Informational — the skill uses it to judge how
# stale the branch is at publish time.
dev_delta_report() {
  local mb delta feat_files overlap dn on
  mb="$(git -C "$DIR" merge-base "origin/$INTEGRATION_BRANCH" "$FEATURE" 2>/dev/null || true)"
  if [ -z "$mb" ]; then echo "DEV_DELTA: unknown (no merge-base with origin/$INTEGRATION_BRANCH)"; return 0; fi
  delta="$(git -C "$DIR" diff --name-only "$mb" "origin/$INTEGRATION_BRANCH" | filter_generated | sed '/^$/d')"
  feat_files="$(git -C "$DIR" diff --name-only "$mb" "$FEATURE" | filter_generated | sed '/^$/d')"
  dn="$(printf '%s' "$delta" | grep -c . || true)"
  echo "DEV_DELTA: $dn file(s) changed on origin/$INTEGRATION_BRANCH since merge-base"
  # shellcheck disable=SC2086
  [ -n "$delta" ] && printf 'harness:   %s\n' $delta
  overlap="$(comm -12 <(printf '%s\n' "$delta" | sort -u) <(printf '%s\n' "$feat_files" | sort -u) | sed '/^$/d')"
  if [ -n "$overlap" ]; then
    on="$(printf '%s' "$overlap" | grep -c . || true)"
    echo "DEV_OVERLAP: $on file(s) — the upstream delta touches the feature's files:"
    # shellcheck disable=SC2086
    printf 'harness:   %s\n' $overlap
  else
    echo "DEV_OVERLAP: none"
  fi
}

# Generated artifacts: the keep-ours merge driver left them at the branch's
# version — regenerate from the SYNCED tree and fold into the merge commit
# (no-op when nothing changed).
regen_fold() {
  if [ -n "${GENERATED_MERGE_PATHS:-}" ] && [ -f "$PROFILE_DIR/hooks/regen.sh" ]; then
    echo "harness: regenerating generated artifacts (post-sync) ..."
    run_hook "$N" regen
    # shellcheck disable=SC2086
    git -C "$DIR" add -- $GENERATED_MERGE_PATHS 2>/dev/null || true
    if ! git -C "$DIR" diff --cached --quiet; then
      if git -C "$DIR" rev-parse -q --verify HEAD^2 >/dev/null; then
        git -C "$DIR" commit --amend --no-edit
      else
        git -C "$DIR" commit -m "chore: regenerate artifacts after dev sync"
      fi
      echo "harness: regenerated artifacts folded into the sync commit"
    fi
  fi
}

case "$MODE" in
  check)
    git -C "$DIR" fetch origin --prune --quiet
    collision_check
    spec_collision_check
    dev_delta_report
    echo "harness: lane $N — '$FEATURE' preflight vs origin/$INTEGRATION_BRANCH: OK"
    ;;

  merge)
    echo "harness: syncing origin/$INTEGRATION_BRANCH into '$FEATURE' (lane $N) ..."
    git -C "$DIR" fetch origin --prune --quiet
    write_lane_markers "$N" "$DIR"   # ensure merge driver/attributes exist BEFORE merging
    collision_check
    spec_collision_check
    git -C "$DIR" checkout --quiet "$FEATURE"
    if ! git -C "$DIR" merge --no-edit "origin/$INTEGRATION_BRANCH"; then
      if [ -z "$(git -C "$DIR" ls-files -u)" ] && [ -f "$DIR/.git/MERGE_HEAD" ]; then
        echo "harness: rerere auto-resolved all conflicts — committing the sync-merge"
        git -C "$DIR" commit --no-edit
      else
        "$HARNESS_ROOT/bin/state.sh" "$N" set stage=sync-conflict status=running \
          notes="merge conflict: origin/$INTEGRATION_BRANCH into $FEATURE — resolve on the branch, commit, then --continue" \
          >/dev/null 2>&1 || true
        echo "harness: lane $N — MERGE CONFLICT (left in place on '$FEATURE')." >&2
        echo "harness: resolve the conflicted files, then:" >&2
        echo "harness:   git -C '$DIR' add <resolved files> && git -C '$DIR' commit --no-edit" >&2
        echo "harness:   $HARNESS_ROOT/bin/lane-sync-dev.sh $N --continue $FEATURE" >&2
        exit 4
      fi
    fi
    regen_fold
    echo "harness: lane $N — '$FEATURE' is synced with origin/$INTEGRATION_BRANCH (re-enter the pipeline at the gates)."
    ;;

  continue)
    echo "harness: continuing lane $N sync after conflict resolution ..."
    [ "$(git -C "$DIR" rev-parse --abbrev-ref HEAD)" == "$FEATURE" ] \
      || die "--continue: lane $N is not on '$FEATURE'"
    [ -z "$(git -C "$DIR" ls-files -u)" ] \
      || die "--continue: unresolved conflicts remain (git -C $DIR status)"
    [ ! -f "$DIR/.git/MERGE_HEAD" ] \
      || die "--continue: merge not committed yet — git -C $DIR commit --no-edit"
    regen_fold
    echo "harness: lane $N — '$FEATURE' is synced with origin/$INTEGRATION_BRANCH (re-enter the pipeline at the gates)."
    ;;
esac
