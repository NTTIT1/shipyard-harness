// Who may do what: the shared permission table, the server's route guard and the /api/lanes scoping.
import { describe, it, expect } from 'vitest';
import express from 'express';
import { allowed, capabilities, canLane, PROJECT_ACTIONS } from '../src/lib/permissions.js';
import { accessGuard, matchRule, routePath, scopeLanes } from '../server/services/access.js';

const ROLES = ['OWNER', 'MAINTAINER', 'PM', 'BA', 'TECH_LEAD', 'DESIGNER', 'DEVELOPER', 'TESTER', 'VIEWER'];
const user = { id: 'u1', role: 'USER' };
const admin = { id: 'a1', role: 'SYS_ADMIN' };

describe('permission table', () => {
  it('matches the approved matrix for every project role', () => {
    const expected = {
      view: ROLES,
      work: ['OWNER', 'MAINTAINER', 'PM', 'TECH_LEAD'],
      manage: ['OWNER', 'MAINTAINER', 'TECH_LEAD'],
      costs: ['OWNER'],
    };
    for (const [action, who] of Object.entries(expected)) {
      for (const r of ROLES) expect(allowed(user, [r], action), `${r} ${action}`).toBe(who.includes(r));
    }
    expect(Object.keys(PROJECT_ACTIONS).sort()).toEqual(Object.keys(expected).sort());
  });
  it('a non-member may do nothing; a SYS_ADMIN everything', () => {
    for (const a of [...Object.keys(PROJECT_ACTIONS), 'providers', 'gateway', 'credentials', 'quota']) {
      expect(allowed(user, null, a)).toBe(false);
      expect(allowed(user, [], a)).toBe(false);
      expect(allowed(admin, null, a)).toBe(true);
    }
  });
  it('install-wide actions stay admin-only even for an OWNER; unknown actions are refused', () => {
    for (const a of ['providers', 'models', 'gateway', 'quota', 'lane-add', 'credentials', 'nope']) {
      expect(allowed(user, ['OWNER'], a), a).toBe(false);
    }
  });
  it('a lane carries its capabilities; the UI reads them, an older payload falls back to allowed', () => {
    expect(capabilities(user, ['PM'])).toEqual({ view: true, work: true, manage: false, costs: false });
    expect(canLane({ can: { manage: false } }, 'manage')).toBe(false);
    expect(canLane({}, 'manage')).toBe(true);
  });
});

describe('route rules', () => {
  const need = (m, p) => matchRule(m, routePath(p))?.rule.need;
  it('maps each mutating lane route to the right action', () => {
    expect(need('POST', '/api/lane/1/assign')).toBe('work');
    expect(need('POST', '/api/lane/1/chat/message')).toBe('work');
    expect(need('PUT', '/api/lane/1/queue')).toBe('work');
    for (const a of ['up', 'down', 'clear', 'reset', 'remove', 'session/stop', 'session/resume', 'whatever']) {
      expect(need('POST', `/api/lane/1/${a}`), a).toBe('manage');
    }
    expect(need('PUT', '/api/lane/1/pipeline')).toBe('manage');
    expect(need('DELETE', '/api/proof/1')).toBe('manage');
    expect(need('GET', '/api/lane/1/creds-current')).toBe('credentials');
    expect(need('POST', '/api/lane/1/creds')).toBe('credentials');
    expect(need('GET', '/api/lane/1/usage')).toBe('costs');
    expect(need('GET', '/api/lane/1/chat/stream')).toBe('view');
    expect(need('GET', '/proof/1/x/a.png')).toBe('view');
    expect(need('POST', '/api/gateway/restart')).toBe('gateway');
    expect(need('PUT', '/api/providers')).toBe('providers');
    expect(need('POST', '/api/lanes/add')).toBe('lane-add');
  });
  it('cannot be dodged with casing, doubled or trailing slashes (Express would still route them)', () => {
    expect(need('POST', '/API/Lane/1/Remove')).toBe('manage');
    expect(need('POST', '//api//lane/1/remove/')).toBe('manage');
    expect(need('GET', '/API/lane/1/creds-current/')).toBe('credentials');
  });
  it('leaves read-only install info and self-guarded routers alone', () => {
    expect(matchRule('GET', '/api/providers')).toBeNull();
    expect(matchRule('GET', '/api/costs')).toBeNull();
    expect(matchRule('POST', '/api/platform/approvals/x/decision')).toBeNull();
  });
});

// Lane 1 → project P1, lane 2 → P2, lane 3 → no project.
const projectOf = n => ({ 1: 'P1', 2: 'P2' }[n] || '');
function app(who, memberships = { P1: ['PM'] }, { calls } = { calls: [] }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = who; next(); });
  a.use(accessGuard({ authEnabled: true, projectOf, memberships: async () => { calls.push(1); return new Map(Object.entries(memberships)); } }));
  a.all('*', (_req, res) => res.json({ ok: true, reached: true }));
  return a;
}
async function hit(a, method, p, body) {
  const srv = a.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${p}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  } finally { srv.close(); }
}

describe('accessGuard (HTTP)', () => {
  it('a PM of the lane\'s project may assign and chat, not stop the lane or read its costs', async () => {
    const a = app(user);
    expect((await hit(a, 'POST', '/api/lane/1/assign', {})).status).toBe(200);
    expect((await hit(a, 'POST', '/api/lane/1/chat/message', { text: 'x' })).status).toBe(200);
    const stop = await hit(a, 'POST', '/api/lane/1/session/stop');
    expect(stop.status).toBe(403);
    expect(stop.body.need).toBe('manage');
    expect((await hit(a, 'GET', '/api/lane/1/usage')).status).toBe(403);
  });
  it('a member of another project cannot touch or even read this lane', async () => {
    const a = app(user);
    for (const [m, p] of [['GET', '/api/lane/2/specs'], ['GET', '/api/proof/2'], ['GET', '/proof/2/a.png'], ['POST', '/api/lane/2/assign']]) {
      const r = await hit(a, m, p);
      expect(r.status, p).toBe(403);
      expect(r.body.error).toMatch(/thành viên/);
    }
  });
  it('a lane with no project, install settings and shared secrets are the administrator\'s', async () => {
    const a = app(user, { P1: ['OWNER'] });
    expect((await hit(a, 'GET', '/api/lane/3/specs')).status).toBe(403);
    expect((await hit(a, 'GET', '/api/lane/1/creds-current')).status).toBe(403);
    expect((await hit(a, 'PUT', '/api/providers', {})).status).toBe(403);
    expect((await hit(a, 'POST', '/api/gateway/restart')).status).toBe(403);
    const b = app(admin, {});
    expect((await hit(b, 'GET', '/api/lane/3/specs')).status).toBe(200);
    expect((await hit(b, 'GET', '/api/lane/1/creds-current')).status).toBe(200);
    expect((await hit(b, 'POST', '/api/gateway/restart')).status).toBe(200);
  });
  it('feature models: the lane given in the body decides, none → admin only', async () => {
    const a = app(user, { P1: ['TECH_LEAD'] });
    expect((await hit(a, 'PUT', '/api/features/models', { lane: 1 })).status).toBe(200);
    expect((await hit(a, 'PUT', '/api/features/models', { lane: 2 })).status).toBe(403);
    expect((await hit(a, 'PUT', '/api/features/models', {})).status).toBe(403);
    // a past feature of the lane (scope_lane) or one set up on the project before any lane runs it
    expect((await hit(a, 'PUT', '/api/features/models', { scope_lane: 1 })).status).toBe(200);
    expect((await hit(a, 'PUT', '/api/features/models', { scope_project: 'P1' })).status).toBe(200);
    const other = await hit(a, 'PUT', '/api/features/models', { scope_project: 'P2' });
    expect(other.status).toBe(403);
    expect(other.body.error).toMatch(/thành viên/);
  });
  it('fails closed when the platform cannot be asked', async () => {
    const a = express();
    a.use((req, _res, next) => { req.user = user; next(); });
    a.use(accessGuard({ authEnabled: true, projectOf, memberships: async () => { throw Object.assign(new Error('down'), { status: 503 }); } }));
    a.all('*', (_req, res) => res.json({ ok: true }));
    expect((await hit(a, 'POST', '/api/lane/1/assign')).status).toBe(503);
    expect((await hit(a, 'GET', '/api/providers')).status).toBe(200); // unguarded read
  });
  it('asks the platform once per session for a burst of requests', async () => {
    const calls = [];
    const a = app(user, { P1: ['OWNER'] }, { calls });
    for (let i = 0; i < 3; i++) await hit(a, 'GET', '/api/lane/1/specs');
    expect(calls.length).toBe(1);
  });
});

describe('scopeLanes', () => {
  const payload = () => ({
    lanes: [{ lane: 1, cost_usd: 1, cost_vnd: 25000 }, { lane: 2, cost_usd: 2, cost_vnd: 50000 }, { lane: 3 }],
    project_costs: { month: '2026-11', totals: { usd: 3, vnd: 75000 }, quotas: { month: {} },
      byLane: [{ lane: 1, usd: 1 }, { lane: 2, usd: 2 }], byProject: [{ projectId: 'P1', usd: 1, vnd: 25000 }, { projectId: 'P2', usd: 2, vnd: 50000 }] },
  });
  const reqFor = (who, roles) => {
    const req = {};
    req.access = async n => {
      const r = n == null ? null : (roles[projectOf(n)] || null);
      return { admin: who.role === 'SYS_ADMIN', roles: r, allowed: act => allowed(who, r, act) };
    };
    return req;
  };
  it('shows only the caller\'s projects, with capabilities; costs only where they own the project', async () => {
    const out = await scopeLanes(payload(), reqFor(user, { P1: ['OWNER'], P2: ['VIEWER'] }), projectOf);
    expect(out.lanes.map(l => l.lane)).toEqual([1, 2]);
    expect(out.lanes[0].can).toEqual({ view: true, work: true, manage: true, costs: true, admin: false });
    expect(out.lanes[1].can).toEqual({ view: true, work: false, manage: false, costs: false, admin: false });
    expect(out.lanes[0].cost_vnd).toBe(25000);
    expect(out.lanes[1].cost_vnd).toBeUndefined();
    expect(out.project_costs.byProject.map(p => p.projectId)).toEqual(['P1']);
    expect(out.project_costs.totals).toEqual({ usd: 1, vnd: 25000 });
    expect(out.project_costs.quotas).toBeUndefined();
    expect(out.is_admin).toBe(false);
  });
  it('an administrator sees every lane and every cost', async () => {
    const out = await scopeLanes(payload(), reqFor(admin, {}), projectOf);
    expect(out.lanes).toHaveLength(3);
    expect(out.project_costs.totals.usd).toBe(3);
    expect(out.is_admin).toBe(true);
  });
});
