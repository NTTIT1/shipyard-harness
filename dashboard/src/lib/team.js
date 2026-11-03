import { authFetch } from './api.js';
import { tr } from './i18n.js';

// "Đội AI" tab client (server: dashboard/server/routes/team.js) + pure helpers for the editor.
async function call(method, url, body) {
  const r = await authFetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, branches: j.branches });
  return j;
}
const enc = encodeURIComponent;

export const teamApi = {
  state: (pid, refresh = false) => call('GET', `/api/team/${enc(pid)}${refresh ? '?refresh=1' : ''}`),
  setBranch: (pid, branch) => call('PUT', `/api/team/${enc(pid)}/branch`, { branch }),
  adopt: (pid, note) => call('POST', `/api/team/${enc(pid)}/adopt`, { note }),
  propose: (pid, body) => call('POST', `/api/team/${enc(pid)}/propose`, body),
  redraft: (pid, note) => call('POST', `/api/team/${enc(pid)}/redraft`, { note }),
  retry: pid => call('POST', `/api/team/${enc(pid)}/retry`),
  putHuman: (pid, name, content) => call('PUT', `/api/team/${enc(pid)}/human/${enc(name)}`, { content }),
  deleteHuman: (pid, name) => call('DELETE', `/api/team/${enc(pid)}/human/${enc(name)}`),
  humanUrl: (pid, name) => `/api/team/${enc(pid)}/human/${enc(name)}`,
  skill: (pid, id) => call('GET', `/api/team/${enc(pid)}/skill/${enc(id)}`),
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
    r.onerror = () => reject(new Error(tr('Không đọc được {0}', [file.name])));
    r.readAsDataURL(file);
  });
}

export const formatSize = n => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const SKILL_KIND_ORDER = { new: 0, installed: 1, repo: 2, catalog: 3, unknown: 4 };

/**
 * Rows of the skill × role matrix: skills installed on the machine for every project, skills already in
 * the repo (.claude/skills/), Shipyard's catalog (copied into the repo when approved) and any name a role
 * lists that none of those knows. `suggested`: the roles Shipyard recommends the skill for.
 */
export function skillRows(state, team, newSkills = {}) {
  const out = new Map();
  const repoDesc = Object.fromEntries((state?.repoSkills || []).map(r => [r.id, r.desc || '']));
  for (const c of state?.skillCatalog || []) {
    out.set(c.id, { id: c.id, label: c.label || c.id, desc: c.desc || '', kind: c.installed ? 'installed' : 'catalog', suggested: c.roles || [] });
  }
  for (const id of state?.skills || []) {
    const c = out.get(id);
    out.set(id, c && c.kind === 'installed' ? c : { ...(c || { label: id, desc: repoDesc[id] || '', suggested: [] }), id, kind: 'repo' });
  }
  for (const [id, text] of Object.entries(newSkills || {})) {
    const c = out.get(id);
    out.set(id, { id, label: c?.label && c.kind !== 'repo' ? c.label : id, desc: parseSkillMd(text).desc, kind: 'new', suggested: c?.suggested || [], replaces: c ? c.kind : null });
  }
  for (const r of Object.values(team?.roles || {})) {
    for (const id of r?.skills || []) if (!out.has(id)) out.set(id, { id, label: id, desc: '', kind: 'unknown', suggested: [] });
  }
  return [...out.values()].sort((a, b) => SKILL_KIND_ORDER[a.kind] - SKILL_KIND_ORDER[b.kind] || a.label.localeCompare(b.label));
}

export const SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const fold = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** A skill name from a file name or a title: "API chuẩn Công ty.md" → "api-chuan-cong-ty". */
export function skillIdFrom(name) {
  return fold(String(name || '').replace(/\.md$/i, '').replace(/^SKILL$/i, ''))
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').replace(/-{2,}/g, '-').slice(0, 64);
}

/** A SKILL.md's front matter (name, description — else its first plain line) and body; same reading as the server. */
export function parseSkillMd(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  const front = m ? m[1] : '';
  const body = m ? t.slice(m[0].length) : t;
  const field = k => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(front)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const firstLine = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#')) || '';
  const title = (body.split('\n').map(l => l.trim()).find(l => /^#\s/.test(l)) || '').replace(/^#\s+/, '');
  return { name: field('name'), title, desc: (field('description') || firstLine.replace(/^[-*]\s*/, '')).slice(0, 300), body: body.trim() };
}

export const SKILL_FILTERS = ['suggested', 'all', 'repo', 'installed', 'catalog', 'new'];

/**
 * One role's view of the library: the skills it uses (in its order) and the ones it could add,
 * searched (accent-insensitive, name/description/id) and filtered; suggestions for the role first.
 */
export function roleLibrary(rows, team, role, { q = '', filter = 'suggested' } = {}) {
  const using = team?.roles?.[role]?.skills || [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const used = using.map(id => byId.get(id) || { id, label: id, desc: '', kind: 'unknown', suggested: [] });
  const words = fold(q).split(/\s+/).filter(Boolean);
  const match = r => words.every(w => fold(`${r.label} ${r.desc} ${r.id}`).includes(w));
  const keep = r => (filter === 'suggested' ? r.suggested.includes(role) || r.kind === 'new'
    : filter === 'all' ? true : r.kind === filter);
  const pool = rows.filter(r => !using.includes(r.id));
  const counts = Object.fromEntries(SKILL_FILTERS.map(f => [f, pool.filter(r => (f === 'suggested' ? r.suggested.includes(role) || r.kind === 'new' : f === 'all' ? true : r.kind === f)).length]));
  const available = pool.filter(r => keep(r) && match(r))
    .sort((a, b) => ((b.kind === 'new') - (a.kind === 'new')) || (b.suggested.includes(role) - a.suggested.includes(role)) || a.label.localeCompare(b.label));
  return { used, available, counts };
}
