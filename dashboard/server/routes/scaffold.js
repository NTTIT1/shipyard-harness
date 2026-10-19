import { Router } from 'express';
import { AUTH_ENABLED, AT_COOKIE, PLATFORM_URL, parseCookies } from '../services/auth.js';
import { publicCatalog, validateRequest } from '../services/scaffold/catalog.js';
import { createJobRunner, STAGES } from '../services/scaffold/jobs.js';
import { probeTools } from '../services/scaffold/util.js';

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

/** Toolchain probing spawns a few processes; remember the answer for a minute. */
export function cachedProbe(probe = probeTools, ttlMs = 60_000, now = Date.now) {
  let at = 0, value = null;
  return () => {
    if (!value || now() - at > ttlMs) { value = probe(); at = now(); }
    return value;
  };
}

// Project wizard (spec 2026-10-19 §3–4). It runs toolchains on this host, so P1 limits it to SYS_ADMIN.
export function scaffoldRouter({ authEnabled = AUTH_ENABLED, runner, tools = cachedProbe() } = {}) {
  const router = Router();
  const jobs = runner || createJobRunner({ registerProject: platformRegistrar(), tools });
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
    try { res.json({ ...publicCatalog(tools()), stages: STAGES, root: jobs.root }); } catch (e) { fail(res, e); }
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
  router.post('/api/scaffold/jobs/:id/register', admin, mine, async (req, res) => {
    try { res.json(await jobs.retryRegister(req.params.id, token(req))); } catch (e) { fail(res, e); }
  });
  router.delete('/api/scaffold/jobs/:id', admin, mine, (req, res) => {
    try { res.json(jobs.discard(req.params.id)); } catch (e) { fail(res, e); }
  });
  return router;
}
