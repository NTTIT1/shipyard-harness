import { Router } from 'express';
import { AUTH_ENABLED, AT_COOKIE, PLATFORM_URL, parseCookies } from '../services/auth.js';
import { createReleaseManager, isProd } from '../services/releases.js';
import { createProviderStore } from '../services/scaffold/remotes.js';
import { platformProjectLookup } from './team.js';
import { allowed } from '../../src/lib/permissions.js';

/** The project's finished features (FEATURE runs that are DONE), as the caller may see them. */
export function platformDoneRuns(gatewayUrl = PLATFORM_URL, fetchImpl = fetch) {
  return async (pid, token) => {
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/projects/${encodeURIComponent(pid)}/runs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw Object.assign(new Error('Không kết nối được Shipyard Platform'), { status: 502 });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw Object.assign(new Error(j.message || 'Không tải được tính năng của dự án'), { status: r.status === 403 ? 403 : 502 });
    return (j.data || []).filter(x => x.status === 'DONE' && (!x.kind || x.kind === 'FEATURE'));
  };
}

const DENY = {
  release: 'Chỉ Owner, Maintainer hoặc Tech Lead của dự án được tạo bản phát hành và đưa lên UAT',
  'release-verify': 'Chỉ Owner, Maintainer, PM hoặc Tester của dự án được xác nhận bản phát hành',
  'release-prod': 'Chỉ Owner hoặc Maintainer của dự án được phát hành lên Production',
};

// "Phát hành" of a project: releases promoted UAT → Production (services/releases.js).
export function releasesRouter({ authEnabled = AUTH_ENABLED, providers = createProviderStore(),
  manager = createReleaseManager({ providers }), lookup = platformProjectLookup(), doneRuns = platformDoneRuns() } = {}) {
  const router = Router();
  const fail = (res, e) => res.status(e.status || 500).json({ ok: false, error: e.message });
  const token = req => parseCookies(req.headers.cookie)[AT_COOKIE];

  const member = async (req, res, next) => {
    try {
      if (authEnabled === false && !req.user) req.user = { id: 'local', email: 'local@shipyard.local', role: 'SYS_ADMIN' };
      const p = await lookup(req.params.pid, token(req));
      req.project = p;
      const roles = p.currentUserRoles || (p.currentUserRole ? [p.currentUserRole] : []);
      req.can = a => allowed(req.user, roles, a);
      next();
    } catch (e) { fail(res, e); }
  };
  const need = action => (req, res, next) => (req.can(action) ? next() : res.status(403).json({ ok: false, error: DENY[action], need: action }));

  router.get('/api/releases/:pid', member, async (req, res) => {
    try {
      const runs = await doneRuns(req.params.pid, token(req)).catch(() => []);
      res.json({ ...(await manager.state(req.project, runs)),
        can: { release: req.can('release'), verify: req.can('release-verify'), prod: req.can('release-prod') } });
    } catch (e) { fail(res, e); }
  });
  router.put('/api/releases/:pid/settings', member, need('release-prod'), (req, res) => {
    try { res.json(manager.saveSettings(req.project, req.body || {})); } catch (e) { fail(res, e); }
  });
  router.post('/api/releases/:pid', member, need('release'), async (req, res) => {
    try {
      const runs = await doneRuns(req.params.pid, token(req));
      res.status(201).json(await manager.create(req.project, req.user, req.body || {}, runs));
    } catch (e) { fail(res, e); }
  });
  router.post('/api/releases/:pid/:rid/deploy', member, need('release'), async (req, res) => {
    try {
      const env = String(req.body?.env || '');
      const st = await manager.state(req.project);
      if (isProd(st.settings, env) && !req.can('release-prod')) {
        return res.status(403).json({ ok: false, error: DENY['release-prod'], need: 'release-prod' });
      }
      res.json(await manager.deploy(req.project, req.user, req.params.rid, env));
    } catch (e) { fail(res, e); }
  });
  router.post('/api/releases/:pid/:rid/verify', member, need('release-verify'), (req, res) => {
    try { res.json(manager.verify(req.project, req.user, req.params.rid, String(req.body?.env || ''), req.body || {})); } catch (e) { fail(res, e); }
  });
  router.post('/api/releases/:pid/:rid/cancel', member, need('release'), (req, res) => {
    try { res.json(manager.cancel(req.project, req.user, req.params.rid)); } catch (e) { fail(res, e); }
  });
  router.get('/api/releases/:pid/:rid/deploy-status', member, async (req, res) => {
    try { res.json(await manager.deployStatus(req.project, req.params.rid)); } catch (e) { fail(res, e); }
  });
  return router;
}
