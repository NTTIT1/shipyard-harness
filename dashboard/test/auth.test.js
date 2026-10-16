// Dashboard login gate: JWTs issued by the platform auth-service are verified
// locally; every data route 401s without a valid session cookie.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import http from 'http';

const SECRET = 'test-secret-that-is-long-enough-for-hmac-sha512-signing-0123456789abcdef';
const HS = { HS256: 'sha256', HS512: 'sha512' };

function sign(claims, { alg = 'HS512', secret = SECRET } = {}) {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${enc({ alg })}.${enc(claims)}`;
  const sig = HS[alg] ? crypto.createHmac(HS[alg], secret).update(head).digest('base64url') : '';
  return `${head}.${sig}`;
}
const claims = (over = {}) => ({ sub: 'usr_1', email: 'a@b.c', role: 'USER', exp: Math.floor(Date.now() / 1000) + 600, ...over });

let auth, platform, platformUrl, dash, dashUrl;

beforeAll(async () => {
  // Fake api-gateway: admin@x / pw logs in, everything else is rejected.
  platform = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const j = JSON.parse(body || '{}');
      res.setHeader('Content-Type', 'application/json');
      const issue = () => res.end(JSON.stringify({ success: true, data: { accessToken: sign(claims()), refreshToken: 'rt-1', expiresIn: 900 } }));
      if (req.url === '/api/v1/auth/login' && j.email === 'admin@x' && j.password === 'pw') return issue();
      if (req.url === '/api/v1/auth/refresh' && j.refreshToken === 'rt-1') return issue();
      if (req.url === '/api/v1/auth/logout') return res.end(JSON.stringify({ success: true }));
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
    });
  });
  await new Promise(r => platform.listen(0, '127.0.0.1', r));
  platformUrl = `http://127.0.0.1:${platform.address().port}`;
  process.env.JWT_SECRET = SECRET;
  process.env.PLATFORM_GATEWAY_URL = platformUrl;
  process.env.DASHBOARD_AUTH = 'on';
  auth = await import('../server/services/auth.js');
  const { createApp } = await import('../server/app.js');
  dash = createApp().listen(0, '127.0.0.1');
  await new Promise(r => dash.once('listening', r));
  dashUrl = `http://127.0.0.1:${dash.address().port}`;
});

afterAll(() => { dash?.close(); platform?.close(); });

describe('verifyJwt', () => {
  it('accepts a valid HS512 token (jjwt default for a 72-byte key) and HS256', () => {
    expect(auth.verifyJwt(sign(claims()), SECRET)?.sub).toBe('usr_1');
    expect(auth.verifyJwt(sign(claims(), { alg: 'HS256' }), SECRET)?.sub).toBe('usr_1');
  });
  it('rejects expired, forged, alg=none and garbage tokens', () => {
    expect(auth.verifyJwt(sign(claims({ exp: 1 })), SECRET)).toBeNull();
    expect(auth.verifyJwt(sign(claims(), { secret: 'other-secret-other-secret-other-secret' }), SECRET)).toBeNull();
    expect(auth.verifyJwt(sign(claims(), { alg: 'none' }), SECRET)).toBeNull();
    expect(auth.verifyJwt('a.b.c', SECRET)).toBeNull();
    expect(auth.verifyJwt(undefined, SECRET)).toBeNull();
  });
  it('rejects a token with a tampered payload', () => {
    const [h, , s] = sign(claims()).split('.');
    const evil = Buffer.from(JSON.stringify(claims({ role: 'SYS_ADMIN' }))).toString('base64url');
    expect(auth.verifyJwt(`${h}.${evil}.${s}`, SECRET)).toBeNull();
  });
});

describe('isPublicPath', () => {
  it('keeps the shell and /auth public, gates data routes in any casing', () => {
    for (const p of ['/', '/index.html', '/assets/x.js', '/auth/login', '/sw.js']) expect(auth.isPublicPath(p)).toBe(true);
    for (const p of ['/api/lanes', '/API/lanes', '//api/lanes', '/proof/1/a.png', '/spec/1/spec.md', '/api']) expect(auth.isPublicPath(p)).toBe(false);
  });
});

describe('dashboard login gate (HTTP)', () => {
  it('401s data routes without a session', async () => {
    for (const p of ['/api/lanes', '/API/lanes', '/api/providers', '/proof/1/x.png', '/spec/1/x.md']) {
      expect((await fetch(dashUrl + p)).status, p).toBe(401);
    }
  });

  it('rejects a wrong password with the platform message', async () => {
    const r = await fetch(`${dashUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@x', password: 'nope' }) });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toMatch(/Invalid/);
  });

  it('logs in, sets HttpOnly cookies, and the cookie unlocks data routes', async () => {
    const r = await fetch(`${dashUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@x', password: 'pw' }) });
    expect(r.status).toBe(200);
    expect((await r.json()).user.email).toBe('a@b.c');
    const set = r.headers.getSetCookie();
    expect(set.find(c => c.startsWith('sy_at='))).toMatch(/HttpOnly; SameSite=Strict/);
    expect(set.find(c => c.startsWith('sy_rt='))).toMatch(/Path=\/auth/);
    const at = set.find(c => c.startsWith('sy_at=')).split(';')[0];
    const me = await fetch(`${dashUrl}/auth/me`, { headers: { Cookie: at } });
    expect((await me.json()).user.id).toBe('usr_1');
    expect((await fetch(`${dashUrl}/api/providers`, { headers: { Cookie: at } })).status).not.toBe(401);
  });

  it('refreshes from the refresh cookie and clears cookies on logout', async () => {
    const r = await fetch(`${dashUrl}/auth/refresh`, { method: 'POST', headers: { Cookie: 'sy_rt=rt-1' } });
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie().some(c => c.startsWith('sy_at=ey'))).toBe(true);
    expect((await fetch(`${dashUrl}/auth/refresh`, { method: 'POST', headers: { Cookie: 'sy_rt=bogus' } })).status).toBe(401);
    const out = await fetch(`${dashUrl}/auth/logout`, { method: 'POST', headers: { Cookie: 'sy_rt=rt-1' } });
    expect(out.headers.getSetCookie().every(c => c.includes('Max-Age=0'))).toBe(true);
  });
});
