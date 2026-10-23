import { Router } from 'express';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { BIN, HARNESS_ROOT } from '../services/config.js';
import { normalizePipeline } from '../../src/lib/pipeline.js';
import { lanesPayload } from '../services/state.js';
import { runAction } from '../services/actions.js';
import { listSpecs } from '../services/spec.js';
import * as P from '../services/providers.js';
import { gatewayStatus, ensureGateway, restartGateway, restartGatewayInBackground } from '../services/gateway.js';
import * as S from '../services/sessions.js';
import { assignLane } from '../services/assign.js';
import { normalizeEfforts, aggregate, readAllUsage, readSettings, writeSettings, readPlan } from '../services/usage.js';

const router = Router();
const lanePath = '/api/lane/:n(\\d)';

function wrap(fn) {
  return async (req, res) => {
    try { res.json({ ok: true, ...(await fn(req, res)) }); }
    catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }); }
  };
}
function stateSh(n, args) {
  const r = spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), ...args], { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) throw new Error(`state.sh ${args[0]}: ${(r.stderr || '').trim()}`);
}
const num = req => parseInt(req.params.n, 10);

router.get('/api/providers', wrap(async () => ({
  catalog: P.CATALOG, claude_models: P.CLAUDE_MODELS, steps: P.STEPS,
  claude_auth: P.claudeAuthStatus(),
  studio_roles: P.STUDIO_ROLES, studio_models: P.readStudioModels(),
  providers: P.publicProviders(), defaults: P.readModelDefaults(),
  lane_defaults: P.readAllLaneDefaults(),
  feature_models: P.readFeatureModels(),
  gateway: { running: await gatewayStatus() },
})));
router.put('/api/providers', wrap(async req => {
  P.writeProviders(req.body.providers || {});
  if (await gatewayStatus()) restartGatewayInBackground();
  return { providers: P.publicProviders() };
}));
router.put('/api/studio-models', wrap(async req => {
  const m = P.writeStudioModels(req.body?.models || {});
  // A non-Claude model talks through the gateway: bring it up now rather than on the first chat turn.
  if (Object.values(m).some(v => !v.startsWith('claude:'))) {
    const gw = await ensureGateway();
    if (!gw.ok) throw Object.assign(new Error(`không bật được cổng LiteLLM: ${gw.output}`), { status: 503 });
  }
  return { studio_models: m };
}));
router.put('/api/providers/claude-auth', wrap(async req => ({ claude_auth: P.setClaudeAuth(String(req.body?.mode || '')) })));
router.post('/api/providers/:id/test', wrap(async req => {
  const models = await P.listModels(req.params.id);
  P.setProviderModels(req.params.id, models);
  if (await gatewayStatus()) restartGatewayInBackground();
  return { models };
}));
router.put('/api/models', wrap(async req => {
  P.writeModelDefaults(req.body.defaults || {});
  return { defaults: P.readModelDefaults(), lane_defaults: P.readAllLaneDefaults() };
}));
router.put(`${lanePath}/model-defaults`, wrap(async req => {
  const n = num(req);
  const d = P.writeLaneModelDefaults(n, req.body?.defaults || null);
  const stepMap = Object.fromEntries(P.STEPS.map(s => [s.id, d[s.id]]));
  if (P.usesGateway(stepMap)) {
    const gw = await ensureGateway();
    if (!gw.ok) throw Object.assign(new Error(`không bật được gateway: ${gw.output}`), { status: 503 });
  }
  return { defaults: d, lane_defaults: P.readAllLaneDefaults() };
}));
// The lane's pipeline after the code: what it will run (profile < project default < this lane), and
// this lane's own override (config/lanes/lane<N>.pipeline.json; DELETE = follow the project again).
const pipelineFile = n => path.join(HARNESS_ROOT, 'config', 'lanes', `lane${n}.pipeline.json`);
const effectivePipeline = n => {
  const r = spawnSync('bash', [path.join(BIN, 'lane-pipeline.sh'), String(n)], { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) throw new Error(`lane-pipeline.sh: ${(r.stderr || '').trim()}`);
  return JSON.parse(r.stdout);
};
const readOverride = n => { try { return JSON.parse(fs.readFileSync(pipelineFile(n), 'utf8')); } catch { return null; } };
router.get(`${lanePath}/pipeline`, wrap(async req => ({ effective: effectivePipeline(num(req)), override: readOverride(num(req)) })));
router.put(`${lanePath}/pipeline`, wrap(async req => {
  const n = num(req);
  const cfg = normalizePipeline(req.body?.pipeline || {});
  fs.mkdirSync(path.dirname(pipelineFile(n)), { recursive: true });
  fs.writeFileSync(pipelineFile(n), `${JSON.stringify(cfg, null, 2)}\n`);
  return { effective: effectivePipeline(n), override: cfg };
}));
router.delete(`${lanePath}/pipeline`, wrap(async req => {
  fs.rmSync(pipelineFile(num(req)), { force: true });
  return { effective: effectivePipeline(num(req)), override: null };
}));
router.put('/api/features/models', wrap(async req => {
  const { key, models, effort, impl_agents, reset, lane } = req.body || {};
  const cfg = reset ? { reset: true } : { ...(models || {}), effort, impl_agents };
  const saved = P.writeFeatureModels(key, cfg);
  if (saved) {
    const stepMap = Object.fromEntries(P.STEPS.map(s => [s.id, saved[s.id]]));
    if (P.usesGateway(stepMap)) {
      const gw = await ensureGateway();
      if (!gw.ok) throw Object.assign(new Error(`không bật được gateway: ${gw.output}`), { status: 503 });
    }
  }
  if (lane && Number.isInteger(Number(lane)) && !reset && models) {
    try {
      stateSh(Number(lane), ['set-json', 'models', JSON.stringify(models)]);
      if (effort) stateSh(Number(lane), ['set-json', 'effort', JSON.stringify(normalizeEfforts(effort, P.STEPS.map(s => s.id)))]);
      if (impl_agents) stateSh(Number(lane), ['set', `impl_agents=${parseInt(impl_agents, 10) || 1}`]);
    } catch { /* lane state optional */ }
  }
  return { feature_models: P.readFeatureModels(), saved };
}));
router.post('/api/gateway/restart', wrap(async () => restartGateway()));

router.post(`${lanePath}/assign`, wrap(async req => {
  const n = num(req);
  return assignLane(n, req.body || {}, {
    assignedBy: req.user?.id,
    lane: async x => (await lanesPayload()).lanes.find(l => l.lane === x),
    isRunning: S.isRunning,
    ensureGateway,
    state: args => stateSh(n, args),
    laneUp: x => runAction(x, 'up', {}),
    startSession: S.startSession,
  });
}));
router.get(`${lanePath}/specs`, wrap(async req => ({ specs: listSpecs(num(req)) })));
// Change the in-flight feature's step models (e.g. after a step failed on a provider, or from Lane/Feature config).
router.put(`${lanePath}/models`, wrap(async req => {
  const n = num(req);
  const models = (req.body || {}).models || {};
  const errs = P.validateModels(models);
  if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 400 });
  const effort = req.body?.effort === undefined ? null : normalizeEfforts(req.body.effort, P.STEPS.map(s => s.id));
  const impl = parseInt(req.body?.impl_agents, 10);
  if (P.usesGateway(models)) {
    const gw = await ensureGateway();
    if (!gw.ok) throw Object.assign(new Error(`không bật được gateway: ${gw.output}`), { status: 503 });
  }
  stateSh(n, ['set-json', 'models', JSON.stringify(models)]);
  if (effort) stateSh(n, ['set-json', 'effort', JSON.stringify(effort)]);
  if (impl > 0 && impl <= 9) stateSh(n, ['set', `impl_agents=${impl}`]);
  if (req.body?.featureKey) {
    P.writeFeatureModels(req.body.featureKey, { ...models, effort: effort || {}, impl_agents: impl > 0 ? impl : 1 });
  }
}));

router.get(`${lanePath}/usage`, wrap(async req => {
  const n = num(req);
  const settings = readSettings();
  const records = readAllUsage();
  const all = aggregate(records, settings, { month: req.query.month ? String(req.query.month) : undefined });
  const lim = (settings.laneLimits || {})[String(n)] || {};
  const laneUsage = all.byLane.find(l => l.lane === n) || {
    lane: n, usd: 0, vnd: 0, tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    sharePct: 0, quotaPct: 0, usdPct: 0, tokenPct: 0,
    limitUsd: lim.usd !== undefined ? lim.usd : settings.monthlyBudgetUsd,
    limitTokens: lim.tokens !== undefined ? lim.tokens : settings.monthlyTokenLimit,
  };
  const laneRecords = records.filter(r => Number(r.lane) === n);
  const laneAgg = aggregate(laneRecords, settings, { month: all.month });
  return {
    month: all.month,
    months: all.months,
    lane: laneUsage,
    features: all.features.filter(f => f.lane === n),
    byModel: laneAgg.byModel,
    quotas: all.quotas,
    plan: readPlan(),
    lane_defaults: P.readAllLaneDefaults()[String(n)] || null,
    global_defaults: P.readModelDefaults(),
  };
}));

router.put(`${lanePath}/limit`, wrap(async req => {
  const n = num(req);
  const cur = readSettings();
  const next = writeSettings({
    laneLimits: { ...(cur.laneLimits || {}), [String(n)]: req.body || {} },
  });
  return { laneLimit: next.laneLimits[String(n)] || null };
}));

router.get(`${lanePath}/chat/stream`, (req, res) => {
  const n = num(req);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  send({ kind: 'hello' });
  for (const ev of S.history(n)) send(ev);
  send({ kind: 'status', ...S.brief(n) });
  const off = S.subscribe(n, ev => { send(ev); send({ kind: 'status', ...S.brief(n) }); });
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { off(); clearInterval(ping); });
});
router.post(`${lanePath}/chat/message`, wrap(async req => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) throw Object.assign(new Error('tin nhắn rỗng'), { status: 400 });
  try { S.sendMessage(num(req), text); } catch (e) { throw Object.assign(e, { status: 409 }); }
}));
router.post(`${lanePath}/chat/answer`, wrap(async req => {
  const { id, answers, allow } = req.body || {};
  try { S.answer(num(req), id, { answers, allow }); } catch (e) { throw Object.assign(e, { status: 409 }); }
}));
router.post(`${lanePath}/session/stop`, wrap(async req => {
  const n = num(req);
  S.stopSession(n);
  stateSh(n, ['set', 'notes=dừng từ dashboard']);
}));
router.post(`${lanePath}/session/resume`, wrap(async req => {
  const n = num(req);
  const info = S.sessionInfo(n);
  if (!info) throw Object.assign(new Error('không có phiên để tiếp tục'), { status: 404 });
  S.startSession(n, { model: info.model, effort: info.effort || undefined, prompt: 'continue', resume: info.session_id });
}));

export default router;
