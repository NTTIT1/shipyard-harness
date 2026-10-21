import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive the harness root from this file's location (dashboard/server/services/),
// not a hardcoded absolute path — keeps the engine project-agnostic. dashboard.sh
// also exports HARNESS_ROOT/LANES_ROOT/PROFILE, which take precedence.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HARNESS_ROOT = process.env.HARNESS_ROOT || path.resolve(__dirname, '../../..');
export const LANES_ROOT = process.env.LANES_ROOT || path.dirname(HARNESS_ROOT);
export const STATE_DIR = path.join(HARNESS_ROOT, 'state');
export const BIN = path.join(HARNESS_ROOT, 'bin');
// Liveness "dead" threshold: a lane that SHOULD be heartbeating (running /
// provisioning, or a watch/review poll loop) but hasn't in this many seconds is
// treated as DEAD — its driving Claude session likely died. Default 10 min.
// Override with DEAD_SEC; STALL_SEC is honoured as the legacy alias.
export const DEAD_SEC = parseInt(process.env.DEAD_SEC || process.env.STALL_SEC || '600', 10);
export const FE_BASE_PORT = parseInt(process.env.FE_BASE_PORT || '3000', 10);
export const API_BASE_PORT = parseInt(process.env.API_BASE_PORT || '8000', 10);
export const PROFILE = process.env.PROFILE || '';   // dashboard.sh exports it (resolved by _common); '' => integrations read as off
export const PROFILE_DIR = process.env.PROFILE_DIR || path.join(HARNESS_ROOT, 'profiles', PROFILE);
export const SECRETS_ENV = path.join(HARNESS_ROOT, 'config', 'secrets.env');

export function loadEnvFile(filePath) {
  const cfg = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      let k = line.slice(0, idx).trim();
      if (k.startsWith('export ')) k = k.slice(7).trim();
      let v = line.slice(idx + 1);
      // strip inline comments outside quotes, then strip quotes
      const m = v.match(/^(['"])(.*)\1/);
      if (m) {
        v = m[2];
      } else {
        const ci = v.indexOf(' #');
        if (ci >= 0) v = v.slice(0, ci);
        v = v.trim().replace(/^["']|["']$/g, '');
      }
      cfg[k] = v;
    }
  } catch {
    // file not found — return empty
  }
  return cfg;
}

const integ = loadEnvFile(path.join(PROFILE_DIR, 'integrations.env'));

function hostFromUrl(url) {
  return (url || '').replace(/^https?:\/\//, '').split('/')[0];
}

export function harnessConfig() {
  return {
    profile: PROFILE,
    repo: integ.CI_REPO || '',
    dev_site: hostFromUrl(integ.DEV_SITE_URL || ''),
    tracker_host: hostFromUrl(integ.TRACKER_URL || ''),
    platform_project_id: integ.PLATFORM_PROJECT_ID || process.env.PLATFORM_PROJECT_ID || '',
    integrations: {
      tracker: integ.TRACKER_ENABLED === '1',
      dev_qc: integ.DEV_QC_ENABLED === '1',
      ci_wait: integ.CI_WAIT_ENABLED === '1',
    },
  };
}

/**
 * Multi-project lanes: what config/lanes/lane<N>.env binds lane N to (written by lane-add.sh
 * --profile). Unbound lanes → null (they work on the install's main project).
 */
export function laneBinding(n) {
  const b = loadEnvFile(path.join(HARNESS_ROOT, 'config', 'lanes', `lane${n}.env`));
  if (!b.PROFILE) return null;
  const integ2 = loadEnvFile(path.join(HARNESS_ROOT, 'profiles', b.PROFILE, 'integrations.env'));
  return { profile: b.PROFILE, sourceRepo: b.SOURCE_REPO || '', projectId: integ2.PLATFORM_PROJECT_ID || '' };
}
