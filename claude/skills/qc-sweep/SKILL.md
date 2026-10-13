---
name: qc-sweep
description: "App-wide regression QC for the parallel feature harness — the cross-feature sweep that per-lane dev-QC doesn't cover. Invoke inside a lane clone as `/qc-sweep [dev|local <lane>]`. Frontloads scope questions ONCE (which app areas, depth, dev site vs. local lane stack), then fans out one browser-QC agent per app area — each drives the app via the lane's playwright MCP (login, exercise the area's flows, reload/re-login coverage, proof screenshots, a parseable per-area PASS/FAIL verdict), run serially (or max 2 at once) to avoid browser contention. Synthesizes a single markdown report + a QC-SWEEP: PASS/FAIL verdict, and writes lane state stage=qc-sweep so the watch dashboard shows it. Use when the user wants an app-wide regression pass across features, not just one lane's feature."
---

# QC Sweep (harness app-wide regression QC)

You run an **app-wide regression sweep** for one lane's session. Per-lane dev-QC only exercises *that lane's* feature; cross-feature regressions (a Reports 504 from an inline LLM call in the request path, a thread fetch-loop, a criteria count that stops persisting) slip through until someone QCs the whole app. This skill is that sweep: after a short frontloaded Q&A you fan out one browser-QC agent per app area, each capturing proof, then you synthesize one report with a single PASS/FAIL verdict. The human's only interactive touchpoint is **Stage 0**; after that you run to completion, reporting through the lane's state file (which the watch dashboard renders).

You never commit, push, or fix code — you drive the app, capture evidence, and report. Fixes are a separate `/ship-feature` run.

## Setup — do this first, every run

```bash
LANE_DIR="$(pwd)"                            # the lane clone IS your cwd — resolved at runtime, never hardcoded
HARNESS="@@HARNESS_ROOT@@"                    # populated to the real harness path when the harness is installed
N="$(cat .harness-lane 2>/dev/null)"         # lane number, read from the clone
eval "$("$HARNESS/bin/lane-env.sh" "$N")"    # lane env (API_BASE, FE_URL, DEV_SITE_URL, DB vars) + integration toggles
```
- If `.harness-lane` is missing you are NOT inside a lane clone — STOP and tell the user to assign/bootstrap a lane first (`"$HARNESS/bin/lane-assign.sh"` / `lane-bootstrap.sh`), then re-invoke `/qc-sweep` from the lane.
- **Paths auto-resolve — never hardcode.** The lane clone is your cwd (`$LANE_DIR`); the harness path (`$HARNESS`) is baked at install.
- **Never `source "$HARNESS/bin/_common.sh"` yourself** — the Bash tool runs zsh, where sourcing it silently mis-resolves to the `_template` profile and every integration reads OFF. Use `lane-env.sh` (immune — it runs under its bash shebang), exactly as above.
- All state goes through `"$HARNESS/bin/state.sh" "$N" set key=value …` — **call it at each stage** (this is also the heartbeat). Long agent runs mean minutes can pass between stage transitions; bump the heartbeat between area agents so the dashboard doesn't false-flag the lane STALLED.
- Reuse existing helpers — don't reinvent their logic: `lane-env.sh` (env + toggles), `state.sh` (state), `lane-qa-login.sh` (seed a logged-in browser profile without routing a password through any agent).

## Context recovery — after conversation compaction

A sweep can outlive the context window. When context is compacted, re-derive:

```bash
LANE_DIR="$(pwd)"; HARNESS="@@HARNESS_ROOT@@"; N="$(cat .harness-lane 2>/dev/null)"
eval "$("$HARNESS/bin/lane-env.sh" "$N")"
```
Then read where you were: `"$HARNESS/bin/state.sh" "$N" get` (stage=qc-sweep, `notes` holds the target + area progress). Check which areas already have a verdict by listing proof: `ls .playwright-mcp/proof/<sweep-slug>/`. Resume with the remaining areas — re-run any area whose proof dir is missing or whose agent never returned a verdict.

## Hard rules

- **One driver per MCP browser server — this is the contention rule that shapes the whole sweep.** Each MCP server owns ONE browser; two agents driving the SAME server interleave clicks in one tab and corrupt each other's runs. Your target has exactly one authenticated QA browser server (`playwright-qa-local` for a local stack, `@@DEV_QC_MCP@@` for the dev site). Therefore **run the area agents SERIALLY by default — one finishes before the next starts.** Only go to **max 2 concurrent** if you give the second agent a *distinct* browser server (the unscoped `playwright`, which it must log into itself); never a second driver on the same server. When in doubt, serial.
- **Never fix, commit, or push.** This is read + observe + report. A failing area becomes a follow-up `/ship-feature`, not an inline edit here.
- **Stay per-area.** Each agent owns ONE area and the flows inside it; it does the smoke set (login + main nav) but does not wander into other areas' deep flows — that's the next agent's job, and overlap wastes the single browser.
- **Perf attention stands in for a perf gate.** Every agent flags any interaction that takes **> 5s** or returns a **5xx** as a `PERF-ATTENTION` item (endpoint/flow + observed time or status + proof). A 5xx that breaks the flow is an area FAIL; a slow-but-working interaction is surfaced as a warning that the sweep verdict must call out. On the dev site these are real backend timings (the slow-endpoint/504 class of bug lives here); see the local-mode caveat below.
- **Truthful state.** On any stop set an accurate `stage`/`status`/`notes`. Touch ONLY this lane's clone, state, and proof.

## Target modes (pick in Stage 0)

- **`dev` — the shared dev site** (`$DEV_SITE_URL`), the REAL backend. This is the primary regression target: request-path LLM calls, real query timings, and cross-feature integration all execute for real, so it's where the perf gate and the slow-endpoint/504 class of bug actually reproduce. Browser server: `@@DEV_QC_MCP@@`. Login: the lane's dev-QC account — `"$HARNESS/bin/lane-qa-login.sh" "$N"` seeds it (password never enters an agent). Requires `dev_qc` enabled: gate with `"$HARNESS/bin/lane-env.sh" "$N" --check dev_qc`; if OFF, tell the user dev-QC isn't configured for this profile and offer local mode instead.
- **`local <lane>` — this lane's own local stack** at `http://localhost:300<N>` (the `<lane>` arg, if given, must equal THIS clone's `N`; cross-lane local QC isn't supported — the MCP profile is lane-scoped, so run the sweep from the target lane's own clone). Browser server: `playwright-qa-local`. Login: the seeded lane account — `"$HARNESS/bin/lane-qa-login.sh" "$N" local` (requires the stack UP). **Caveat that limits the perf gate:** the lane stack is normally booted with the profile's QC boot env (`lane-up.sh --qc` applies `QC_BOOT_ENV`, typically mock/stub flags), so LLM-backed request paths return canned responses — a request-path timeout/504 there will NOT reproduce. In local mode, QC the surrounding UX (loading states, rendering, persistence) and rely on **dev mode** for the real-backend perf gate. If the stack is down, boot it first: `"$HARNESS/bin/lane-up.sh" "$N" --qc` (idempotent; applies migrations; takes a few minutes).
- If the user gave no target, ask in Stage 0. Default recommendation: **dev** (real backend → the sweep catches what per-lane QC can't).

## Stages

### 0 — Intake & frontloaded Q&A  *(the only interactive part)*

Ask the human, in ONE batch, then go autonomous:
- **Target**: dev site or a local lane stack? (default: dev — real backend; see the perf caveat for local.)
- **Areas**: which app areas to sweep, and any to skip. Offer the profile's default set — fetch it with `"$HARNESS/bin/profile-cat.sh" qc-sweep-areas.md` (the active profile's curated area list). If it's empty/absent, derive a sensible set yourself from the app's main navigation and say so. Either way, confirm against what the app currently has — drop areas that don't exist, add ones that do — and let the human trim/add.
- **Depth**: quick smoke (happy path + reload per area) or thorough (happy + negative/empty/permission edges + UI/UX layout pass per area). Default: thorough.
- **Concurrency**: serial (default, safe) or may you run 2 at once given a second browser server?

Then open a clean per-sweep state slot (so this run can't write into a prior feature's state, and prior features stay browsable in the dashboard) and mark intake:
```bash
SWEEP="qc-sweep-$(date +%Y%m%d)"                      # slug keys BOTH the state file and proof/<SWEEP>/ — keep them identical
TARGET="dev"                                          # or "local"
"$HARNESS/bin/state.sh" "$N" init
SLUG="$("$HARNESS/bin/state.sh" "$N" activate "$SWEEP")"   # sanitizes + echoes the canonical slug; use $SLUG everywhere below
"$HARNESS/bin/state.sh" "$N" set mode=qc-sweep feature_title="QC sweep $SWEEP ($TARGET)" stage=qc-sweep status=running notes="target=$TARGET; areas: <list>"
```
Announce "Scope set — sweeping now." After this, don't ask the human anything unless you hit a genuine blocker.

### 1 — Preflight  *(fail fast, once)*
- **MCP loaded?** Confirm the target's browser tools are actually in this session: `mcp__playwright-qa-local__browser_*` (local) or `mcp__@@DEV_QC_MCP@@__browser_*` (dev). Missing → run `"$HARNESS/bin/lane-mcp-sync.sh" "$N"`, then STOP and tell the human to restart this Claude session (project MCPs load only at session start). Catching this now costs a minute; catching it mid-sweep strands the run.
- **Target reachable?** dev: `curl -fsS -o /dev/null -w '%{http_code}' "$DEV_SITE_URL"`. local: `curl -fsS -o /dev/null -w '%{http_code}' "http://localhost:300$N"` — if down, boot it (see local mode above) or STOP.
- **Seed the login** for the target (the two `lane-qa-login.sh` commands above) so every area agent opens already authenticated. Re-seed on-demand if an agent reports a logged-out session (it closes its browser first, then re-seeds).

### 2 — Fan out per-area QC agents  *(serial by default; the unattended core)*

For EACH area, in turn, spawn ONE agent (Agent tool, `subagent_type: general-purpose`) and wait for its verdict before starting the next (serial). Between agents: `"$HARNESS/bin/state.sh" "$N" set stage=qc-sweep notes="swept <done>/<total>; now: <area>"` (heartbeat + progress). Give each agent this briefing (fill the placeholders):

> You are a QA automation engineer sweeping ONE app area on the `<TARGET>` target for a harness regression sweep. Rigorous, evidence-driven, autonomous. You never commit, push, or fix — you drive the app, capture proof, and report.
> - **Lane N** = `<N>`; **lane clone** (your cwd) = `<LANE_DIR>`. **Area** = `<area name>` covering `<the flows listed for this area>`.
> - **App** = `<DEV_SITE_URL | http://localhost:300N>`. **Browser server** = use ONLY the `mcp__<playwright-qa-local | @@DEV_QC_MCP@@>__browser_*` tool family — never the unscoped `playwright` or any other server (another agent may own it). If those tools aren't available, return `AREA-QC: <area> FAIL — <server> MCP not loaded`.
> - **Login**: the browser profile is pre-seeded logged-in. If you land on a login page mid-run: `browser_close` → run `"$HARNESS/bin/lane-qa-login.sh" "<N>" <local|dev>` → `browser_navigate` back. If login is rejected, return `AREA-QC: <area> FAIL — login rejected`.
> - **Scope**: exercise every meaningful flow in THIS area — primary happy path, plus (if depth=thorough) negative/empty/permission edges. Do the smoke set once (login + main nav loads). Do NOT deep-test other areas.
> - **State coverage**: reload (Cmd+R) on every stateful screen you touch and confirm state survives. `<For the auth-settings agent ONLY:>` also do one full logout → re-login cycle. `<For every other agent:>` note that re-login is covered by the auth-settings area.
> - **Perf attention (stands in for a perf gate)**: flag any interaction that takes **> 5s** or returns a **5xx** — record endpoint/flow + observed time or HTTP status + the proof file. A 5xx that breaks a flow is a FAIL; a slow-but-working call is a `PERF-ATTENTION` warning. Read the lane API log for local (`harness/logs/lane<N>/api.log`); on dev, use response timing + `browser_console_messages`.
> - **UI/UX (thorough only), on each form/screen you touch**: narrow AND short viewport with expandables open (content taller than the viewport) — fixed header/stepper/buttons never clipped, scroll works, actions reachable; every control labelled; section headers more prominent than field labels; no overlap/truncation.
> - **Proof (mandatory, fixed path)**: EVERY screenshot via `browser_take_screenshot` with `filename: "proof/<SLUG>/<area>/<NN>-<what>.png"` (numbered in flow order, e.g. `proof/qc-sweep-20260710/reports/03-report-open.png`). The MCP's pinned `--output-dir` lands these under `<lane clone>/.playwright-mcp/proof/…` — the ONLY place the dashboard gallery reads. Absolute paths / other folders = proof lost.
> - **Failure triage**: on any issue capture a screenshot + `browser_snapshot` + `browser_console_messages`; note repro, expected vs actual, severity (blocker/major/minor/cosmetic); then CONTINUE with the rest of the area unless the app is unusable.
> - **Output (MANDATORY — I parse your last line)**: a scannable report (flows covered ✅/❌, issues with severity + repro + proof file, PERF-ATTENTION list, reload/re-login note, proof filenames). Then end with EXACTLY one line: `AREA-QC: <area> PASS` or `AREA-QC: <area> FAIL — <comma-separated reasons>`.

- **Serial mechanics**: run each agent to completion before the next (foreground, or background then wait for its completion re-invoke — either way only ONE browser drives the target at a time). Collect each `AREA-QC:` line.
- **Concurrency (only if the user opted in AND a second server is free)**: run at most 2 areas at once — agent A on the target's QA server, agent B on the unscoped `playwright` (B logs itself in via the form). Never two agents on the same server.
- If an area agent dies without a verdict, re-spawn it (idempotent — it re-drives and re-captures). Don't let the sweep finish with an area unaccounted for.

### 3 — Synthesize & report
- Collect every area's `AREA-QC:` verdict, issues, and PERF-ATTENTION items.
- Write ONE sweep report to the proof dir so the dashboard/human can read it alongside the screenshots: `proof/<SLUG>/REPORT.md` (write it under `.playwright-mcp/proof/<SLUG>/REPORT.md` so it sits with the gallery). Include: target + date, per-area verdict table (area → PASS/FAIL + one-line summary), all issues grouped by severity with their proof files, a dedicated **Perf attention** section (every >5s / 5xx item), reload/re-login coverage, and the areas swept vs. skipped.
- Set final state:
  ```bash
  "$HARNESS/bin/state.sh" "$N" set stage=qc-sweep status=<passed|failed> \
     notes="QC-SWEEP <PASS|FAIL(areas)> — <k>/<total> areas; <p> perf-attention; report: proof/<SLUG>/REPORT.md"
  ```
- Post a concise summary to the human and end with EXACTLY one verdict line:
  - `QC-SWEEP: PASS` — every area PASS, no blocking perf item.
  - `QC-SWEEP: FAIL(<area1,area2,…>)` — one or more areas FAIL or a blocking 5xx; the parenthesized list names them. Follow with the top fixes (each is a candidate `/ship-feature`).
- Do NOT reset the lane — cleanup is the human's call from the dashboard.

## Escalation
If you STOP early (MCP not loaded and needs a session restart, target unreachable, login rotated), set `status=blocked` with a one-line `notes=` on what the human must fix, summarize, and wait.
