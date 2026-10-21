import { Router } from 'express';
import { AUTH_ENABLED, AT_COOKIE, PLATFORM_URL, parseCookies } from '../services/auth.js';
import { publicCatalog, validateRequest } from '../services/scaffold/catalog.js';
import { createJobRunner, STAGES } from '../services/scaffold/jobs.js';
import { probeTools } from '../services/scaffold/util.js';
import { createProviderStore } from '../services/scaffold/remotes.js';
import { defaultSetupRunner } from '../services/scaffold/setup.js';
import { defaultBlueprintRunner } from '../services/scaffold/blueprint.js';
import { createAdvisor } from '../services/scaffold/advise.js';
import { createStudio } from '../services/scaffold/studio.js';

/** Creates the project on the platform as the calling user (who becomes OWNER). */
export function platformRegistrar(gatewayUrl = PLATFORM_URL, fetchImpl = fetch) {
  return async (body, token) => {
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Không kết nối được Shipyard Platform');
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Phiên đăng nhập đã hết hạn — đăng nhập lại rồi bấm "Thử lại đăng ký"');
    if (!r.ok || j.success === false) throw new Error(j.message || `Platform trả về HTTP ${r.status}`);
    return j.data;
  };
}

/** Sets the new project's feature workflow as the calling user (the OWNER). */
export function platformWorkflowSetter(gatewayUrl = PLATFORM_URL, fetchImpl = fetch) {
  return async (projectId, workflow, token) => {
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/projects/${encodeURIComponent(projectId)}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(workflow),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Không kết nối được Shipyard Platform');
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Phiên đăng nhập đã hết hạn — đăng nhập lại rồi bấm "Thử lại"');
    if (!r.ok || j.success === false) throw new Error(`Không lưu được quy trình: ${j.message || `HTTP ${r.status}`}`);
    return j.data;
  };
}

/** Toolchain probing spawns a few processes; remember the answer for a minute. */
export function cachedProbe(probe = probeTools, ttlMs = 60_000, now = Date.now) {
  let at = 0, value = null;
  return () => {
    if (!value || now() - at > ttlMs) { value = probe(); at = now(); }
    return value;
  };
}

// Project wizard (spec 2026-10-19 §3–4). It runs toolchains on this host, so P1 limits it to SYS_ADMIN.
export function scaffoldRouter({ authEnabled = AUTH_ENABLED, runner, tools = cachedProbe(), providers = createProviderStore(),
  setup = defaultSetupRunner({ providers }), blueprint = defaultBlueprintRunner(), advise = createAdvisor({ tools }), studio = null } = {}) {
  const router = Router();
  const jobs = runner || createJobRunner({ registerProject: platformRegistrar(), setWorkflow: platformWorkflowSetter(), tools,
    remotes: providers, setup, blueprint });
  const chat = studio || createStudio({ tools, jobs });
  // An approved architecture scaffolds the project through the job runner (same job, or rebuilt).
  blueprint.setBuilder?.((entry, architecture) => jobs.build(entry.snapshot, architecture));
  const admin = (req, res, next) => {
    if (authEnabled === false && !req.user) { req.user = { id: 'local', email: 'local@shipyard.local', role: 'SYS_ADMIN' }; return next(); }
    if (req.user?.role !== 'SYS_ADMIN') return res.status(403).json({ ok: false, error: 'Chỉ quản trị viên được tạo dự án mới từ khung' });
    next();
  };
  const token = req => parseCookies(req.headers.cookie)[AT_COOKIE];
  const fail = (res, e) => res.status(e.status || 500).json({ ok: false, error: e.message });
  const mine = (req, res, next) => {
    const owner = jobs.owner(req.params.id);
    if (!owner) return res.status(404).json({ ok: false, error: 'Không tìm thấy job' });
    if (owner !== req.user.id) return res.status(403).json({ ok: false, error: 'Job của người khác' });
    next();
  };

  router.get('/api/scaffold/catalog', admin, (_req, res) => {
    try { res.json({ ...publicCatalog(tools()), stages: STAGES.filter(s => s.id !== 'reserve' && s.id !== 'blueprint'), root: jobs.root, providers: providers.list() }); } catch (e) { fail(res, e); }
  });
  // Product studio: idea → AI PM → AI architect → AI designer → project, approved in the chat.
  const wrapS = fn => (req, res) => { try { res.json(fn(req)); } catch (e) { fail(res, e); } };
  router.get('/api/studio', admin, wrapS(req => chat.list(req.user)));
  router.post('/api/studio', admin, wrapS(req => chat.start(req.user, req.body?.text)));
  router.get('/api/studio/:id', admin, wrapS(req => chat.get(req.params.id, req.user)));
  router.post('/api/studio/:id/messages', admin, wrapS(req => chat.send(req.params.id, req.user, req.body?.text)));
  router.post('/api/studio/:id/approve', admin, wrapS(req => chat.approve(req.params.id, req.user, String(req.body?.stage || ''))));
  router.post('/api/studio/:id/skip-ui', admin, wrapS(req => chat.skipUi(req.params.id, req.user)));
  router.post('/api/studio/:id/reopen', admin, wrapS(req => chat.reopen(req.params.id, req.user, String(req.body?.stage || ''))));
  router.post('/api/studio/:id/create', admin, wrapS(req => chat.create(req.params.id, req.user, token(req), req.body || {})));
  router.delete('/api/studio/:id', admin, wrapS(req => chat.remove(req.params.id, req.user)));

  // AI advisor: requirements → a recommended stack / workflow the wizard pre-fills (takes ~1 min).
  router.post('/api/scaffold/advise', admin, async (req, res) => {
    try { res.json(await advise(req.body?.requirements)); } catch (e) { fail(res, e); }
  });
  router.post('/api/scaffold/jobs', admin, (req, res) => {
    try {
      const spec = validateRequest(req.body, tools());
      res.status(202).json(jobs.start(spec, req.user, token(req)));
    } catch (e) { fail(res, e); }
  });
  router.get('/api/scaffold/jobs/:id', admin, mine, (req, res) => {
    jobs.touch(req.params.id, token(req));
    res.json(jobs.get(req.params.id));
  });
  router.post('/api/scaffold/jobs/:id/cancel', admin, mine, (req, res) => res.json(jobs.cancel(req.params.id)));
  router.post('/api/scaffold/jobs/:id/retry', admin, mine, async (req, res) => {
    try { res.json(await jobs.retry(req.params.id, token(req))); } catch (e) { fail(res, e); }
  });

  // AI Manager progress for a project's SETUP run, and a manual retry after an error.
  router.get('/api/scaffold/setup/:runId', admin, (req, res) => {
    const s = setup.get(req.params.runId);
    if (!s) return res.status(404).json({ ok: false, error: 'Không tìm thấy' });
    res.json({ status: s.status, error: s.error || null, busy: setup.isBusy(req.params.runId), updatedAt: s.updatedAt });
  });
  router.post('/api/scaffold/setup/:runId/retry', admin, (req, res) => {
    if (!setup.get(req.params.runId)) return res.status(404).json({ ok: false, error: 'Không tìm thấy' });
    setup.work(req.params.runId);
    res.status(202).json({ ok: true });
  });

  // Architecture-first projects: BLUEPRINT run progress, retry, and the runs of one project.
  const bpView = (runId, e) => ({ runId, status: e.status, error: e.error || null, busy: blueprint.isBusy(runId),
    jobId: e.jobId || e.snapshot?.jobId || null, updatedAt: e.updatedAt });
  router.get('/api/scaffold/blueprint/:runId', admin, (req, res) => {
    const e = blueprint.get(req.params.runId);
    if (!e) return res.status(404).json({ ok: false, error: 'Không tìm thấy' });
    res.json(bpView(req.params.runId, e));
  });
  router.post('/api/scaffold/blueprint/:runId/retry', admin, (req, res) => {
    if (!blueprint.get(req.params.runId)) return res.status(404).json({ ok: false, error: 'Không tìm thấy' });
    blueprint.work(req.params.runId);
    res.status(202).json({ ok: true });
  });
  router.get('/api/scaffold/blueprints', admin, (req, res) => {
    res.json(blueprint.forProject(String(req.query.projectId || '')).map(e => bpView(e.runId, blueprint.get(e.runId))));
  });

  // Shared GitHub / GitLab connections (token never leaves the server).
  router.get('/api/scaffold/git-providers', admin, (_req, res) => res.json(providers.list()));
  router.put('/api/scaffold/git-providers/:id', admin, async (req, res) => {
    try { res.json(await providers.save(req.params.id, req.body || {})); } catch (e) { fail(res, e); }
  });
  router.delete('/api/scaffold/git-providers/:id', admin, (req, res) => {
    try { res.json(providers.remove(req.params.id)); } catch (e) { fail(res, e); }
  });
  router.get('/api/scaffold/git-providers/:id/owners', admin, async (req, res) => {
    try { res.json(await providers.owners(req.params.id)); } catch (e) { fail(res, e); }
  });
  router.delete('/api/scaffold/jobs/:id', admin, mine, (req, res) => {
    try { res.json(jobs.discard(req.params.id)); } catch (e) { fail(res, e); }
  });


  return router;
}

