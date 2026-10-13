export const NODES = [
  ['intake', '\u{1F4DD}', 43], ['plan', '\u{1F9ED}', 151], ['implement', '\u{1F6E0}️', 258], ['gates', '\u{1F9EA}', 366],
  ['e2e', '\u{1F3AD}', 474], ['review', '\u{1F440}', 581], ['QC', '\u{1F50D}', 689], ['sr gate', '\u{1F6A6}', 797],
  ['PR', '\u{1F500}', 904], ['watch PR', '\u{1F501}', 1012], ['merged', '\u{1F91D}', 1120], ['dev QC', '\u{1F310}', 1227],
  ['done', '✅', 1335],
];

export const MAINY = 66;
export const BUS = 196;
export const BLKY = 146;
export const FIXN = ['fix on branch', '\u{1F527}', 366, BUS];
export const BLKN = ['', '⛔', 845, BLKY];
export const TKT = ['ticket', '\u{1F3AB}', 948, 20];

// One inner array per NODES entry; phaseIdx(stage) -> node index. Stage names
// from the RETIRED integration flow (integrate/dev-gates/e2e-on-dev/push-dev,
// pre-2026-07-16) are folded into the nearest surviving phase so past feature
// cards keep rendering.
export const PHASES = [
  ['assigned', 'intake', 'claimed', 'bootstrapping'], ['plan', 'spec-review'], ['implementing'],
  ['pre-push-gate', 'migration-collision', 'spec-collision', 'sync-conflict'],
  ['e2e-feature', 'e2e-feature-passed', 'e2e-scoped', 'booting', 'live',
    'integrated-testing', 'integrate-conflict', 'dev-gate', 'e2e', 'e2e-passed'],
  ['review'], ['qc-plan', 'qc'],
  ['gate', 'gate-blocked'],
  ['publishing', 'pr-open', 'reported', 'ticketed',
    'pushing-development', 'pushed-development', 'push-conflict', 'push-revalidate'],
  ['watching-pr'],
  ['merged'], ['qc-dev'], ['done'],
];

export function phaseIdx(stage) {
  return PHASES.findIndex(p => p.includes(stage));
}

export const ACT_CONFIRM = {
  up:     { m: "Boot / rebuild this lane's stack.", y: 'Boot' },
  down:   { m: "Stop this lane's stack (kills its servers, frees its ports).", y: 'Stop' },
  clear:  { m: 'Reset the status fields only (the "done with this feature" tidy-up). Does not touch code or the DB.', y: 'Clear' },
  reset:  { m: "Clean development + fresh DB — this wipes the lane's feature work.", y: 'Reset', cls: 'warn' },
  remove: { m: 'Deletes the clone, its databases, and state — no undo.', y: 'Remove', cls: 'warn' },
};
