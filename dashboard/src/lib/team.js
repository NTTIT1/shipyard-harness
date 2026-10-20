import { authFetch } from './api.js';

// "Đội AI" tab client (server: dashboard/server/routes/team.js) + pure helpers for the editor.
async function call(method, url, body) {
  const r = await authFetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}
const enc = encodeURIComponent;

export const teamApi = {
  state: (pid, refresh = false) => call('GET', `/api/team/${enc(pid)}${refresh ? '?refresh=1' : ''}`),
  adopt: (pid, note) => call('POST', `/api/team/${enc(pid)}/adopt`, { note }),
  propose: (pid, body) => call('POST', `/api/team/${enc(pid)}/propose`, body),
  redraft: (pid, note) => call('POST', `/api/team/${enc(pid)}/redraft`, { note }),
  retry: pid => call('POST', `/api/team/${enc(pid)}/retry`),
  putHuman: (pid, name, content) => call('PUT', `/api/team/${enc(pid)}/human/${enc(name)}`, { content }),
  deleteHuman: (pid, name) => call('DELETE', `/api/team/${enc(pid)}/human/${enc(name)}`),
  humanUrl: (pid, name) => `/api/team/${enc(pid)}/human/${enc(name)}`,
};

export const RULE_NAME_RE = /^[a-z0-9][a-z0-9_-]*\.md$/;
export const ROLE_ORDER = ['MANAGER', 'PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'REVIEW', 'TEST', 'DEVOPS'];

export const roleKeys = team => {
  const keys = Object.keys(team?.roles || {});
  return [...ROLE_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !ROLE_ORDER.includes(k))];
};

/** Rule files as matrix columns: project.md first, then by name. */
export const ruleColumns = rules => Object.keys(rules || {}).sort((a, b) => (a === 'project.md' ? -1 : b === 'project.md' ? 1 : a.localeCompare(b)));

/** Immutable toggle of a list entry (`reads` path or `skills` name) on one role. */
export function toggleRole(team, role, field, value) {
  const cur = team.roles[role]?.[field] || [];
  const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
  return { ...team, roles: { ...team.roles, [role]: { ...team.roles[role], [field]: next } } };
}

/** Drop a deleted rule file from every role's `reads`. */
export function forgetRule(team, file) {
  const p = `rules/${file}`;
  return { ...team, roles: Object.fromEntries(Object.entries(team.roles).map(([k, v]) => [k, { ...v, reads: (v.reads || []).filter(r => r !== p) }])) };
}

/** What changed between the approved rules and the editor: { name: text | null (deleted) }. */
export function ruleChanges(original, edited) {
  const out = {};
  for (const [n, t] of Object.entries(edited)) if (original[n] !== t) out[n] = t;
  for (const n of Object.keys(original)) if (!(n in edited)) out[n] = null;
  return out;
}

export const sameTeam = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Không đọc được ${file.name}`));
    r.readAsDataURL(file);
  });
}

export const formatSize = n => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
