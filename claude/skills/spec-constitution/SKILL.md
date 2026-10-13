---
name: spec-constitution
description: "Create or amend the project constitution specs/constitution.md — the MUST/SHOULD rules every lane, code review, and the senior gate enforce. Invoke as /spec-constitution [what to change] from inside a lane clone. Drafts from the codebase's real conventions, asks the human once, then commits on its own branch and opens a PR into the integration branch (never pushes it directly)."
---

# Spec Constitution

## Setup
```bash
LANE_DIR="$(pwd)"
HARNESS="@@HARNESS_ROOT@@"
N="$(cat .harness-lane 2>/dev/null)"
eval "$("$HARNESS/bin/lane-env.sh" "$N")"   # gives INTEGRATION_BRANCH, BRANCH_PREFIX
```
- Must run inside a lane clone (`.harness-lane` present); otherwise STOP.
- **Never push `$INTEGRATION_BRANCH` or `main`.** The only push is the constitution branch below.
- The working tree must be clean (`git status --porcelain` empty, ignoring untracked `specs/*/` drafts); otherwise STOP and tell the user.

## Steps
1. `git fetch origin`. If `origin/$INTEGRATION_BRANCH:specs/constitution.md` exists, read it — this is an amendment (apply the argument as the change request). Otherwise draft a new one.
2. **Ground the draft in the repo:** read CLAUDE.md / AGENTS.md / README / CONTRIBUTING, lint + formatter + test configs, the folder layout, and the profile's review checks (`"$HARNESS/bin/profile-cat.sh" review-checks.md`). Every rule cites what it is based on. Use `"$("$HARNESS/bin/spec-path.sh" template constitution)"` for structure; mark each rule **MUST** or **SHOULD** with a one-line reason. Prefer few, checkable rules over many vague ones.
3. **Ask the human once:** show the draft rules as a numbered list and ask which to keep / drop / promote (SHOULD↔MUST) / add. Apply the answers. Set "Cập nhật lần cuối" to today.
4. **Publish via PR:** `git checkout -b "${BRANCH_PREFIX}constitution-$(date +%F)" "origin/$INTEGRATION_BRANCH"`, write `specs/constitution.md`, `git add specs/constitution.md && git commit -m "docs(spec): project constitution"`, `git push -u origin HEAD`, then `gh pr create --base "$INTEGRATION_BRANCH" --title "docs(spec): project constitution" --body-file <file>` (body: rule list + "merge to make every lane enforce it"). Write the body to a file — never inline `--body "..."`.
5. Switch back: `git checkout "$INTEGRATION_BRANCH" 2>/dev/null || git checkout --detach "origin/$INTEGRATION_BRANCH"`. Report the PR URL and: "Merge this PR on GitHub — lanes pick the rules up on their next feature."
