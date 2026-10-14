// Pure view logic for the lane sidebar/header — kept out of components so it is unit-tested.

const RUNNING = new Set(['running', 'provisioning']);
const FREE = new Set(['idle', 'down', '']);

export function laneAttention(l) {
  if (l.pending_kind) return 'question';
  if (l.stage === 'spec-review' && l.status === 'waiting') return 'approve';
  if (l.status === 'blocked') return 'blocked';
  if (l.liveness === 'dead') return 'dead';
  if (l.needs_action) return 'needs';
  return null;
}

function rank(l) {
  if (laneAttention(l)) return 0;
  if (RUNNING.has(l.status)) return 1;
  return 2;
}

export function sortLanes(lanes) {
  return [...lanes].sort((a, b) => rank(a) - rank(b) || a.lane - b.lane);
}

export function isFree(l) {
  return !l.session_running && FREE.has(l.status || '');
}

export function primaryActions(l, { archived = false } = {}) {
  if (archived) return [];
  const out = [];
  if (l.session_running && l.stage === 'spec-review' && l.status === 'waiting') out.push('approve');
  if (l.session_running) out.push('stop');
  else if (l.session_resumable) out.push('resume');
  else if (isFree(l)) out.push('assign');
  return out.slice(0, 2);
}

export function mergeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  const byId = new Map();
  for (const e of steps) {
    if (!e || !e.id) continue;
    const prev = byId.get(e.id);
    const started = prev?.started ?? (e.event === 'start' ? e.at : undefined);
    byId.set(e.id, { ...(prev || {}), ...e, started });
  }
  return [...byId.values()];
}
