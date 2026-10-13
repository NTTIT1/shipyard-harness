---
name: spec-tasks
description: "Spec-driven step 3: break specs/<dir>/plan.md into specs/<dir>/tasks.md — an ordered checkbox list (tests before code, each task tagged with the AC it serves and its main file) that /ship-feature follows and ticks. Invoke as /spec-tasks specs/<dir>. Next: /ship-feature specs/<dir>."
---

# Spec Tasks (write tasks.md)

## Setup
```bash
HARNESS="@@HARNESS_ROOT@@"
SPEC_DIR="<the argument, without trailing slash>"
```
- `$SPEC_DIR/spec.md` and `$SPEC_DIR/plan.md` must exist; otherwise STOP and name the missing step (`/spec-new` or `/spec-plan`).
- Files only — no lane state, branches, or commits.

## Steps
1. Read spec.md + plan.md.
2. Write `$SPEC_DIR/tasks.md` from `"$("$HARNESS/bin/spec-path.sh" template tasks)"`: tasks `T1, T2, …` in execution order; each line `- [ ] Tn — <what> · AC-k · \`<main file>\``; a test task precedes the code task that makes it pass (TDD); each task is small (one commit). Every AC is covered by at least one task.
   - **Parallel groups** (only when the profile enables parallel coding — `"$HARNESS/bin/profile-cat.sh" profile.env | grep '^IMPL_AGENTS='` shows a value > 1; skip this sub-step otherwise): tag tasks that several agents can code at the same time with `· nhóm:A`, `· nhóm:B`, … (append after the main file). A group = a coherent slice (e.g. backend API, frontend page) with its tests; groups must own **disjoint files** — no file appears in two groups, and no group needs another group's code to compile or pass its tests. Shared prerequisites (migrations, API contract/DTO changes both sides consume, shared fixtures, dependency bumps) stay **untagged** and are listed first — the lane does them before the groups fan out. Don't force it: a small feature or one where every slice touches the same files stays all-untagged (sequential).
3. Report the task count (and the parallel groups, if any) and the next command: `/ship-feature $SPEC_DIR` (all 3 files present ⇒ the lane treats the spec as approved and starts coding).
