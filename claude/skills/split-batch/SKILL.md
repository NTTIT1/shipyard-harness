---
name: split-batch
description: "Conflict-aware requirement decomposition for the parallel feature harness. Invoke as `/split-batch <requirements text or file path>`. Parses a batch of requirements into discrete features; for each, predicts the likely touched surface (backend modules, frontend routes/components, migrations, shared contracts) by actually searching the app repo; scores pairwise overlap with known merge-conflict HOTSPOTS called out; then proposes (a) which features should ride TOGETHER in one lane, (b) an assignment across N lanes that minimizes cross-lane overlap, (c) a dispatch ORDER that serializes the hotspot-touchers, and (d) per-feature one-line /ship-feature invocations. Outputs a markdown plan the user reviews — it writes NO state and touches no lane. Use when the user has a batch of features to spread across harness lanes and wants to minimize merge conflicts."
---

# Split Batch (conflict-aware requirement decomposition)

You turn a **batch of requirements** into a **conflict-aware dispatch plan** across the harness's parallel lanes. Today the human eyeballs a batch and hand-groups it to keep lanes from colliding on merge; this skill does that analytically — it reads the actual app repo, predicts what each feature touches, finds the overlaps (especially the known hotspots that *guarantee* a collision), and proposes groupings, a lane assignment, and a dispatch order that keep merges clean.

This is a **planning skill**: it reads and reasons, then prints a markdown plan for the human to review. It writes **no lane state**, boots nothing, and changes no code. It is safe to run anytime.

## Setup — do this first

```bash
HARNESS="@@HARNESS_ROOT@@"                    # populated to the real harness path at install
# The app repo the features get built in — search THIS repo. Prefer the harness's
# configured SOURCE_REPO (source of truth); fall back to cwd if that's a checkout.
# Read the config under bash — never zsh-`source` _common.sh (it mis-resolves under zsh).
APP_REPO="$(HARNESS_ROOT="$HARNESS" bash -c 'source "$HARNESS_ROOT/config/lanes.env" 2>/dev/null; printf "%s" "${SOURCE_REPO:-}"')"
[ -d "$APP_REPO/.git" ] || { [ -d "./backend" ] && APP_REPO="$(pwd)"; }
```
- **Read the batch.** The argument is either inline requirements text or a file path — if it's a readable file, read it; otherwise treat the argument as the text. Keep the human's original wording so features stay recognizable.
- **Number of lanes `N`.** Default to the harness's lane count (count bootstrapped lanes: `ls -d "$HARNESS"/state/lane[0-9]* 2>/dev/null | wc -l`, falling back to **6**). State the `N` you used in the plan so the human can say "spread across K lanes" and re-run.
- **No state writes, no `/ship-feature` dispatch** — this skill only *proposes* the invocations; the human runs them.

## Known hotspots — shared surfaces that make two features collide

These are the files/areas where two features that both touch them **will** conflict on merge (or produce painful integration drift). Weight them heavily in scoring.

- **Fetch the active profile's curated list first**: `"$HARNESS/bin/profile-cat.sh" conflict-hotspots.md` — it names the repo's known hotspot files (generated contracts, sequence-numbered migrations, shared enums/registries, shared fixtures, shared UI scaffolding) and whether each is HARD or SOFT.
- **If it's empty/absent, derive hotspots from git history**: files most often touched by MANY recent branches/PRs are the de-facto hotspots — e.g. `git -C "$APP_REPO" log --since='3 months ago' --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20`, plus anything that looks generated (large JSON/lockfile-ish artifacts) or sequence-numbered (a `NNN_*` migrations dir — two features independently taking the next number is a guaranteed collision).

Any *other* single file two features both edit is a **SOFT** overlap. A shared *directory/module* (same router file, same service, same component) is SOFT; a shared *hotspot* is HARD.

## Stage 1 — Parse the batch into discrete features
Split the batch into the smallest **independently shippable** features (each is one `/ship-feature` run). Give each a short slug and one-line intent. Merge trivially-coupled bullets into one feature; split a bullet that's really two features. Number them F1, F2, ….

## Stage 2 — Predict each feature's touched surface  *(search the repo — don't guess)*
For every feature, pull the key **nouns / entities / routes / actions** from its wording, then actually search `$APP_REPO` for where they live (use `Grep`/`Explore` — ripgrep the terms; this is why the skill reads the real repo, not a mental model). Map hits to a surface set across these axes:
- **Backend modules**: routers/endpoints, services, DB models, schemas, workers — whatever module layout the repo shows.
- **Frontend**: routes/pages, components, hooks, shared libs/types.
- **Migrations**: does it need a schema change? → it will add a numbered migration file (flag it — this is a hotspot toucher).
- **Shared contracts / hotspots**: check the feature against EVERY entry of the profile hotspot list from above (generated contract regen? shared enum/registry? shared fixtures? shared UI scaffolding?). Flag each hotspot it hits.
Record per feature: `{backend: [...], frontend: [...], migration: yes/no, hotspots: [...]}`. When a term is ambiguous or you can't find it, say so (an unknown surface is a risk, not a zero).

## Stage 3 — Score pairwise overlap
Build an F×F matrix. For each pair, classify the strongest overlap:
- **HARD** — they share a hotspot from the profile list (e.g. both add a numbered migration; both regenerate the API contract; both edit the same shared enum/fixture file) OR both edit the same specific file. These *will* conflict.
- **SOFT** — they share a module/directory (same router, service, component tree, route group) but not the same file/hotspot. May conflict; needs care.
- **NONE** — disjoint surfaces.
Summarize as a compact matrix (F1..Fn on both axes, cells `H`/`S`/`·`) plus a one-line reason for every H and notable S.

## Stage 4 — Propose the dispatch plan
From the matrix, produce:
- **(a) Co-ride groupings.** Features whose overlap is so heavy (share a hotspot *and* core modules, or are HARD with each other and small) that splitting them across lanes guarantees painful merges → recommend building them **together in ONE lane** on one branch (sequential commits, no cross-lane merge between them). Keep groups minimal — only co-locate what truly must.
- **(b) Lane assignment across N lanes.** Bin-pack the features/groups into ≤ N lanes to **minimize cross-lane overlap**: never put two HARD-linked items in *different concurrent lanes*; spread hotspot-touchers so no two migration-adders (or two API-changers) run in parallel across lanes. Balance load. If there are more hotspot-touchers than can be separated, resolve it with order (c).
- **(c) Dispatch ORDER — serialize the hotspot-touchers.** When two lanes must each touch a hotspot (e.g. both add a migration, both regenerate the API contract), give an explicit order: dispatch the first, let it **merge to `development`**, THEN dispatch the second so it rebases onto the first's migration number / regenerated contract / enum. Present as a short ordered list with the reason each edge is serialized ("F3 after F1 — both add a migration"). Non-overlapping lanes dispatch in parallel immediately.
- **(d) Per-feature `/ship-feature` invocations.** One line per feature (or per co-ride group), ready to paste: `/ship-feature <concise requirement text>` — carry enough of the human's wording that the lane has the acceptance intent. For a co-ride group, one invocation listing the grouped features.

## Output format
Print the plan **inline in your response** as the primary deliverable (the human reviews it before dispatching), and optionally save a copy to a gitignored planning file if the human wants one (`docs/superpowers/specs/split-batch-$(date +%Y%m%d).md`) — never commit it, never write lane state. Structure:

```
# Batch split — <n> features across <N> lanes

## Features
F1 <slug> — <intent> · surface: be[…] fe[…] migration:<y/n> hotspots:[…]
…

## Overlap matrix
        F1 F2 F3 …
   F1    ·  H  S
   F2       ·  ·
   …
Reasons: F1×F2 HARD — both add a migration (NNN collision). F1×F3 SOFT — share cabinets router. …

## Plan
(a) Co-ride: {F2,F5} together in one lane — share the wizard + both add audit actions.
(b) Lanes: L1={F2,F5}  L2={F1}  L3={F3}  L4={F4}  (F6 deferred / needs clarification: …)
(c) Order: F1 → F3 (both migrate); F4 parallel; {F2,F5} parallel with F1.
(d) Dispatch:
    /ship-feature <F1 …>
    /ship-feature <F3 …>   # after F1 merges (migration order)
    /ship-feature <F2 + F5 …>
    /ship-feature <F4 …>

## Risks / open questions
- <ambiguous requirement, unknown surface, or a hotspot clash you couldn't fully separate>
```

Keep it scannable. Lead with the assignment + order (what the human acts on); the matrix and surfaces are the justification. Flag anything you couldn't resolve as an explicit open question rather than guessing.
