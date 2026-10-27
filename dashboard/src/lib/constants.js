import {
  FileText, Compass, Hammer, FlaskConical, Clapperboard, Eye, Search, ShieldCheck, GitPullRequest,
  RefreshCw, GitMerge, Globe, CircleCheck, Wrench, OctagonX, Ticket,
} from 'lucide-react';

export const NODES = [
  ['intake', FileText, 43], ['plan', Compass, 151], ['implement', Hammer, 258], ['gates', FlaskConical, 366],
  ['e2e', Clapperboard, 474], ['review', Eye, 581], ['QC', Search, 689], ['sr gate', ShieldCheck, 797],
  ['PR', GitPullRequest, 904], ['watch PR', RefreshCw, 1012], ['merged', GitMerge, 1120], ['dev QC', Globe, 1227],
  ['done', CircleCheck, 1335],
];

export const MAINY = 66;
export const BUS = 196;
export const BLKY = 146;
export const FIXN = ['fix on branch', Wrench, 366, BUS];
export const BLKN = ['', OctagonX, 845, BLKY];
export const TKT = ['ticket', Ticket, 948, 20];

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

// Role-pipeline stages (role-<step> = the AI works on it, review-<step> = waiting for its reviewer)
// sit on the map where that work happens: documents in plan, DEV in implementing, TEST in QC.
// A lane may also name the step alone (arch, test…).
const ROLE_PHASE = { pm: 'plan', ba: 'plan', arch: 'plan', design: 'plan', dev: 'implementing', test: 'qc' };

export function phaseIdx(stage) {
  const role = /^(?:(?:role|review)-)?(pm|ba|arch|design|dev|test)$/.exec(stage || '');
  const s = role ? ROLE_PHASE[role[1]] : stage;
  return PHASES.findIndex(p => p.includes(s));
}

export const ACT_CONFIRM = {
  up:     { m: "Boot / rebuild this lane's stack.", y: 'Boot' },
  down:   { m: "Stop this lane's stack (kills its servers, frees its ports).", y: 'Stop' },
  clear:  { m: 'Reset the status fields only (the "done with this feature" tidy-up). Does not touch code or the DB.', y: 'Clear' },
  reset:  { m: "Clean development + fresh DB — this wipes the lane's feature work.", y: 'Reset', cls: 'warn' },
  remove: { m: 'Deletes the clone, its databases, and state — no undo.', y: 'Remove', cls: 'warn' },
};
