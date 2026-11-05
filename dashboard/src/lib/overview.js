// A project's overview at a glance: its features by status, the AI agents working right now, what
// needs a person, and what it cost this month. Pure: built from the platform's runs and /api/lanes.
import { laneAttention } from './laneview.js';
import { sumTokens } from './costs.js';

/** Run status (orchestrator RunStatus) → the overview's buckets. */
export const FEATURE_BUCKETS = ['running', 'waiting', 'releasing', 'done', 'cancelled'];
const BUCKET = { RUNNING: 'running', WAITING_REVIEW: 'waiting', RELEASING: 'releasing', DONE: 'done', CANCELLED: 'cancelled' };

/** Feature runs only: project-rules (SETUP) and architecture (BLUEPRINT) runs are not features. */
export const isFeatureRun = r => !r.kind || r.kind === 'FEATURE';

export function featureStats(runs = []) {
  const out = Object.fromEntries(FEATURE_BUCKETS.map(b => [b, 0]));
  let total = 0;
  for (const r of runs) {
    if (!isFeatureRun(r)) continue;
    total += 1;
    const b = BUCKET[r.status];
    if (b) out[b] += 1;
  }
  const finished = out.done + out.cancelled;
  return { ...out, total, open: total - finished, donePct: total ? Math.round((out.done / total) * 100) : null };
}

const WORKING = new Set(['running', 'waiting', 'blocked']);

/** Lanes of the project with an AI session at work (or holding a step), longest-running first. */
export function activeAgents(lanes = []) {
  return lanes
    .filter(l => l.session_running || l.session_active || (WORKING.has(l.status) && l.feature_title))
    .map(l => ({
      lane: l.lane,
      title: l.feature_title || '',
      stage: l.stage || '',
      status: l.status || '',
      since: Number.isFinite(l.stage_age_sec) ? l.stage_age_sec : null,
      progress: l.progress ?? null,
      runId: l.run_id || '',
      live: !!(l.session_running || l.session_active),
      attention: laneAttention(l),
    }))
    .sort((a, b) => Number(b.live) - Number(a.live) || (b.since ?? -1) - (a.since ?? -1) || a.lane - b.lane);
}

/** What needs a person: lanes asking, blocked or held, and pull requests waiting to be merged. */
export function attentionItems(lanes = []) {
  const out = [];
  for (const l of lanes) {
    const why = laneAttention(l);
    if (why) out.push({ kind: why, lane: l.lane, title: l.feature_title || '', note: l.needs_action || l.notes || '', runId: l.run_id || '' });
    else if (l.pr_url && !['done', 'merged'].includes((l.stage || '').toLowerCase())) {
      out.push({ kind: 'pr', lane: l.lane, title: l.feature_title || '', note: '', url: l.pr_url, runId: l.run_id || '' });
    }
  }
  return out;
}

/** The project's cost this month, or null when the caller may not see it (no cost data sent). */
export function projectCost(projectCosts, pid, lanes = []) {
  const pc = (projectCosts?.byProject || []).find(x => String(x.projectId) === String(pid));
  if (pc) return { vnd: pc.vnd || 0, usd: pc.usd || 0, tokens: sumTokens(pc.tokens), quotaPct: pc.quotaPct ?? null, month: projectCosts.month };
  const withCost = lanes.filter(l => l.cost_vnd != null || l.cost_usd != null);
  if (!withCost.length) return null;
  return {
    vnd: withCost.reduce((s, l) => s + (Number(l.cost_vnd) || 0), 0),
    usd: withCost.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0),
    tokens: 0, quotaPct: null, month: projectCosts?.month,
  };
}

/** The latest feature runs, most recently changed first. */
export function recentRuns(runs = [], limit = 6) {
  const t = r => Date.parse(r.updatedAt || r.createdAt || 0) || 0;
  return runs.filter(isFeatureRun).sort((a, b) => t(b) - t(a)).slice(0, limit);
}
