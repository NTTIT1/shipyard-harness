import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';

// Token & cost tracking. Claude reports CUMULATIVE per-model usage (modelUsage, incl. subagents)
// on every result; we store per-turn deltas in run/laneN/usage.jsonl (append-only, survives
// feature changes) tagged with lane / feature / step, and aggregate on request.
// Costs are Claude Code's API list-price estimates; on a subscription the "real" cost is the
// monthly plan fee allocated by each record's share of the month's API-equivalent value.

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const PHASES = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST', 'ORCH'];
export const PHASE_ROLE = { PM: 'PM', BA: 'BA', ARCH: 'TECH_LEAD', DESIGN: 'DESIGNER', DEV: 'DEVELOPER', TEST: 'TESTER' };

export const DEFAULT_SETTINGS = {
  usdToVnd: 26000,
  planFeeVnd: 0,            // monthly subscription fee; 0 = price at API list price × usdToVnd
  tzOffsetMin: 420,         // days/months are counted in this zone (Vietnam = UTC+7)
  rates: { PM: 150000, BA: 120000, TECH_LEAD: 200000, DESIGNER: 120000, DEVELOPER: 150000, TESTER: 100000 }, // VND / hour
  hours: { PM: 2, BA: 3, ARCH: 4, DESIGN: 6, DEV: 16, TEST: 4 },   // estimated human hours per feature
  featureHours: {},         // { featureKey: { PHASE: hours } }
};

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
const usageFile = n => path.join(root(), 'run', `lane${n}`, 'usage.jsonl');
const cursorFile = n => path.join(root(), 'run', `lane${n}`, 'usage-cursor.json');
const settingsFile = () => path.join(root(), 'config', 'costs.json');
const planFile = () => path.join(root(), 'run', 'usage-plan.json');

const num = v => (Number.isFinite(+v) ? +v : 0);
const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

/** Per-model growth between two cumulative modelUsage snapshots (a shrink = fresh start). */
export function diffModelUsage(prev = {}, cur = {}) {
  const out = {};
  for (const [model, c] of Object.entries(cur || {})) {
    const p = (prev || {})[model] || {};
    const pick = u => ({ in: num(u.inputTokens), out: num(u.outputTokens), cacheRead: num(u.cacheReadInputTokens),
      cacheWrite: num(u.cacheCreationInputTokens), usd: num(u.costUSD) });
    const a = pick(c), b = pick(p);
    const shrank = Object.keys(a).some(k => a[k] < b[k]);
    const d = shrank ? a : Object.fromEntries(Object.keys(a).map(k => [k, k === 'usd' ? round(a[k] - b[k]) : a[k] - b[k]]));
    if (d.in || d.out || d.cacheRead || d.cacheWrite || d.usd) out[model] = d;
  }
  return out;
}

const STEP_PHASE = {
  pm: 'PM', ba: 'BA', arch: 'ARCH', 'plan-critic': 'ARCH', design: 'DESIGN',
  'impl-worker': 'DEV', 'code-review': 'DEV', 'senior-gate': 'DEV',
  test: 'TEST', 'qc-local': 'TEST', 'dev-qc': 'TEST', ticketer: 'ORCH',
};
const STAGE_PHASE = [
  [/^review-(pm|ba|arch|design|dev|test)$/, m => m[1].toUpperCase()],
  [/^(spec|pm)/, () => 'PM'], [/^ba\b/, () => 'BA'], [/^(plan|arch)/, () => 'ARCH'], [/^design/, () => 'DESIGN'],
  [/^(qc|test|dev-qc|e2e)/, () => 'TEST'],
  [/^(implement|gates|review|senior|push|pr|ci|watch|sync|fix|merge)/, () => 'DEV'],
];

/** Which pipeline phase a step (or, for the main session, the lane stage) belongs to. */
export function phaseOf(step, stage = '') {
  if (step !== 'main') return STEP_PHASE[step] || 'ORCH';
  const s = String(stage || '').toLowerCase();
  for (const [re, f] of STAGE_PHASE) { const m = re.exec(s); if (m) return f(m); }
  return 'ORCH';
}

export function featureKey({ runId, specDir, featureTitle, lane }) {
  if (runId) return runId;
  if (specDir) return `lane${lane}:${specDir}`;
  return `lane${lane}:${featureTitle || 'unknown'}`;
}

export function toRecords(ctx, delta) {
  const base = {
    at: ctx.at || new Date().toISOString(), lane: ctx.lane, source: ctx.source || 'session', step: ctx.step || 'main',
    stage: ctx.stage || '', phase: phaseOf(ctx.step || 'main', ctx.stage), effort: ctx.effort || '',
    runId: ctx.runId || '', feature: featureKey(ctx), featureTitle: ctx.featureTitle || '',
  };
  const order = ['at', 'lane', 'source', 'step', 'stage', 'phase', 'model', 'effort', 'runId', 'feature', 'featureTitle'];
  return Object.entries(delta).map(([model, d]) => {
    const r = { ...base, model };
    return { ...Object.fromEntries(order.map(k => [k, r[k]])), ...d };
  });
}

/** Feature context of lane N from its active state file (state/laneN/<feature>.json). */
export function readLaneContext(n) {
  const dir = path.join(root(), 'state', `lane${n}`);
  let file = `${dir}.json`;
  try {
    const active = fs.readFileSync(path.join(dir, '.active'), 'utf8').trim();
    file = path.join(dir, active ? `${active}.json` : '_pending.json');
  } catch { /* flat or pending state */ }
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { runId: s.run_id || '', specDir: s.spec_dir || '', featureTitle: s.feature_title || '', stage: s.stage || '',
      effort: (s.effort || {}).main || '' };
  } catch { return {}; }
}

export function appendUsage(n, records) {
  if (!records.length) return;
  fs.mkdirSync(path.dirname(usageFile(n)), { recursive: true });
  fs.appendFileSync(usageFile(n), records.map(r => JSON.stringify(r)).join('\n') + '\n');
}

/** Main-session bookkeeping: delta against the last snapshot of the same Claude session. */
export function recordSessionResult(n, sessionId, modelUsage, ctx) {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(cursorFile(n), 'utf8')); } catch { /* first result */ }
  const prev = cur.session_id === sessionId ? cur.modelUsage : {};
  const delta = diffModelUsage(prev, modelUsage);
  appendUsage(n, toRecords({ ...ctx, lane: n, source: 'session', step: 'main' }, delta));
  fs.writeFileSync(cursorFile(n), JSON.stringify({ session_id: sessionId, modelUsage }) + '\n');
  return delta;
}

export function recordRateLimit(info) {
  if (!info?.rateLimitType) return;
  let plan = {};
  try { plan = JSON.parse(fs.readFileSync(planFile(), 'utf8')); } catch { /* none yet */ }
  plan[info.rateLimitType] = { utilization: info.utilization ?? null, status: info.status || '',
    resetsAt: info.resetsAt ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : null,
    updated: new Date().toISOString() };
  fs.mkdirSync(path.dirname(planFile()), { recursive: true });
  fs.writeFileSync(planFile(), JSON.stringify(plan, null, 2) + '\n');
}

export function readPlan() {
  try { return JSON.parse(fs.readFileSync(planFile(), 'utf8')); } catch { return {}; }
}

export function readAllUsage() {
  const dir = path.join(root(), 'run');
  const out = [];
  let lanes = [];
  try { lanes = fs.readdirSync(dir).filter(d => /^lane\d+$/.test(d)); } catch { return out; }
  for (const d of lanes) {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, d, 'usage.jsonl'), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* torn line */ }
    }
  }
  return out;
}

export function mergeSettings(s = {}) {
  return {
    ...DEFAULT_SETTINGS, ...s,
    rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates || {}) },
    hours: { ...DEFAULT_SETTINGS.hours, ...(s.hours || {}) },
    featureHours: { ...(s.featureHours || {}) },
  };
}

export function readSettings() {
  try { return mergeSettings(JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { return mergeSettings(); }
}

function cleanMap(src, keys) {
  const out = {};
  for (const k of keys) if (src && src[k] !== undefined && src[k] !== '') {
    const v = Number(src[k]);
    if (!Number.isFinite(v) || v < 0) throw Object.assign(new Error(`${k}: phải là số ≥ 0`), { status: 400 });
    out[k] = v;
  }
  return out;
}

export function writeSettings(patch) {
  const cur = readSettings();
  const next = mergeSettings({
    ...cur,
    ...cleanMap(patch, ['usdToVnd', 'planFeeVnd']),
    rates: { ...cur.rates, ...cleanMap(patch.rates, Object.keys(DEFAULT_SETTINGS.rates)) },
    hours: { ...cur.hours, ...cleanMap(patch.hours, Object.keys(DEFAULT_SETTINGS.hours)) },
  });
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function setFeatureHours(key, hours) {
  if (!key || typeof key !== 'string' || key.length > 200) throw Object.assign(new Error('feature không hợp lệ'), { status: 400 });
  const cur = readSettings();
  const clean = cleanMap(hours, Object.keys(DEFAULT_SETTINGS.hours));
  const featureHours = { ...cur.featureHours };
  if (Object.keys(clean).length) featureHours[key] = clean; else delete featureHours[key];
  const next = { ...cur, featureHours };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2) + '\n');
  return next;
}

const zeroTok = () => ({ in: 0, out: 0, cacheRead: 0, cacheWrite: 0 });
function add(acc, r, vnd) {
  acc.usd = round((acc.usd || 0) + num(r.usd));
  acc.vnd = (acc.vnd || 0) + vnd; // rounded once at the end (roundVnd) so allocations add up
  acc.tokens = acc.tokens || zeroTok();
  for (const k of Object.keys(acc.tokens)) acc.tokens[k] += num(r[k]);
  return acc;
}

/** Everything the Costs screen shows for one month (YYYY-MM in settings.tzOffsetMin). */
export function aggregate(records, settings = mergeSettings(), { month } = {}) {
  const local = at => new Date(Date.parse(at) + settings.tzOffsetMin * 60000).toISOString();
  const dayOf = at => local(at).slice(0, 10);
  const monthOf = at => local(at).slice(0, 7);
  const monthUsd = {};
  for (const r of records) monthUsd[monthOf(r.at)] = (monthUsd[monthOf(r.at)] || 0) + num(r.usd);
  const vndOf = r => (settings.planFeeVnd > 0
    ? (monthUsd[monthOf(r.at)] ? settings.planFeeVnd * num(r.usd) / monthUsd[monthOf(r.at)] : 0)
    : num(r.usd) * settings.usdToVnd);

  const m = month || monthOf(new Date().toISOString());
  const rows = records.filter(r => monthOf(r.at) === m);
  const totals = { usd: 0, vnd: 0, tokens: zeroTok() };
  const days = {}, lanes = {}, models = {}, feats = {};
  for (const r of rows) {
    const v = vndOf(r);
    add(totals, r, v);
    add(days[dayOf(r.at)] ||= { day: dayOf(r.at) }, r, v);
    add(lanes[r.lane] ||= { lane: r.lane }, r, v);
    add(models[r.model] ||= { model: r.model }, r, v);
    const f = feats[r.feature] ||= { key: r.feature, title: r.featureTitle, lane: r.lane, runId: r.runId || '', phases: {}, last: r.at };
    if (r.featureTitle) f.title = r.featureTitle;
    if (r.at > f.last) f.last = r.at;
    add(f, r, v);
    const ph = f.phases[r.phase || phaseOf(r.step, r.stage)] ||= { steps: {} };
    add(ph, r, v);
    const st = ph.steps[r.step] ||= { efforts: [] };
    add(st, r, v);
    if (r.effort && !st.efforts.includes(r.effort)) st.efforts.push(r.effort);
  }
  const devRate = settings.rates.DEVELOPER || 1;
  const features = Object.values(feats).map(f => {
    const over = settings.featureHours[f.key] || {};
    let humanVnd = 0;
    const hours = {};
    for (const [phase, role] of Object.entries(PHASE_ROLE)) {
      if (phase === 'DESIGN' && !f.phases.DESIGN && over.DESIGN === undefined) continue;
      hours[phase] = over[phase] ?? settings.hours[phase] ?? 0;
      humanVnd += hours[phase] * (settings.rates[role] || 0);
    }
    return { ...f, hours, humanVnd, aiHours: f.vnd / devRate, ratio: humanVnd ? f.vnd / humanVnd : null };
  }).sort((a, b) => b.vnd - a.vnd);
  return roundVnd({
    month: m, totals, features,
    byDay: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)),
    byLane: Object.values(lanes).sort((a, b) => a.lane - b.lane),
    byModel: Object.values(models).sort((a, b) => b.usd - a.usd),
    months: Object.keys(monthUsd).sort().reverse(),
  });
}

function roundVnd(o) {
  if (Array.isArray(o)) return o.map(roundVnd);
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (k === 'vnd' || k === 'humanVnd') && typeof v === 'number' ? Math.round(v) : roundVnd(v)]));
}

/** {step: level} with "" / "default" dropped; unknown steps or levels → 400. */
export function normalizeEfforts(map, stepIds) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (!stepIds.includes(k)) throw Object.assign(new Error(`${k}: bước không tồn tại`), { status: 400 });
    const lvl = String(v || '').toLowerCase();
    if (!lvl || lvl === 'default') continue;
    if (!EFFORTS.includes(lvl)) throw Object.assign(new Error(`${k}: mức effort không hợp lệ (${v})`), { status: 400 });
    out[k] = lvl;
  }
  return out;
}
