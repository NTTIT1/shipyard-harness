#!/usr/bin/env bash
# Housekeeping for the harness + lanes. Safe to run any time — running lanes
# and live sessions are unaffected; everything it touches is verified stale.
#   lane-gc.sh [--dry-run] [--archive-state]
#
# What it does:
#   1. reap ORPHANED playwright-MCP servers/browsers (owning session dead:
#      reparented to pid 1) — live sessions' MCPs are left alone
#   2. (--archive-state only) archive finished feature state (stage
#      done/reported, not .active) to state/archive/lane<N>/. OFF by default:
#      the files are tiny and the dashboard's feature picker browses them —
#      archive only when a lane's history gets unwieldy
#   3. sweep scratch debris: scratch-lane*.log + manual-*.png in the lanes
#      root (>2 days old), state.bak.* in the harness root (>7 days old)
#   4. cap harness logs over 10MB to their last 2MB (in place, writer-safe)
#   5. remove stale source-repo .claude/worktrees (>7 days) + `worktree prune`
#
# What it NEVER touches: locks/ (the .lock AND .lock.probe files are live
# flock targets — deleting a held lock file breaks mutual exclusion), and
# ~/.claude/projects transcripts (chat history).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
DRY=0; ARCHIVE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1;;
    --archive-state) ARCHIVE=1;;
    *) die "unknown arg '$arg' (usage: lane-gc.sh [--dry-run] [--archive-state])";;
  esac
done
run() { if [ "$DRY" = 1 ]; then echo "harness: DRY-RUN: $*"; else "$@"; fi; }

kill_tree() {
  local p="$1" k
  for k in $(pgrep -P "$p" 2>/dev/null || true); do kill_tree "$k"; done
  kill -KILL "$p" 2>/dev/null || true
}

echo "harness: gc — 1/5 orphaned MCP processes ..."
# A playwright-MCP server whose spawning Claude session died gets reparented
# to launchd (ppid 1). Live sessions keep parenting theirs — those survive.
for pat in "$LANES_ROOT/lane[1-9]/.playwright-mcp" "user-data-dir=$LANES_ROOT/lane"; do
  for p in $(pgrep -f "$pat" 2>/dev/null || true); do
    pp="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)"
    if [ "$pp" = "1" ]; then
      cmd="$(ps -o command= -p "$p" 2>/dev/null | cut -c1-120 || true)"
      echo "harness:   orphan pid $p: $cmd"
      run kill_tree "$p"
    fi
  done
done

if [ "$ARCHIVE" = 1 ]; then
echo "harness: gc — 2/5 archiving finished feature state ..."
for n in $(discover_lanes); do
  sd="$HARNESS_ROOT/state/lane$n"
  [ -d "$sd" ] || continue
  active="$(cat "$sd/.active" 2>/dev/null || true)"
  active="${active%"${active##*[![:space:]]}"}"
  for j in "$sd"/*.json; do
    [ -f "$j" ] || continue
    slug="$(basename "$j" .json)"
    [ "$slug" = "_pending" ] && continue
    [ "$slug" = "$active" ] && continue
    stage="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("stage",""))' "$j" 2>/dev/null || echo "")"
    case "$stage" in
      done|reported)
        arch="$HARNESS_ROOT/state/archive/lane$n"
        echo "harness:   lane$n/$slug (stage=$stage) -> state/archive/lane$n/"
        run mkdir -p "$arch"
        run mv "$j" "$arch/"
        for sib in "$sd/$slug.json.lock" "$sd/$slug.pr-cursor"; do
          [ -f "$sib" ] && run mv "$sib" "$arch/"
        done
        ;;
    esac
  done
done
else
  echo "harness: gc — 2/5 state archiving skipped (opt in with --archive-state)"
fi

echo "harness: gc — 3/5 scratch debris ..."
while IFS= read -r f; do
  echo "harness:   rm $f"
  run rm -f "$f"
done < <(find "$LANES_ROOT" -maxdepth 1 \( -name 'scratch-lane*.log' -o -name 'manual-*.png' \) -mtime +2 2>/dev/null)
while IFS= read -r d; do
  echo "harness:   rm -r $d"
  run rm -rf "$d"
done < <(find "$HARNESS_ROOT" -maxdepth 1 -name 'state.bak.*' -mtime +7 2>/dev/null)

echo "harness: gc — 4/5 capping oversized logs (>10MB -> last 2MB) ..."
while IFS= read -r f; do
  echo "harness:   cap $f ($(du -h "$f" | cut -f1 | tr -d ' '))"
  if [ "$DRY" != 1 ]; then
    tmp="$(mktemp)"
    tail -c 2097152 "$f" > "$tmp"
    cat "$tmp" > "$f"   # write-in-place: keeps the inode open writers append to
    rm -f "$tmp"
  fi
done < <(find "$HARNESS_ROOT/logs" -type f -name '*.log' -size +10M 2>/dev/null)

echo "harness: gc — 5/5 stale source-repo worktrees ..."
if [ -n "${SOURCE_REPO:-}" ] && [ -d "$SOURCE_REPO/.git" ]; then
  now="$(date +%s)"
  git -C "$SOURCE_REPO" worktree list --porcelain | awk '/^worktree /{print $2}' | while IFS= read -r wt; do
    case "$wt" in
      */.claude/worktrees/*)
        if [ -d "$wt" ]; then
          mt="$(stat -f %m "$wt" 2>/dev/null || echo "$now")"
          age_days=$(( (now - mt) / 86400 ))
          if [ "$age_days" -ge "${GC_WORKTREE_DAYS:-7}" ]; then
            echo "harness:   removing worktree $wt (${age_days}d old)"
            run git -C "$SOURCE_REPO" worktree remove --force "$wt"
          fi
        else
          echo "harness:   pruning missing worktree $wt"
        fi
        ;;
    esac
  done
  run git -C "$SOURCE_REPO" worktree prune
fi

echo "harness: gc done."
