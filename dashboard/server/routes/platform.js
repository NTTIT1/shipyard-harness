import { Router } from 'express';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { BIN } from '../services/config.js';
import { PLATFORM_URL, AT_COOKIE, parseCookies } from '../services/auth.js';
import * as S from '../services/sessions.js';
import { defaultSetupRunner } from '../services/scaffold/setup.js';
import { defaultBlueprintRunner } from '../services/scaffold/blueprint.js';

// Browser → /api/platform/<path> → gateway /api/v1/<path> with the session JWT (BFF, spec §7.1).
// A successful gate decision wakes the lane that owns the run (laneRef "<host>:lane<N>").
const SAFE = /^[A-Za-z0-9_\-./]+$/;

export function laneOf(laneRef, host = os.hostname()) {
  const m = /^(.*):lane(\d+)$/.exec(laneRef || '');
  return m && m[1] === host ? Number(m[2]) : null;
}

/** Live session → message it; saved session → resume with the message; else false. */
export function resumeLane(n, message, sessions = S) {
  if (sessions.isRunning(n)) {
    sessions.sendMessage(n, message);
    return true;
  }
  const info = sessions.sessionInfo(n);
  if (!info) return false;
  sessions.startSession(n, { model: info.model, effort: info.effort || undefined, prompt: message, resume: info.session_id });
  return true;
}

const ACTIONS = new Set(['APPROVE', 'REQUEST_CHANGES', 'SEND_BACK', 'CANCEL']);

function stateRunId(n) {
  const r = spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'get', 'run_id'], { encoding: 'utf8', timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : '';
}

export function platformRouter({ gatewayUrl = PLATFORM_URL, sessions = S, hostname = os.hostname(), fetchImpl = fetch,
  laneRunId = stateRunId, setup = defaultSetupRunner(), blueprint = defaultBlueprintRunner() } = {}) {
  const router = Router();
  router.all('/api/platform/*', async (req, res) => {
    const sub = req.params[0] || '';
    if (!SAFE.test(sub) || sub.split('/').some(s => s === '..' || s === '.' || s === '') || /^internal(\/|$)/i.test(sub)) {
      return res.status(400).json({ success: false, message: 'Đường dẫn không hợp lệ' });
    }
    const qi = req.originalUrl.indexOf('?');
    const qs = qi >= 0 ? req.originalUrl.slice(qi) : '';
    const token = parseCookies(req.headers.cookie)[AT_COOKIE];
    let r;
    try {
      r = await fetchImpl(`${gatewayUrl}/api/v1/${sub}${qs}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return res.status(503).json({ success: false, message: 'Không kết nối được Shipyard Platform' });
    }
    const body = await r.json().catch(() => ({ success: r.ok }));
    if (r.ok && req.method === 'POST' && /^approvals\/[^/]+\/decision$/.test(sub) && body?.data) {
      const n = laneOf(body.data.laneRef, hostname);
      // Server data + an allowlisted action only: nothing the browser typed reaches the Claude session.
      const action = ACTIONS.has((req.body || {}).action) ? req.body.action : 'DECIDED';
      const msg = `Cổng duyệt đã có quyết định: ${action}. Bước hiện tại của run: ${body.data.step || body.data.mode}. `
        + 'Tiếp tục vòng lặp role: chạy orch.sh next.';
      body.resumed = false;
      // Project-rules runs are worked by the dashboard's AI Manager runner, not a lane.
      if (setup?.owns(body.data.laneRef)) {
        setup.work(body.data.runId);
        body.resumed = true;
        return res.status(r.status).json(body);
      }
      // Architecture of a new project: redraft on changes, scaffold on approval.
      if (blueprint?.owns(body.data.laneRef)) {
        blueprint.work(body.data.runId);
        body.resumed = true;
        return res.status(r.status).json(body);
      }
      // The lane may since run another feature: only wake it for the run it is driving.
      if (n != null && laneRunId(n) === body.data.runId) {
        try { body.resumed = resumeLane(n, msg, sessions); } catch { body.resumed = false; }
      }
    }
    res.status(r.status).json(body);
  });
  return router;
}
