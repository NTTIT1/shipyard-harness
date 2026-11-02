import { serviceToken } from './scaffold/setup.js';

// The project memory (context-service). A document approved in a project chat is sent as a STEP_APPROVED
// event — the same one a lane's approved step makes — so it shows in "Bộ nhớ dự án" and every later AI
// step can find it. The event id is fixed per chat step, so a resend is never stored twice.
export const CONTEXT_URL = (process.env.CONTEXT_URL || 'http://127.0.0.1:9085').replace(/\/$/, '');

export function memoryClient({ url = CONTEXT_URL, token = serviceToken, fetchImpl = fetch } = {}) {
  return {
    async approved({ eventId, projectId, runId, runTitle, step, documents }) {
      const r = await fetchImpl(`${url}/internal/v1/memory/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token() },
        body: JSON.stringify({ eventId, type: 'STEP_APPROVED', payload: { projectId, runId, runTitle, step, revisionNo: 1, documents } }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(j.message || `context-service HTTP ${r.status}`);
      return j.data;
    },
  };
}
