import { spawnSync } from 'child_process';
import path from 'path';
import { createApp } from './app.js';
import { BIN } from './services/config.js';
import { configureSessions, stopAll, restoreLimitWakes } from './services/sessions.js';
import { AUTH_ENABLED, PLATFORM_URL, usingDevSecret } from './services/auth.js';
import { bindProblem, lanUrls } from './services/lan.js';

// needs_action lives in lane state so the cards/header badge it like any other ask.
configureSessions({
  setNeedsAction: (n, v) => spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'set', `needs_action=${v}`], { timeout: 15000 }),
  setNotes: (n, v) => spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'set', `notes=${v}`], { timeout: 15000 }),
  laneStatus: n => (spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'get', 'status'], { encoding: 'utf8', timeout: 15000 }).stdout || '').trim(),
});
restoreLimitWakes();

const port = parseInt(process.argv[2] || process.env.DASHBOARD_PORT || '8090', 10);
// DASHBOARD_HOST=0.0.0.0 shares it on the LAN (config/local.env); default stays loopback-only.
const host = process.env.DASHBOARD_HOST || '127.0.0.1';
const problem = bindProblem({ host, authEnabled: AUTH_ENABLED, devSecret: usingDevSecret });
if (problem) { console.error(`harness dashboard: ${problem}`); process.exit(1); }
const server = createApp().listen(port, host, () => {
  console.log(`harness dashboard: http://127.0.0.1:${port}`);
  if (host !== '127.0.0.1') for (const u of lanUrls(host, port)) console.log(`harness dashboard: LAN ${u}`);
  if (!AUTH_ENABLED) console.warn('harness dashboard: DASHBOARD_AUTH=off — login is DISABLED');
  else {
    console.log(`harness dashboard: login via Shipyard Platform at ${PLATFORM_URL}`);
    if (usingDevSecret) console.warn('harness dashboard: using the DEV default JWT_SECRET — set JWT_SECRET (same value as the platform) for real installs');
  }
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { stopAll(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
}
