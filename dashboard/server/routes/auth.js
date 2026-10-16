import { Router } from 'express';
import {
  AUTH_ENABLED, AT_COOKIE, RT_COOKIE, verifyJwt, parseCookies, userFromClaims,
  setSessionCookies, clearSessionCookies, platformPost,
} from '../services/auth.js';

const router = Router();

function fail(res, status, body) {
  return res.status(status >= 500 ? 502 : status).json({ ok: false, error: body?.message || `HTTP ${status}` });
}

router.get('/auth/me', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ ok: true, authEnabled: false, user: null });
  const claims = verifyJwt(parseCookies(req.headers.cookie)[AT_COOKIE]);
  if (!claims) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  res.json({ ok: true, authEnabled: true, user: userFromClaims(claims) });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Nhập email và mật khẩu' });
  const { status, body } = await platformPost('/api/v1/auth/login', { email, password });
  if (status !== 200 || !body?.data?.accessToken) return fail(res, status, body);
  setSessionCookies(res, body.data);
  const claims = verifyJwt(body.data.accessToken);
  // A token we can't verify means the dashboard and auth-service disagree on JWT_SECRET.
  if (!claims) { clearSessionCookies(res); return res.status(500).json({ ok: false, error: 'JWT_SECRET của dashboard không khớp auth-service' }); }
  res.json({ ok: true, user: userFromClaims(claims) });
});

router.post('/auth/refresh', async (req, res) => {
  const refreshToken = parseCookies(req.headers.cookie)[RT_COOKIE];
  if (!refreshToken) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  const { status, body } = await platformPost('/api/v1/auth/refresh', { refreshToken });
  if (status !== 200 || !body?.data?.accessToken) {
    if (status < 500) clearSessionCookies(res);
    return fail(res, status === 200 ? 401 : status, body);
  }
  setSessionCookies(res, body.data);
  const claims = verifyJwt(body.data.accessToken);
  res.json({ ok: true, user: claims ? userFromClaims(claims) : null });
});

router.post('/auth/logout', async (req, res) => {
  const refreshToken = parseCookies(req.headers.cookie)[RT_COOKIE];
  if (refreshToken) await platformPost('/api/v1/auth/logout', { refreshToken });
  clearSessionCookies(res);
  res.json({ ok: true });
});

export default router;
