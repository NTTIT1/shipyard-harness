import { Router } from 'express';
import os from 'os';
import { PLATFORM_URL, AT_COOKIE, parseCookies } from '../services/auth.js';
import * as S from '../services/sessions.js';

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
  sessions.startSession(n, { model: info.model, prompt: message, resume: info.session_id });
  return true;
}

export function platformRouter({ gatewayUrl = PLATFORM_URL, sessions = S, hostname = os.hostname(), fetchImpl = fetch } = {}) {
  const router = Router();
  router.all('/api/platform/*', async (req, res) => {
    const sub = req.params[0] || '';
    if (!SAFE.test(sub) || sub.split('/').some(s => s === '..' || s === '.') || /^internal(\/|$)/i.test(sub)) {
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
      const msg = `Cổng ${(req.body || {}).step || body.data.step || ''} đã có quyết định: ${(req.body || {}).action || ''}. `
        + 'Tiếp tục vòng lặp role: chạy orch.sh next.';
      body.resumed = false;
      if (n != null) {
        try { body.resumed = resumeLane(n, msg, sessions); } catch { body.resumed = false; }
      }
    }
    res.status(r.status).json(body);
  });
  return router;
}
