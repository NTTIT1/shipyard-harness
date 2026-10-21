// Every data call goes through authFetch: on a 401 it tries one silent refresh
// (the refresh token lives in an HttpOnly cookie scoped to /auth) and, if that
// fails too, broadcasts 'auth:expired' so AuthGate swaps back to the login page.
let refreshing = null;
function refreshSession() {
  refreshing ||= fetch('/auth/refresh', { method: 'POST' })
    .then(r => r.ok)
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function authFetch(url, opts) {
  let r = await fetch(url, opts);
  if (r.status !== 401) return r;
  if (await refreshSession()) r = await fetch(url, opts);
  if (r.status === 401) window.dispatchEvent(new Event('auth:expired'));
  return r;
}

async function authJson(url, method, body) {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ...j, ok: r.ok && j.ok !== false, status: r.status };
}
export const fetchMe = () => authJson('/auth/me', 'GET');
export const login = (email, password) => authJson('/auth/login', 'POST', { email, password });
export const logout = () => authJson('/auth/logout', 'POST', {});

async function checked(r) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchLanes() {
  return checked(await authFetch('/api/lanes'));
}

export async function fetchProof(n) {
  return checked(await authFetch(`/api/proof/${n}`));
}

export async function fetchReviews(n) {
  return checked(await authFetch(`/api/reviews/${n}`));
}

export async function fetchCreds(n) {
  return checked(await authFetch(`/api/lane/${n}/creds-current`));
}

export async function deleteProof(n, body) {
  return checked(await authFetch(`/api/proof/${n}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }));
}

/** Shipyard-generated projects a new lane can be bound to (multi-project lanes). */
export async function fetchLaneProjects() {
  const r = await authFetch('/api/lanes/projects');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function postAction(n, action, body) {
  const opts = { method: 'POST' };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const url = n == null ? '/api/lanes/add' : `/api/lane/${n}/${action}`;
  return checked(await authFetch(url, opts));
}

async function send(url, method, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await authFetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export const fetchProviders = () => send('/api/providers', 'GET');
export const saveProviders = providers => send('/api/providers', 'PUT', { providers });
export const testProvider = id => send(`/api/providers/${id}/test`, 'POST', {});
export const fetchCosts = month => send(`/api/costs${month ? `?month=${encodeURIComponent(month)}` : ''}`, 'GET');
export const saveCostSettings = settings => send('/api/costs/settings', 'PUT', settings);
export const saveFeatureHours = (key, hours) => send('/api/costs/feature-hours', 'PUT', { key, hours });
export const saveModelDefaults = defaults => send('/api/models', 'PUT', { defaults });
export const saveLaneModelDefaults = (n, defaults) => send(`/api/lane/${n}/model-defaults`, 'PUT', { defaults });
export const saveFeatureModels = body => send('/api/features/models', 'PUT', body);
export const restartGateway = () => send('/api/gateway/restart', 'POST', {});
export const assignLane = (n, body) => send(`/api/lane/${n}/assign`, 'POST', body);
export const fetchSpecs = n => send(`/api/lane/${n}/specs`, 'GET');
export const saveLaneModels = (n, models, effort, extra = {}) => send(`/api/lane/${n}/models`, 'PUT', { models, effort, ...extra });
export const fetchLaneUsage = (n, month) => send(`/api/lane/${n}/usage${month ? `?month=${encodeURIComponent(month)}` : ''}`, 'GET');
export const saveLaneLimit = (n, limit) => send(`/api/lane/${n}/limit`, 'PUT', limit);
export const sendChat = (n, text) => send(`/api/lane/${n}/chat/message`, 'POST', { text });
export const answerChat = (n, id, payload) => send(`/api/lane/${n}/chat/answer`, 'POST', { id, ...payload });
export const stopSession = n => send(`/api/lane/${n}/session/stop`, 'POST', {});
export const resumeSession = n => send(`/api/lane/${n}/session/resume`, 'POST', {});
