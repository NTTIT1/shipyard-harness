import { authFetch } from './api.js';

// Browser client for the Shipyard Platform via the dashboard's /api/platform proxy.
async function call(method, path, body) {
  const r = await authFetch(`/api/platform/${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw Object.assign(new Error(j.message || j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}
const data = p => p.then(j => j.data);
const q = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const platform = {
  inbox: () => data(call('GET', 'approvals/inbox')),
  run: id => data(call('GET', `runs/${id}`)),
  revision: (runId, revId) => data(call('GET', `runs/${runId}/revisions/${revId}`)),
  /** → { data: DecisionResult, resumed } */
  decide: (approvalId, body) => call('POST', `approvals/${approvalId}/decision`, body),
  projects: () => data(call('GET', 'projects')),
  createProject: body => data(call('POST', 'projects', body)),
  members: pid => data(call('GET', `projects/${pid}/members`)),
  setMemberRoles: (pid, userId, roles) => data(call('POST', `projects/${pid}/members`, { userId, roles })),
  removeMember: (pid, userId) => data(call('DELETE', `projects/${pid}/members/${userId}`)),
  users: ids => (ids.length ? data(call('GET', `auth/users?${q({ ids: ids.join(',') })}`)) : Promise.resolve([])),
  lookupUser: email => data(call('GET', `auth/users/lookup?${q({ email })}`)),
  gatePolicy: pid => data(call('GET', `projects/${pid}/gate-policy`)),
  setGatePolicy: (pid, policy) => data(call('PUT', `projects/${pid}/gate-policy`, policy)),
  projectRuns: pid => data(call('GET', `projects/${pid}/runs`)),
  memory: (pid, { q: text, kind } = {}) => data(call('GET', `projects/${pid}/memory?${q({ q: text, kind })}`)),
  adminUsers: () => data(call('GET', 'auth/admin/users')),
  createUser: body => data(call('POST', 'auth/admin/users', body)),
  updateUser: (id, patch) => data(call('PATCH', `auth/admin/users/${id}`, patch)),
  resetPassword: (id, password) => call('POST', `auth/admin/users/${id}/password`, { password }),
  changeMyPassword: (currentPassword, newPassword) => call('POST', 'auth/me/password', { currentPassword, newPassword }),
  setMemoryDisabled: (pid, itemId, disabled) => data(call('PATCH', `projects/${pid}/memory/${itemId}`, { disabled })),
};
