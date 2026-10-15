import crypto from 'crypto';
import { SECRETS_ENV, loadEnvFile } from './config.js';

// Dashboard login is delegated to the Shipyard Platform (api-gateway → auth-service).
// The dashboard acts as a BFF: it keeps the platform's JWT pair in HttpOnly cookies
// (so EventSource and <img src="/proof/..."> are authenticated too) and verifies the
// access token locally with the shared HMAC secret — no round-trip per request.
const secrets = loadEnvFile(SECRETS_ENV);
// Same dev default as platform SecurityConstants.DEFAULT_JWT_SECRET; set JWT_SECRET for real installs.
const DEV_SECRET = 'shipyard-super-secret-key-that-is-at-least-256-bits-long-for-hmac-sha256';

export const AUTH_ENABLED = (process.env.DASHBOARD_AUTH || secrets.DASHBOARD_AUTH || 'on') !== 'off';
export const JWT_SECRET = process.env.JWT_SECRET || secrets.JWT_SECRET || DEV_SECRET;
export const PLATFORM_URL = (process.env.PLATFORM_GATEWAY_URL || secrets.PLATFORM_GATEWAY_URL || 'http://127.0.0.1:9080').replace(/\/$/, '');
export const usingDevSecret = JWT_SECRET === DEV_SECRET;

export const AT_COOKIE = 'sy_at';
export const RT_COOKIE = 'sy_rt';
const RT_MAX_AGE = 7 * 24 * 3600; // matches auth-service refresh-token-expiration-seconds

const HMAC = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

function b64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Verify a compact JWS signed by auth-service (jjwt picks HS256/384/512 from the key length).
// Returns the claims, or null when the token is malformed, forged, or expired.
export function verifyJwt(token, secret = JWT_SECRET, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try { header = b64urlJson(parts[0]); claims = b64urlJson(parts[1]); } catch { return null; }
  const alg = HMAC[header?.alg];
  if (!alg) return null; // rejects "none" and asymmetric algs
  const expected = crypto.createHmac(alg, secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
  return claims;
}

export function parseCookies(header) {
  const out = {};
  for (const pair of (header || '').split(';')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, maxAge, cookiePath = '/') {
  return `${name}=${encodeURIComponent(value)}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

export function setSessionCookies(res, { accessToken, refreshToken, expiresIn }) {
  res.setHeader('Set-Cookie', [
    cookie(AT_COOKIE, accessToken, expiresIn || 900),
    cookie(RT_COOKIE, refreshToken, RT_MAX_AGE, '/auth'),
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [cookie(AT_COOKIE, '', 0), cookie(RT_COOKIE, '', 0, '/auth')]);
}

export function userFromClaims(c) {
  return { id: c.sub, email: c.email || '', role: c.role || '' };
}

// POST to the platform gateway; returns { status, body } with the ApiResponse envelope.
export async function platformPost(path, payload, fetchImpl = fetch) {
  let r;
  try {
    r = await fetchImpl(`${PLATFORM_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { status: 503, body: { success: false, message: 'Không kết nối được Shipyard Platform (api-gateway)' } };
  }
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// Paths reachable without a session: the login API itself and the SPA shell/assets
// (the shell holds no data — every data route below stays gated).
export function isPublicPath(p) {
  // Case-insensitive + repeated slashes: Express routing would match /API/lanes or //api/lanes too.
  return p.startsWith('/auth/') || !/^\/+(api|proof|spec)(\/|$)/i.test(p);
}

export function requireAuth({ enabled = AUTH_ENABLED, secret = JWT_SECRET } = {}) {
  return (req, res, next) => {
    if (!enabled || isPublicPath(req.path)) return next();
    const claims = verifyJwt(parseCookies(req.headers.cookie)[AT_COOKIE], secret);
    if (!claims) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    req.user = userFromClaims(claims);
    next();
  };
}
