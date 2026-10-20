import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from '../config.js';

// GitHub / GitLab connections for the project wizard (spec 2026-10-19 §4.5).
// One shared token per provider, set by a SYS_ADMIN; it lives only in this file (mode 600, gitignored)
// and never reaches the browser or a git config file.

export const PROVIDERS_FILE = process.env.GIT_PROVIDERS_FILE || path.join(HARNESS_ROOT, 'config', 'git-providers.json');
export const PROVIDER_IDS = ['github', 'gitlab'];
export const PROVIDER_LABEL = { local: 'Chỉ trên máy', github: 'GitHub', gitlab: 'GitLab' };
const DEFAULT_URL = { github: 'https://api.github.com', gitlab: 'https://gitlab.com' };

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

export function readProviders(file = PROVIDERS_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; }
}

function writeProviders(all, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

/** What the browser may see: never the token. */
export function publicProviders(all) {
  return Object.fromEntries(PROVIDER_IDS.map(id => {
    const p = all[id];
    return [id, p?.token ? { configured: true, login: p.login, url: p.url, tokenHint: `…${p.token.slice(-4)}` } : { configured: false, url: DEFAULT_URL[id] }];
  }));
}

export function normalizeUrl(provider, url) {
  const u = String(url || DEFAULT_URL[provider]).trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(u); } catch { throw fail('URL không hợp lệ'); }
  if (parsed.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) throw fail('URL phải dùng https');
  return u;
}

// ── HTTP clients ────────────────────────────────────────────────────────────

async function api(fetchImpl, url, token, provider, { method = 'GET', body } = {}) {
  const headers = provider === 'github'
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    : { 'PRIVATE-TOKEN': token };
  let r;
  try {
    r = await fetchImpl(url, {
      method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'shipyard' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw fail(`Không kết nối được ${PROVIDER_LABEL[provider]}: ${e.message}`, 502);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw fail(`Token ${PROVIDER_LABEL[provider]} không hợp lệ hoặc đã hết hạn`, 400);
  if (!r.ok) {
    const msg = j.message ? (typeof j.message === 'string' ? j.message : JSON.stringify(j.message)) : `HTTP ${r.status}`;
    const detail = Array.isArray(j.errors) ? ` (${j.errors.map(e => e.message || e.code || e).join(', ')})` : '';
    throw Object.assign(fail(`${PROVIDER_LABEL[provider]}: ${msg}${detail}`, r.status >= 500 ? 502 : 400), { httpStatus: r.status, body: j });
  }
  return j;
}

export const github = {
  async whoami(conn, f) { return (await api(f, `${conn.url}/user`, conn.token, 'github')).login; },
  async owners(conn, f) {
    const orgs = await api(f, `${conn.url}/user/orgs?per_page=100`, conn.token, 'github');
    return [{ id: conn.login, label: `${conn.login} (cá nhân)`, kind: 'user' },
      ...orgs.map(o => ({ id: o.login, label: o.login, kind: 'org' }))];
  },
  async createRepo(conn, f, { owner, name, description, visibility }) {
    const url = owner === conn.login ? `${conn.url}/user/repos` : `${conn.url}/orgs/${encodeURIComponent(owner)}/repos`;
    try {
      const r = await api(f, url, conn.token, 'github', { method: 'POST',
        body: { name, description, private: visibility !== 'public', auto_init: false } });
      return { cloneUrl: r.clone_url, webUrl: r.html_url };
    } catch (e) {
      if (e.httpStatus === 422 && /already exists/i.test(JSON.stringify(e.body))) throw fail(`Repo ${owner}/${name} đã tồn tại trên GitHub — đổi slug hoặc xoá repo cũ`, 409);
      throw e;
    }
  },
  /** HTTPS basic auth: GitHub accepts any user name with a token as password. */
  authHeader: conn => `Authorization: Basic ${Buffer.from(`${conn.login}:${conn.token}`).toString('base64')}`,
};

export const gitlab = {
  async whoami(conn, f) { return (await api(f, `${conn.url}/api/v4/user`, conn.token, 'gitlab')).username; },
  async owners(conn, f) {
    const ns = await api(f, `${conn.url}/api/v4/namespaces?per_page=100`, conn.token, 'gitlab');
    return ns.map(n => ({ id: String(n.id), label: n.kind === 'user' ? `${n.full_path} (cá nhân)` : n.full_path, kind: n.kind }));
  },
  async createRepo(conn, f, { owner, name, description, visibility }) {
    try {
      const r = await api(f, `${conn.url}/api/v4/projects`, conn.token, 'gitlab', { method: 'POST',
        body: { name, path: name, namespace_id: Number(owner), description, visibility: visibility === 'public' ? 'public' : 'private',
          initialize_with_readme: false } });
      return { cloneUrl: r.http_url_to_repo, webUrl: r.web_url };
    } catch (e) {
      if (e.httpStatus === 400 && /taken|already/i.test(JSON.stringify(e.body))) throw fail(`Repo ${name} đã tồn tại trong group/namespace này trên GitLab`, 409);
      throw e;
    }
  },
  authHeader: conn => `Authorization: Basic ${Buffer.from(`oauth2:${conn.token}`).toString('base64')}`,
};

export const CLIENTS = { github, gitlab };

// ── store ───────────────────────────────────────────────────────────────────

export function createProviderStore({ file = PROVIDERS_FILE, fetchImpl = fetch, clients = CLIENTS } = {}) {
  const conn = id => {
    if (!PROVIDER_IDS.includes(id)) throw fail('Nhà cung cấp Git không hợp lệ');
    const c = readProviders(file)[id];
    if (!c?.token) throw fail(`Chưa kết nối ${PROVIDER_LABEL[id]}`);
    return c;
  };
  return {
    list: () => publicProviders(readProviders(file)),
    /** Verify the token against the provider before saving it. */
    async save(id, { token, url }) {
      if (!PROVIDER_IDS.includes(id)) throw fail('Nhà cung cấp Git không hợp lệ');
      const all = readProviders(file);
      const t = String(token || '').trim() || all[id]?.token;
      if (!t || /\s/.test(t) || t.length > 400) throw fail('Nhập token hợp lệ');
      const c = { token: t, url: normalizeUrl(id, url) };
      c.login = await clients[id].whoami(c, fetchImpl);
      writeProviders({ ...all, [id]: { ...c, savedAt: new Date().toISOString() } }, file);
      return publicProviders(readProviders(file))[id];
    },
    remove(id) {
      const all = readProviders(file);
      delete all[id];
      writeProviders(all, file);
      return publicProviders(all)[id];
    },
    owners: id => { const c = conn(id); return clients[id].owners(c, fetchImpl); },
    createRepo: (id, args) => { const c = conn(id); return clients[id].createRepo(c, fetchImpl, args); },
    authHeader: id => { const c = conn(id); return clients[id].authHeader(c); },
    configured: id => !!readProviders(file)[id]?.token,
  };
}

/**
 * Push main + development with a one-shot auth header passed through GIT_CONFIG_* env vars:
 * it is not on the command line (ps), not in .git/config, and not in the job log.
 */
export async function pushRepo(dir, authHeader, run) {
  const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: authHeader, GIT_TERMINAL_PROMPT: '0' };
  await run('git', ['push', '-u', 'origin', 'main', 'development'], { cwd: dir, extraEnv: env });
}
