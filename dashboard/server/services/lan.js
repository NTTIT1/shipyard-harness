import fs from 'fs';
import os from 'os';

// Sharing the dashboard on the LAN. Only the dashboard listens beyond loopback; the
// platform stays on 127.0.0.1 behind it (BFF), so the JWT secret must not be the public default.
export const DEV_SECRET = 'shipyard-super-secret-key-that-is-at-least-256-bits-long-for-hmac-sha256';

function readFile(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

/** env JWT_SECRET → secrets.env → per-machine file written by bin/platform.sh → dev default. */
export function resolveJwtSecret({ env, secrets, file }) {
  return env || secrets || (file && readFile(file)) || DEV_SECRET;
}

export function isLoopback(host) {
  return host === 'localhost' || host === '::1' || /^127\./.test(host || '');
}

/** '' when it is safe to listen on `host`, else the reason (Vietnamese, shown in the log). */
export function bindProblem({ host, authEnabled, devSecret }) {
  if (isLoopback(host)) return '';
  if (!authEnabled) return `không mở dashboard ra mạng (${host}) khi DASHBOARD_AUTH=off — ai trong mạng cũng điều khiển được lane`;
  if (devSecret) return `không mở dashboard ra mạng (${host}) khi JWT_SECRET là giá trị mặc định công khai — chạy bin/platform.sh start (tự sinh secret riêng) hoặc đặt JWT_SECRET`;
  return '';
}

/** URLs other machines can open. Docker/VPN bridges are skipped for a wildcard bind. */
export function lanUrls(host, port, ifaces = os.networkInterfaces()) {
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host}:${port}`];
  const out = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/^(docker|br-|veth|virbr|CloudflareWARP|tun|wg)/.test(name)) continue;
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}
