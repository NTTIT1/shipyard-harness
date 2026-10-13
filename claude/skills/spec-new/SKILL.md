---
name: spec-new
description: "Spec-driven step 1: turn a feature request into specs/<YYYY-MM-DD>-<slug>/spec.md in the current lane (WHAT to build — user stories, numbered acceptance criteria, out-of-scope). Invoke as /spec-new <feature description> from inside a lane clone. Asks all clarifying questions in one batch, checks the project constitution, leaves the file uncommitted for the human to edit. Next: /spec-plan."
---

# Spec New (write spec.md)

## Setup
```bash
HARNESS="@@HARNESS_ROOT@@"            # populated when the harness is installed
N="$(cat .harness-lane 2>/dev/null)"  # lane number; empty = not in a lane clone
```
- If `.harness-lane` is missing, STOP: tell the user to `cd` into a lane clone (`laneN/`) first.
- This skill writes files only. It does NOT touch lane state, branches, or commits.

## Steps
1. **Restate + scan.** Restate the request in one or two sentences. Scan the code it touches (use the `Explore` agent for breadth) so questions are grounded in what exists. If `specs/constitution.md` exists, read it.
2. **Ask everything in ONE batch:** acceptance criteria, scope / non-goals, UI/UX specifics, data shapes, edge cases (invalid input, empty state, permissions), existing flows it touches. **Sibling-surface check:** if the app has N parallel surfaces of the pattern and the request names fewer, ask "apply to all N, or only these?". Wait for answers.
3. **Create the dir:** `SPEC_DIR="$("$HARNESS/bin/spec-path.sh" new "<short title>")"` then `mkdir -p "$SPEC_DIR"`.
4. **Write `$SPEC_DIR/spec.md`** from `"$("$HARNESS/bin/spec-path.sh" template spec)"`: keep every section heading; fill front matter `title:` and `created:` (today); number criteria `AC-1…`; every AC must be checkable (positive AND negative cases). `## Câu hỏi còn mở` = `Không có` once answered. Write the spec in the language the user writes in.
5. **Constitution check:** in `## Kiểm tra constitution`, list each relevant MUST rule with ✓/✗. Any ✗ → tell the user which rule conflicts and ask whether to change the spec or the constitution. No constitution → write `Dự án chưa có constitution`.
6. **Report:** print the path and the AC list, then the next command: `/spec-plan $SPEC_DIR` (or `/ship-feature $SPEC_DIR` to let the lane plan + wait for approval). Remind: the file is uncommitted — ⟳ reset / 🗑 remove on the lane would delete it.
