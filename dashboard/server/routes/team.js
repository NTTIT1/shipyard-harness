import { Router } from 'express';
import { AUTH_ENABLED, AT_COOKIE, PLATFORM_URL, parseCookies } from '../services/auth.js';
import { createTeamHub } from '../services/scaffold/teamhub.js';
import { createProviderStore } from '../services/scaffold/remotes.js';
import { defaultSetupRunner } from '../services/scaffold/setup.js';

/** Roles that may change a project's AI-team rules (reviewers still approve every change). */
export const TEAM_MANAGERS = ['OWNER', 'MAINTAINER', 'TECH_LEAD'];

/** The project as the calling user sees it on the platform (404/403 when they are not a member). */
export function platformProjectLookup(gatewayUrl = PLATFORM_URL, fetchImpl = fetch) {
  return async (id, token) => {
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/projects/${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw Object.assign(new Error('Không kết nối được Shipyard Platform'), { status: 502 });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw Object.assign(new Error(j.message || 'Không tìm thấy dự án'), { status: r.status === 401 ? 401 : r.status === 403 ? 403 : 404 });
    return j.data;
  };
}

// "Đội AI" tab of a project (spec 2026-10-19 §5, P5).
export function teamRouter({ authEnabled = AUTH_ENABLED, providers = createProviderStore(), setup = defaultSetupRunner({ providers }),
  hub = createTeamHub({ setup, providers }), lookup = platformProjectLookup() } = {}) {
  const router = Router();
  const fail = (res, e) => res.status(e.status || 500).json({ ok: false, error: e.message });

  const member = async (req, res, next) => {
    try {
      if (authEnabled === false && !req.user) req.user = { id: 'local', email: 'local@shipyard.local', role: 'SYS_ADMIN' };
      const p = await lookup(req.params.pid, parseCookies(req.headers.cookie)[AT_COOKIE]);
      const roles = p.currentUserRoles || (p.currentUserRole ? [p.currentUserRole] : []);
      req.project = p;
      req.canManage = req.user.role === 'SYS_ADMIN' || roles.some(r => TEAM_MANAGERS.includes(r));
      next();
    } catch (e) { fail(res, e); }
  };
  const manager = (req, res, next) => (req.canManage ? next()
    : res.status(403).json({ ok: false, error: 'Chỉ Owner, Maintainer hoặc Tech Lead của dự án được thay đổi đội AI' }));

  router.get('/api/team/:pid', member, async (req, res) => {
    try { res.json({ ...(await hub.state(req.project, { force: req.query.refresh === '1' })), canManage: req.canManage }); } catch (e) { fail(res, e); }
  });
  router.post('/api/team/:pid/adopt', member, manager, async (req, res) => {
    try { res.status(202).json(await hub.adopt(req.project, req.user, req.body || {})); } catch (e) { fail(res, e); }
  });
  router.post('/api/team/:pid/propose', member, manager, async (req, res) => {
    try { res.status(202).json(await hub.propose(req.project, req.user, req.body || {})); } catch (e) { fail(res, e); }
  });
  router.post('/api/team/:pid/redraft', member, manager, async (req, res) => {
    try { res.status(202).json(await hub.redraft(req.project, req.user, req.body || {})); } catch (e) { fail(res, e); }
  });
  router.post('/api/team/:pid/retry', member, manager, (req, res) => {
    try { res.status(202).json(hub.retry(req.project)); } catch (e) { fail(res, e); }
  });
  router.get('/api/team/:pid/human/:name', member, async (req, res) => {
    try {
      const p = await hub.readHuman(req.project, req.params.name);
      res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.set('X-Content-Type-Options', 'nosniff');
      // Material is shown as text (or the image/PDF it is), never rendered as a page.
      if (/\.(html|xml|svg)$/i.test(p)) res.type('text/plain; charset=utf-8');
      res.sendFile(p);
    } catch (e) { fail(res, e); }
  });
  router.put('/api/team/:pid/human/:name', member, manager, async (req, res) => {
    try { res.json(await hub.putHuman(req.project, req.params.name, req.body?.content)); } catch (e) { fail(res, e); }
  });
  router.delete('/api/team/:pid/human/:name', member, manager, async (req, res) => {
    try { res.json(await hub.deleteHuman(req.project, req.params.name)); } catch (e) { fail(res, e); }
  });
  return router;
}
