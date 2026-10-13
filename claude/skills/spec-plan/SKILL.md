---
name: spec-plan
description: "Spec-driven step 2: write specs/<dir>/plan.md (HOW to build it) for an existing spec.md in the current lane — investigates the real code, drafts the plan, has a separate sub-agent critique it, records the critique outcome, and checks the project constitution. Invoke as /spec-plan specs/<dir>. Next: /spec-tasks."
---

# Spec Plan (write plan.md)

## Setup
```bash
HARNESS="@@HARNESS_ROOT@@"
SPEC_DIR="<the argument, without trailing slash>"
```
- `$SPEC_DIR/spec.md` must exist; otherwise STOP and say so. If its `## Câu hỏi còn mở` is not empty / `Không có`, ask the user those questions first and update spec.md.
- Files only — no lane state, branches, or commits.

## Steps
1. **Investigate.** Read the code paths, models, tests, and conventions the spec touches (`Explore`/`general-purpose` agents for breadth, then read key files yourself). Pin down integration points, data/migration needs, API/contract impact, reuse, risks. Read `specs/constitution.md` if it exists.
2. **Draft `$SPEC_DIR/plan.md`** from `"$("$HARNESS/bin/spec-path.sh" template plan)"`, keeping every heading. `## Chiến lược test` maps each test to the AC it pins; every AC appears at least once.
3. **Debate it.** Spawn a SEPARATE sub-agent (Agent tool, `Plan` or `general-purpose`) with spec.md + plan.md + constitution: critique missed requirements, wrong assumptions, simpler approaches, unhandled edge cases, constitution violations. Apply what holds up (verify each point; don't accept blindly). Record outcomes in `## Kết quả phản biện` (applied / rejected + reason). One or two rounds.
4. **Constitution check:** fill `## Kiểm tra constitution`; any MUST ✗ → STOP and ask the user.
5. **Report** a short summary (approach, files, risks) and the next command: `/spec-tasks $SPEC_DIR`.
