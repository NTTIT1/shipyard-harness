import { spawnSync, spawn } from 'child_process';
import path from 'path';
import { BIN } from './config.js';

export const GATEWAY_URL = `http://127.0.0.1:${process.env.GATEWAY_PORT || '4000'}`;

export async function gatewayStatus() {
  try {
    const r = await fetch(`${GATEWAY_URL}/health/liveliness`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

function run(action) {
  const r = spawnSync('bash', [path.join(BIN, 'gateway.sh'), action], { encoding: 'utf8', timeout: 150000 });
  return { ok: r.status === 0, output: ((r.stdout || '') + (r.stderr || '')).trim() };
}

export async function ensureGateway() {
  if (await gatewayStatus()) return { ok: true, output: 'already up' };
  return run('start');
}

export function restartGateway() { return run('restart'); }

// Non-blocking: a running gateway is stale after keys/models change.
export function restartGatewayInBackground() {
  spawn('bash', [path.join(BIN, 'gateway.sh'), 'restart'], { detached: true, stdio: 'ignore' }).unref();
}
