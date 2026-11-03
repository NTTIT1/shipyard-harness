import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';
import { phaseOf } from './usage.js';

// Quota guard: every lane obeys every limit that applies to it — the month's shared budget, its own lane
// limit, its project's, the model's it runs on, the workflow step's VND budget, and Claude's own plan
// windows. At warnPct the lane's chat gets a warning; at 100% the lane stops (session interrupted, no new
// step, no new feature) and waits for an admin to grant more, reset the counter, or switch model.

export const DEFAULT_WARN_PCT = 80;
const num = v => (Number.isFinite(+v) ? +v : 0);
const round1 = v => Math.round(v * 10) / 10;
const sumTok = r => num(r.in) + num(r.out) + num(r.cacheRead) + num(r.cacheWrite);

/** "claude:claude-opus-5-5" → "claude-opus-5-5"; "gemini:x" → "gemini/x" (the name the gateway reports). */
export function usageModelName(model) {
  const m = String(model || '');
  if (!m) return '';
  const i = m.indexOf(':');
  if (i < 0) return m;
  const prov = m.slice(0, i), id = m.slice(i + 1);
  return prov === 'claude' ? id : `${prov}/${id}`;
}
export const isClaudeModel = m => /^claude/.test(usageModelName(m)) && !usageModelName(m).includes('/');

/** % of a USD/token limit: USD when the usage has a price, tokens for free (gateway) usage. */
export function pctOf({ usd, tokens, limitUsd, limitTokens }) {
  if (limitUsd > 0 && (usd > 0 || !(limitTokens > 0))) return (usd / limitUsd) * 100;
  if (limitTokens > 0) return (tokens / limitTokens) * 100;
  return 0;
}

const levelOf = (pct, warnPct) => (pct >= 100 ? 'blocked' : pct >= warnPct ? 'warn' : 'ok');

/** Usage of one limit this month (since its reset, if any); null when no limit is set. */
function measure({ inMonth, resets, warnPct }, scope, key, label, lim, keep) {
  const limitUsd = num(lim?.usd), limitTokens = num(lim?.tokens);
  const id = `${scope}:${key}`;
  const since = resets[id] ? Date.parse(resets[id]) : 0;
  let usd = 0, tokens = 0;
  for (const r of inMonth) {
    if (!keep(r) || (since && Date.parse(r.at) < since)) continue;
    usd += num(r.usd); tokens += sumTok(r);
  }
  const set = limitUsd > 0 || limitTokens > 0;
  const unit = limitUsd > 0 && (usd > 0 || !(limitTokens > 0)) ? 'usd' : limitTokens > 0 ? 'tokens' : 'usd';
  const pct = set ? round1(pctOf({ usd, tokens, limitUsd, limitTokens })) : 0;
  return { id, scope, key, label, usd: Math.round(usd * 1e6) / 1e6, tokens, limitUsd, limitTokens, unit,
    used: unit === 'usd' ? usd : tokens, limit: unit === 'usd' ? limitUsd : limitTokens, enforced: set,
    pct, level: set ? levelOf(pct, warnPct) : 'ok', grantable: true, resettable: true, since: resets[id] || null };
}

function monthScope(records, settings, now) {
  const warnPct = num(settings.quotaWarnPct) > 0 ? num(settings.quotaWarnPct) : DEFAULT_WARN_PCT;
  const tz = num(settings.tzOffsetMin) * 60000;
  const monthOf = at => new Date(Date.parse(at) + tz).toISOString().slice(0, 7);
  const month = monthOf(now.toISOString());
  return { warnPct, month, resets: settings.quotaResets || {}, inMonth: records.filter(r => r && r.at && monthOf(r.at) === month) };
}

/** Claude's plan windows as checks (read-only: Anthropic sets and lifts them). */
function planChecks(plan, warnPct, now) {
  const out = [];
  for (const [k, w] of Object.entries(plan || {})) {
    if (!w) continue;
    const resetsAt = w.resetsAt && Date.parse(w.resetsAt) > now.getTime() ? w.resetsAt : null;
    const u = w.utilization == null ? null : num(w.utilization) <= 1.5 ? num(w.utilization) * 100 : num(w.utilization);
    const refused = w.status === 'rejected' && resetsAt;
    if (!refused && (u == null || !resetsAt)) continue;
    const pct = refused ? 100 : round1(u);
    const lvl = levelOf(pct, warnPct);
    out.push({ id: `plan:${k}`, scope: 'plan', key: k, label: `Gói Claude (${k})`, unit: 'pct', used: pct, limit: 100, enforced: true,
      pct, level: refused ? 'blocked' : lvl === 'blocked' ? 'warn' : lvl, resetsAt, grantable: false, resettable: false });
  }
  return out;
}

/**
 * Which limits lane `lane` is under right now, and where each stands.
 *   records   usage.jsonl rows of every lane     settings  config/costs.json (mergeSettings)
 *   models    models the lane is about to use    ctx       { projectId, runId, phase, stepConfig }
 *   plan      run/usage-plan.json                 now       Date
 */
export function evaluateQuota({ records = [], settings, lane, models = [], ctx = {}, plan = {}, now = new Date() }) {
  const m = monthScope(records, settings, now);
  const { warnPct } = m;
  const names = [...new Set(models.map(usageModelName).filter(Boolean))];
  const checks = [];
  const add = (...a) => { const c = measure(m, ...a); if (c.enforced) checks.push(c); };

  add('month', 'all', 'Hạn mức chung tháng', { usd: settings.monthlyBudgetUsd, tokens: settings.monthlyTokenLimit }, () => true);
  const laneLim = (settings.laneLimits || {})[String(lane)];
  if (laneLim) add('lane', String(lane), `Hạn mức lane ${lane}`, laneLim, r => Number(r.lane) === Number(lane));
  const pid = ctx.projectId || '';
  const projLim = pid && (settings.projectLimits || {})[pid];
  if (projLim) add('project', pid, 'Hạn mức dự án', projLim, r => (r.projectId || ctx.defaultProjectId || '') === pid);
  for (const m of names) {
    const lim = (settings.modelLimits || {})[m];
    if (lim) add('model', m, `Hạn mức model ${m}`, lim, r => r.model === m);
  }

  // The workflow step's budget (VND) for this run, frozen into the lane's state by the platform run.
  const phase = ctx.phase || '';
  const budget = num(((ctx.stepConfig || {})[phase] || {}).budgetVnd);
  if (ctx.runId && phase && budget > 0) {
    const rate = num(settings.usdToVnd) || 26000;
    const usd = records.filter(r => r.runId === ctx.runId && (r.phase || phaseOf(r.step, r.stage)) === phase)
      .reduce((s, r) => s + num(r.usd), 0);
    const vnd = Math.round(usd * rate);
    const pct = round1((vnd / budget) * 100);
    checks.push({ id: `phase:${phase}`, scope: 'phase', key: phase, label: `Ngân sách bước ${phase}`, unit: 'vnd',
      used: vnd, limit: budget, pct, level: levelOf(pct, warnPct), grantable: true, resettable: false });
  }

  // Claude's own plan windows: Anthropic refuses and resets them by itself.
  if (names.some(isClaudeModel)) checks.push(...planChecks(plan, warnPct, now));

  const blocking = checks.filter(c => c.level === 'blocked');
  const warning = checks.filter(c => c.level === 'warn');
  return { level: blocking.length ? 'blocked' : warning.length ? 'warn' : 'ok', warnPct, checks, blocking, warning };
}

/**
 * Every limit on the machine for the admin's quota screen: the month, each project / lane / model (set or
 * not — an unset one does not stop anything), Claude's plan windows, and the lanes held right now.
 *   lanes: [{ lane, run_project_id, feature_title, quota_hold }]
 */
export function quotaBoard({ records = [], settings, lanes = [], plan = {}, now = new Date(), defaultProjectId = '' }) {
  const m = monthScope(records, settings, now);
  const pidOf = r => r.projectId || defaultProjectId || '';
  const keys = (limits, fromRecords, extra = []) => [...new Set([...Object.keys(limits || {}), ...m.inMonth.map(fromRecords).filter(Boolean).map(String), ...extra.map(String)])];
  const sortPct = (a, b) => (b.enforced - a.enforced) || (b.pct - a.pct) || (b.usd - a.usd);
  const month = measure(m, 'month', 'all', 'Hạn mức chung tháng', { usd: settings.monthlyBudgetUsd, tokens: settings.monthlyTokenLimit }, () => true);
  const project = keys(settings.projectLimits, pidOf, lanes.map(l => l.run_project_id).filter(Boolean))
    .map(p => ({ ...measure(m, 'project', p, p, (settings.projectLimits || {})[p], r => pidOf(r) === p),
      lanes: [...new Set(lanes.filter(l => l.run_project_id === p).map(l => l.lane))].sort((a, b) => a - b) })).sort(sortPct);
  const lane = keys(settings.laneLimits, r => r.lane, lanes.map(l => l.lane))
    .map(k => ({ ...measure(m, 'lane', k, `Lane ${k}`, (settings.laneLimits || {})[k], r => String(r.lane) === k),
      projectId: lanes.find(l => String(l.lane) === k)?.run_project_id || '', feature: lanes.find(l => String(l.lane) === k)?.feature_title || '' }))
    .sort((a, b) => Number(a.key) - Number(b.key));
  const model = keys(settings.modelLimits, r => r.model)
    .map(k => measure(m, 'model', k, k, (settings.modelLimits || {})[k], r => r.model === k)).sort(sortPct);
  const held = lanes.filter(l => l.quota_hold).map(l => ({ lane: l.lane, at: l.quota_hold.at, checks: l.quota_hold.checks, feature: l.feature_title || '', projectId: l.run_project_id || '' }));
  return { warnPct: m.warnPct, month: m.month, rows: { month: [month], project, lane, model, plan: planChecks(plan, m.warnPct, now) }, held };
}

/** One line a person reads: "Hạn mức model claude-opus-5-5: $10.20 / $10.00 (102%)". */
export function describeCheck(c) {
  const fmt = (v, unit) => (unit === 'usd' ? `$${num(v).toFixed(2)}` : unit === 'vnd' ? `${Math.round(v).toLocaleString('vi-VN')} ₫`
    : unit === 'tokens' ? `${Math.round(v).toLocaleString('vi-VN')} token` : `${v}%`);
  if (c.scope === 'plan') return `${c.label}: ${c.level === 'blocked' ? 'Anthropic đã từ chối' : `đã dùng ${c.pct}%`}`;
  return `${c.label}: ${fmt(c.used, c.unit)} / ${fmt(c.limit, c.unit)} (${c.pct}%)`;
}

/**
 * An admin's way out of a blocked check. grant: raise the limit to what was used + `add` (USD, tokens, or
 * VND for a workflow step). reset: count usage again from now. Returns the settings patch, or for a
 * workflow step the new step_config the lane's state takes.
 */
export function grantPatch(settings, check, add) {
  const a = num(add);
  if (!(a > 0)) throw Object.assign(new Error('số cấp thêm phải lớn hơn 0'), { status: 400 });
  if (check.scope === 'plan') throw Object.assign(new Error('gói Claude do Anthropic đặt — chờ hồi lượt hoặc đổi model'), { status: 400 });
  const unit = check.unit;
  const field = unit === 'tokens' ? 'tokens' : 'usd';
  const next = Math.round((Math.max(num(check.limit), num(check.used)) + a) * 100) / 100;
  if (check.scope === 'phase') return { phase: check.key, budgetVnd: Math.round(next) };
  if (check.scope === 'month') return field === 'usd' ? { monthlyBudgetUsd: next } : { monthlyTokenLimit: next };
  const map = { lane: 'laneLimits', model: 'modelLimits', project: 'projectLimits' }[check.scope];
  if (!map) throw Object.assign(new Error('không cấp thêm được cho hạn mức này'), { status: 400 });
  return { [map]: { [check.key]: { ...((settings[map] || {})[check.key] || {}), [field]: next } } };
}

// ---- hold: a lane stopped by its quota, until an admin lets it go on ----

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
const holdFile = n => path.join(root(), 'run', `lane${n}`, 'quota-hold.json');
const warnFile = n => path.join(root(), 'run', `lane${n}`, 'quota-warned.json');

export function readHold(n) {
  try { return JSON.parse(fs.readFileSync(holdFile(n), 'utf8')); } catch { return null; }
}
export function writeHold(n, hold) {
  fs.mkdirSync(path.dirname(holdFile(n)), { recursive: true });
  fs.writeFileSync(holdFile(n), JSON.stringify(hold, null, 2) + '\n');
}
export function clearHold(n) { try { fs.rmSync(holdFile(n), { force: true }); } catch { /* none */ } }

/** Warnings not yet shown for this month / since the last reset (one card per limit, not one per turn). */
export function newWarnings(n, q, month) {
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(warnFile(n), 'utf8')); } catch { /* none yet */ }
  const fresh = q.warning.filter(c => seen[c.id] !== `${month}|${c.since || ''}`);
  if (fresh.length) {
    for (const c of fresh) seen[c.id] = `${month}|${c.since || ''}`;
    fs.mkdirSync(path.dirname(warnFile(n)), { recursive: true });
    fs.writeFileSync(warnFile(n), JSON.stringify(seen) + '\n');
  }
  return fresh;
}
