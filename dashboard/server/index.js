import { spawnSync } from 'child_process';
import path from 'path';
import { createApp } from './app.js';
import { BIN } from './services/config.js';
import { configureSessions, stopAll } from './services/sessions.js';
import { AUTH_ENABLED, PLATFORM_URL, usingDevSecret } from './services/auth.js';

// needs_action lives in lane state so the cards/header badge it like any other ask.
configureSessions({
  setNeedsAction: (n, v) => spawnSync('bash', [path.join(BIN, 'state.sh'), String(n), 'set', `needs_action=${v}`], { timeout: 15000 }),
});

const port = parseInt(process.argv[2] || process.env.DASHBOARD_PORT || '8090', 10);
const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`harness dashboard: http://127.0.0.1:${port}`);
  if (!AUTH_ENABLED) console.warn('harness dashboard: DASHBOARD_AUTH=off — login is DISABLED');
  else {
    console.log(`harness dashboard: login via Shipyard Platform at ${PLATFORM_URL}`);
    if (usingDevSecret) console.warn('harness dashboard: using the DEV default JWT_SECRET — set JWT_SECRET (same value as the platform) for real installs');
  }
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { stopAll(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
}
