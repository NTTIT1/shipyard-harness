async function checked(r) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchLanes() {
  return checked(await fetch('/api/lanes'));
}

export async function fetchProof(n) {
  return checked(await fetch(`/api/proof/${n}`));
}

export async function fetchReviews(n) {
  return checked(await fetch(`/api/reviews/${n}`));
}

export async function fetchCreds(n) {
  return checked(await fetch(`/api/lane/${n}/creds-current`));
}

export async function deleteProof(n, body) {
  return checked(await fetch(`/api/proof/${n}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }));
}

export async function postAction(n, action, body) {
  const opts = { method: 'POST' };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const url = n == null ? '/api/lanes/add' : `/api/lane/${n}/${action}`;
  return checked(await fetch(url, opts));
}

async function send(url, method, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export const fetchProviders = () => send('/api/providers', 'GET');
export const saveProviders = providers => send('/api/providers', 'PUT', { providers });
export const testProvider = id => send(`/api/providers/${id}/test`, 'POST', {});
export const saveModelDefaults = defaults => send('/api/models', 'PUT', { defaults });
export const restartGateway = () => send('/api/gateway/restart', 'POST', {});
export const assignLane = (n, body) => send(`/api/lane/${n}/assign`, 'POST', body);
export const fetchSpecs = n => send(`/api/lane/${n}/specs`, 'GET');
export const saveLaneModels = (n, models) => send(`/api/lane/${n}/models`, 'PUT', { models });
export const sendChat = (n, text) => send(`/api/lane/${n}/chat/message`, 'POST', { text });
export const answerChat = (n, id, payload) => send(`/api/lane/${n}/chat/answer`, 'POST', { id, ...payload });
export const stopSession = n => send(`/api/lane/${n}/session/stop`, 'POST', {});
export const resumeSession = n => send(`/api/lane/${n}/session/resume`, 'POST', {});
