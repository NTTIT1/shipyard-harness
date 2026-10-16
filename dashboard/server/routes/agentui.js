import { Router } from 'express';
import { spawnSync } from 'child_process';
import path from 'path';
import { BIN } from '../services/config.js';
import { lanesPayload } from '../services/state.js';
import { runAction } from '../services/actions.js';
import { listSpecs } from '../services/spec.js';
import * as P from '../services/providers.js';
import { gatewayStatus, ensureGateway, restartGateway, restartGatewayInBackground } from '../services/gateway.js';
import * as S from '../services/sessions.js';
import { assignLane } from '../services/assign.js';

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
  providers: P.publicProviders(), defaults: P.readModelDefaults(),
  gateway: { running: await gatewayStatus() },
})));
router.put('/api/providers', wrap(async req => {
  P.writeProviders(req.body.providers || {});
  if (await gatewayStatus()) restartGatewayInBackground();
  return { providers: P.publicProviders() };
}));
router.post('/api/providers/:id/test', wrap(async req => {
  const models = await P.listModels(req.params.id);
  P.setProviderModels(req.params.id, models);
  if (await gatewayStatus()) restartGatewayInBackground();
  return { models };
}));
router.put('/api/models', wrap(async req => { P.writeModelDefaults(req.body.defaults || {}); return { defaults: P.readModelDefaults() }; }));
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
// Change the in-flight feature's step models (e.g. after a step failed on a provider).
router.put(`${lanePath}/models`, wrap(async req => {
  const n = num(req);
  const models = (req.body || {}).models || {};
  const errs = P.validateModels(models);
  if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 400 });
  if (P.usesGateway(models)) {
    const gw = await ensureGateway();
    if (!gw.ok) throw Object.assign(new Error(`không bật được gateway: ${gw.output}`), { status: 503 });
  }
  stateSh(n, ['set-json', 'models', JSON.stringify(models)]);
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
  S.startSession(n, { model: info.model, prompt: 'continue', resume: info.session_id });
}));

export default router;
