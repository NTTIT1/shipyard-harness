import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { HARNESS_ROOT, harnessConfig, laneBinding } from './config.js';
import { readAllUsage, readSettings, writeSettings, readPlan, readLaneContext, phaseOf } from './usage.js';
import { evaluateQuota, describeCheck, grantPatch, readHold, writeHold, clearHold, newWarnings, usageModelName } from './quota.js';
import { readAllLaneDefaults, readModelDefaults } from './providers.js';

// Applies the quota to the live lanes: a lane over a limit an admin set is held (its session interrupted,
// state blocked, a card in its chat) until an admin grants more / resets / switches model and lets it go
// on. Claude's own plan refusals keep the existing wake-up at the reset time (Anthropic lifts them itself).

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
// This checkout's state.sh (HARNESS_ROOT may point at another tree's data, e.g. in tests).
const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin');

let deps = {
  sessions: null,                // { isRunning, stopSession, startSession, sendMessage, sessionInfo, notify, cancelLimitWake }
  state: (n, args) => spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), ...args], { encoding: 'utf8', timeout: 15000 }),
  readLaneState: n => {
    const r = spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'get'], { encoding: 'utf8', timeout: 15000 });
    try { return JSON.parse(r.stdout || '{}'); } catch { return {}; }
  },
  records: readAllUsage,
  settings: readSettings,
  plan: readPlan,
  context: readLaneContext,
  now: () => new Date(),
};
export function configureQuotaGuard(d) { deps = { ...deps, ...d }; }

/** The model a lane's main session runs on: the feature's (changed by "Đổi model"), the session's, the lane default. */
function mainModel(n) {
  const chosen = ((deps.context(n) || {}).models || {}).main;
  if (chosen) return chosen;
  const info = deps.sessions?.sessionInfo?.(n);
  if (info?.model) return info.model;
  return (readAllLaneDefaults()[String(n)] || readModelDefaults()).main || 'claude:claude-opus-5-5';
}

/**
 * Where lane n stands. step: a headless run-step step (its phase and model), else the main session.
 * extra: usage not in usage.jsonl yet (the session's turn in progress).
 */
export function laneQuota(n, { model, step, extra = [] } = {}) {
  const ctx = deps.context(n) || {};
  const m = model || mainModel(n);
  return evaluateQuota({
    records: [...deps.records(), ...extra], settings: deps.settings(), lane: n, models: [m],
    ctx: { projectId: ctx.projectId || laneBinding(n)?.projectId || harnessConfig().platform_project_id || '', defaultProjectId: harnessConfig().platform_project_id || '',
      runId: ctx.runId, phase: step ? phaseOf(step) : phaseOf('main', ctx.stage), stepConfig: ctx.stepConfig },
    plan: deps.plan(), now: deps.now(),
  });
}

/** Limits an admin set and must lift — Claude's plan windows lift themselves. */
const adminBlocks = q => q.blocking.filter(c => c.scope !== 'plan');

/** The refusal a person or a queue sees when lane n may not start work ('' = it may). */
export function quotaGate(n, model) {
  const hold = readHold(n);
  if (hold) return `Lane ${n} đang dừng vì hết hạn mức (${hold.checks.map(describeCheck).join('; ')}) — quản trị viên cần cấp thêm hạn mức để làm tiếp`;
  const b = adminBlocks(laneQuota(n, { model }));
  return b.length ? `Lane ${n} hết hạn mức: ${b.map(describeCheck).join('; ')} — quản trị viên cần cấp thêm hạn mức` : '';
}

/** Stop lane n and wait for an admin. Idempotent. */
export function holdLane(n, checks, { source = 'session' } = {}) {
  const prev = readHold(n);
  if (prev) return prev;
  const st = deps.readLaneState(n) || {};
  const text = `Đã dừng lane ${n}: hết hạn mức — ${checks.map(describeCheck).join('; ')}`;
  const hold = { at: deps.now().toISOString(), source, checks, text, prevStatus: st.status || '', prevNotes: st.notes || '', posted: false };
  writeHold(n, hold);
  deps.state(n, ['set', 'status=blocked']);
  deps.state(n, ['set', `notes=Hết hạn mức — chờ quản trị viên cấp thêm`]);
  deps.state(n, ['set', 'needs_action=quota']);
  return deps.sessions ? postHold(n) : hold;
}

/** The dashboard's half of a hold: the card in the lane's chat, the session stopped, no wake-up. */
function postHold(n) {
  const hold = readHold(n);
  if (!hold || hold.posted) return hold;
  const S = deps.sessions;
  S.cancelLimitWake?.(n);
  const stopped = !!S.isRunning?.(n);
  const next = { ...hold, posted: true, sessionStopped: stopped || !!hold.sessionStopped };
  writeHold(n, next);
  S.notify?.(n, { kind: 'quota', level: 'blocked', checks: hold.checks, text: hold.text });
  if (stopped) S.stopSession(n);
  return next;
}

export const RESUME_MSG = 'Quản trị viên đã cấp thêm hạn mức trên dashboard (đây KHÔNG phải người duyệt). '
  + 'Đọc lại lane state và làm tiếp đúng bước đang dở; bước nào bị dừng vì hết hạn mức thì chạy lại bước đó. '
  + 'Đang chờ người duyệt thì vẫn chờ.';

/** Let lane n go on once nothing an admin set still blocks it. */
export function releaseLane(n, { by = '' } = {}) {
  const hold = readHold(n);
  const still = adminBlocks(laneQuota(n));
  if (still.length) throw Object.assign(new Error(`vẫn hết hạn mức: ${still.map(describeCheck).join('; ')}`), { status: 409, checks: still });
  clearHold(n);
  if (!hold) return { resumed: false };
  const status = hold.prevStatus && hold.prevStatus !== 'blocked' ? hold.prevStatus : 'running';
  deps.state(n, ['set', `status=${status}`]);
  deps.state(n, ['set', `notes=${hold.prevNotes || ''}`]);
  deps.state(n, ['set', 'needs_action=']);
  deps.sessions?.notify?.(n, { kind: 'quota', level: 'released', checks: [], text: `Đã cấp thêm hạn mức${by ? ` (${by})` : ''} — lane ${n} làm tiếp.` });
  const S = deps.sessions;
  let resumed = false;
  try {
    if (S?.isRunning?.(n)) { S.sendMessage(n, RESUME_MSG, { force: true }); resumed = true; }
    else if (hold.sessionStopped) {
      const info = S?.sessionInfo?.(n);
      if (info) { S.startSession(n, { model: mainModel(n), effort: info.effort || undefined, prompt: RESUME_MSG, resume: info.session_id }); resumed = true; }
    }
  } catch (e) {
    S?.notify?.(n, { kind: 'system', text: `không tự chạy lại được: ${e.message} — bấm Tiếp tục ở đầu lane` });
  }
  return { resumed };
}

/** Find a check of lane n by id (as the lane sees it now, or as it was when held). */
function findCheck(n, id) {
  const q = laneQuota(n);
  return q.checks.find(c => c.id === id) || (readHold(n)?.checks || []).find(c => c.id === id) || null;
}

/** Admin: raise the limit `id` by `add` (USD / tokens / VND for a workflow step), then release if clear. */
export function grantQuota(n, id, add, { by = '' } = {}) {
  const c = findCheck(n, id);
  if (!c) throw Object.assign(new Error('không tìm thấy hạn mức này'), { status: 404 });
  const patch = grantPatch(deps.settings(), c, add);
  if (patch.phase) {
    const sc = { ...((deps.context(n) || {}).stepConfig || {}) };
    sc[patch.phase] = { ...(sc[patch.phase] || {}), budgetVnd: patch.budgetVnd };
    const r = deps.state(n, ['set-json', 'step_config', JSON.stringify(sc)]);
    if (r && r.status) throw new Error(`không lưu được ngân sách bước: ${(r.stderr || '').trim()}`);
  } else writeSettings(patch);
  return afterChange(n, by);
}

/** Admin: count limit `id` again from now. */
export function resetQuota(n, id, { by = '' } = {}) {
  const c = findCheck(n, id);
  if (!c) throw Object.assign(new Error('không tìm thấy hạn mức này'), { status: 404 });
  if (!c.resettable) throw Object.assign(new Error('hạn mức này không đặt lại được — hãy cấp thêm'), { status: 400 });
  writeSettings({ quotaResets: { [id]: deps.now().toISOString() } });
  return afterChange(n, by);
}

function afterChange(n, by) {
  const q = laneQuota(n);
  if (!readHold(n) || adminBlocks(q).length) return { quota: q, hold: readHold(n), resumed: false };
  return { quota: laneQuota(n), hold: null, ...releaseLane(n, { by }) };
}

// ---- the live check ----

// Rough list prices (USD per million tokens) for the turn still in progress; usage.jsonl gets the real
// figure when the turn ends.
const PRICE = [[/opus/, 5, 25], [/sonnet/, 3, 15], [/haiku/, 1, 5]];
export function estimateUsd(model, u) {
  const p = PRICE.find(([re]) => re.test(String(model)));
  if (!p) return 0;
  const [, i, o] = p;
  return (u.in * i + u.out * o + u.cacheRead * i * 0.1 + u.cacheWrite * i * 1.25) / 1e6;
}

/** Check lane n now; hold it over an admin's limit, warn once per limit. turn: the session's usage so far. */
export function checkLane(n, { turn } = {}) {
  const ctx = deps.context(n) || {};
  const model = mainModel(n);
  const name = usageModelName(model);
  const extra = turn && (turn.in || turn.out || turn.cacheRead || turn.cacheWrite)
    ? [{ at: deps.now().toISOString(), lane: n, step: 'main', stage: ctx.stage || '', phase: phaseOf('main', ctx.stage), model: name,
      runId: ctx.runId || '', projectId: ctx.projectId || '', ...turn, usd: estimateUsd(name, turn) }]
    : [];
  const q = laneQuota(n, { model, extra });
  const b = adminBlocks(q);
  if (b.length) { holdLane(n, b); return q; }
  const month = deps.now().toISOString().slice(0, 7);
  const fresh = newWarnings(n, q, month);
  if (fresh.length) {
    deps.sessions?.notify?.(n, { kind: 'quota', level: 'warn', checks: fresh,
      text: `Sắp chạm hạn mức (≥ ${q.warnPct}%): ${fresh.map(describeCheck).join('; ')}. Lane vẫn làm tiếp; tới 100% sẽ dừng chờ quản trị viên.` });
  }
  return q;
}

/** Every lane with a session or a step in progress. */
export function tickQuotas(lanes) {
  for (const n of holdFiles()) { try { postHold(n); } catch { /* next pass */ } }
  for (const l of lanes) {
    if (readHold(l.lane)) continue;
    const busy = deps.sessions?.isRunning?.(l.lane) || l.status === 'running';
    if (!busy) continue;
    try { checkLane(l.lane); } catch { /* next pass */ }
  }
}

/** The holds a headless step (bin/quota-check) left: their cards are posted by the dashboard. */
export function holdFiles() {
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(root(), 'run')); } catch { return []; }
  return dirs.map(d => Number(/^lane(\d+)$/.exec(d)?.[1])).filter(n => n && readHold(n));
}
