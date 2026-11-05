import { AUTH_ENABLED, AT_COOKIE, PLATFORM_URL, parseCookies } from './auth.js';
import { harnessConfig, laneBinding } from './config.js';
import { allowed, isSysAdmin } from '../../src/lib/permissions.js';

/*
 * Server side of the permission table (src/lib/permissions.js): resolves the caller's project roles
 * from Shipyard Platform and checks every lane-scoped or install-wide route before it runs. Fails
 * closed: when the platform cannot be asked, guarded routes answer 503 rather than let anyone through.
 */

const LOCAL_ADMIN = { id: 'local', email: 'local@shipyard.local', role: 'SYS_ADMIN' };
const CACHE_MS = 15_000;

/** The caller's memberships: GET /api/v1/projects (only projects they belong to) → Map pid → roles. */
export function platformMemberships(gatewayUrl = PLATFORM_URL, fetchImpl = fetch) {
  return async token => {
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/projects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Object.assign(new Error('Không kết nối được Shipyard Platform để kiểm tra quyền'), { status: 503 });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      throw Object.assign(new Error(j.message || 'Không kiểm tra được quyền trên dự án'), { status: r.status === 401 ? 401 : 503 });
    }
    const out = new Map();
    for (const p of j.data || []) {
      const roles = p.currentUserRoles || (p.currentUserRole ? [p.currentUserRole] : []);
      if (p.id) out.set(p.id, roles);
    }
    return out;
  };
}

/** The platform project a lane works for: its binding, else the install's main project; '' = none. */
export function laneProject(n) {
  return laneBinding(n)?.projectId || harnessConfig().platform_project_id || '';
}

/**
 * Route → what it needs. First match wins; a route that matches nothing is not guarded here (it is
 * either public, read-only install info, or guards itself: costs, scaffold, team, platform proxy).
 * `need` is a permission action; `lane` says where the lane number is.
 */
export const RULES = [
  // Install-wide settings and infrastructure.
  { method: 'PUT', path: /^\/api\/providers$/, need: 'providers' },
  { method: 'PUT', path: /^\/api\/providers\/claude-auth$/, need: 'providers' },
  { method: 'POST', path: /^\/api\/providers\/[^/]+\/test$/, need: 'providers' },
  { method: 'PUT', path: /^\/api\/studio-models$/, need: 'models' },
  { method: 'PUT', path: /^\/api\/models$/, need: 'models' },
  { method: 'POST', path: /^\/api\/gateway\/restart$/, need: 'gateway' },
  { method: 'POST', path: /^\/api\/lanes\/add$/, need: 'lane-add' },
  // A feature's models: on its lane when one is given, otherwise install-wide.
  { method: 'PUT', path: /^\/api\/features\/models$/, need: 'manage', lane: 'body', orNeed: 'models' },
  // Lane-scoped. Secrets first: QA/tracker passwords are shared install secrets.
  { method: 'GET', path: /^\/api\/lane\/(\d)\/creds-current$/, need: 'credentials' },
  { method: 'POST', path: /^\/api\/lane\/(\d)\/(creds|repopulate)$/, need: 'credentials' },
  { method: 'PUT', path: /^\/api\/lane\/(\d)\/limit$/, need: 'quota' },
  { method: 'POST', path: /^\/api\/lane\/(\d)\/quota\/(grant|reset|continue)$/, need: 'quota' },
  { method: 'GET', path: /^\/api\/lane\/(\d)\/usage$/, need: 'costs' },
  { method: 'POST', path: /^\/api\/lane\/(\d)\/(assign|chat\/message|chat\/answer)$/, need: 'work' },
  { method: 'PUT', path: /^\/api\/lane\/(\d)\/queue$/, need: 'work' },
  { method: 'POST', path: /^\/api\/lane\/(\d)\/(up|down|clear|reset|remove|session\/stop|session\/resume)$/, need: 'manage' },
  { method: 'PUT', path: /^\/api\/lane\/(\d)\/(pipeline|models|model-defaults)$/, need: 'manage' },
  { method: 'DELETE', path: /^\/api\/lane\/(\d)\/pipeline$/, need: 'manage' },
  { method: 'DELETE', path: /^\/api\/proof\/(\d)$/, need: 'manage' },
  // Any other lane action is unknown to the server anyway; refuse it unless the caller may manage.
  { method: 'POST', path: /^\/api\/lane\/(\d)\/[^/]+$/, need: 'manage' },
  // Reading a lane: members of its project.
  { method: 'GET', path: /^\/api\/lane\/(\d)\//, need: 'view' },
  { method: 'GET', path: /^\/api\/(proof|reviews)\/(\d)$/, need: 'view', group: 2 },
  { method: 'GET', path: /^\/(proof|spec)\/(\d)\//, need: 'view', group: 2 },
];

/** The path as Express routes it: case-insensitive, repeated and trailing slashes ignored. */
export const routePath = p => (String(p || '/').replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')).toLowerCase();

export function matchRule(method, p, rules = RULES) {
  for (const r of rules) {
    if (r.method !== method) continue;
    const m = r.path.exec(p);
    if (m) return { rule: r, lane: r.lane === 'body' ? null : (m[r.group || 1] ? Number(m[r.group || 1]) : null) };
  }
  return null;
}

/**
 * Express middleware. Adds `req.access(n?)` → { admin, roles, allowed(action) } for handlers that
 * filter (GET /api/lanes) and refuses guarded routes the caller may not use.
 */
export function accessGuard({ authEnabled = AUTH_ENABLED, memberships = platformMemberships(), projectOf = laneProject,
  now = () => Date.now() } = {}) {
  const cache = new Map(); // token → { at, map }
  const rolesMap = async token => {
    const hit = cache.get(token);
    if (hit && now() - hit.at < CACHE_MS) return hit.map;
    const map = await memberships(token);
    cache.set(token, { at: now(), map });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return map;
  };

  return async (req, res, next) => {
    if (authEnabled === false && !req.user) req.user = LOCAL_ADMIN;
    const user = req.user;
    const token = parseCookies(req.headers.cookie)[AT_COOKIE];
    let map = null;
    const membership = async () => {
      if (isSysAdmin(user)) return new Map();
      map ||= await rolesMap(token);
      return map;
    };
    // Lane n (its project decides), or a project directly ({ project: pid }).
    req.access = async (n, { project } = {}) => {
      const admin = isSysAdmin(user);
      const pid = project || (n == null ? '' : projectOf(n));
      const roles = admin || !pid ? null : ((await membership()).get(pid) || null);
      return { admin, projectId: pid, roles, allowed: action => allowed(user, roles, action) };
    };
    req.memberships = membership;

    const hit = matchRule(req.method === 'HEAD' ? 'GET' : req.method, routePath(req.path));
    if (!hit) return next();
    const { rule } = hit;
    let n = hit.lane;
    let need = rule.need;
    let project = '';
    if (rule.lane === 'body') {
      // The lane it is for, else the project it is for (a feature set up before any lane runs it).
      const v = Number(req.body?.lane ?? req.body?.scope_lane);
      const p = typeof req.body?.scope_project === 'string' ? req.body.scope_project : '';
      if (Number.isInteger(v) && v > 0) n = v;
      else if (p) project = p;
      else need = rule.orNeed;
    }
    try {
      const a = await req.access(n, { project });
      if (a.allowed(need)) return next();
      const msg = a.admin || a.roles ? DENIED[need] || DENIED.default : (n != null || project ? DENIED.member : DENIED.admin);
      return res.status(403).json({ ok: false, error: msg, need });
    } catch (e) {
      return res.status(e.status || 503).json({ ok: false, error: e.message });
    }
  };
}

export const DENIED = {
  member: 'Bạn không phải thành viên của dự án mà lane này thuộc về',
  admin: 'Chỉ quản trị viên hệ thống được làm việc này',
  work: 'Chỉ Owner, Maintainer, PM hoặc Tech Lead của dự án được giao việc hoặc nhắn cho lane',
  manage: 'Chỉ Owner, Maintainer hoặc Tech Lead của dự án được điều khiển lane, quy trình và model AI',
  costs: 'Chỉ Owner của dự án được xem chi phí',
  default: 'Chỉ quản trị viên hệ thống được làm việc này',
};

/** GET /api/lanes for this caller: only their projects' lanes, each with `can`, costs only for owners. */
export async function scopeLanes(payload, req, projectOf = laneProject) {
  const access = await req.access();
  for (const l of payload.lanes) {
    const a = await req.access(l.lane);
    l.can = { view: a.allowed('view'), work: a.allowed('work'), manage: a.allowed('manage'), costs: a.allowed('costs'), admin: a.admin };
  }
  payload.is_admin = access.admin;
  if (access.admin) return payload;
  payload.lanes = payload.lanes.filter(l => l.can.view);
  const owned = new Set();
  for (const l of payload.lanes) {
    if (!l.can.costs) { delete l.cost_usd; delete l.cost_vnd; delete l.cost_quota_pct; } else owned.add(projectOf(l.lane));
  }
  const pc = payload.project_costs;
  if (pc) {
    const lanes = new Set(payload.lanes.filter(l => l.can.costs).map(l => l.lane));
    const byLane = (pc.byLane || []).filter(x => lanes.has(x.lane));
    const byProject = (pc.byProject || []).filter(x => owned.has(String(x.projectId)));
    const sum = k => byProject.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    payload.project_costs = { month: pc.month, byLane, byProject, totals: { usd: sum('usd'), vnd: sum('vnd') } };
  }
  return payload;
}
