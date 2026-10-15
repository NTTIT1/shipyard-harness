import fs from 'fs';
import path from 'path';
import { LANES_ROOT } from './config.js';

// Resolve a lane-relative spec file, confined to <lane clone>/specs/: markdown, plus images under a spec dir's design/ folder
// (the dashboard links a lane's spec.md while it waits for approval).
export function specFile(n, relpath) {
  const lane = path.join(LANES_ROOT, `lane${n}`);
  let base, p;
  try { base = fs.realpathSync(path.join(lane, 'specs')); } catch { return null; }
  try { p = fs.realpathSync(path.join(lane, relpath)); } catch { return null; }
  if (!p.startsWith(base + path.sep) || !fs.statSync(p).isFile()) return null;
  if (/\.md$/i.test(p)) return p;
  // Designer mockups: images only, and only inside a spec dir's design/ folder.
  if (/\.(png|jpe?g|webp)$/i.test(p) && p.split(path.sep).includes('design')) return p;
  return null;
}

// Spec dirs in the lane clone that have a spec.md — newest first (dirs are date-prefixed).
export function listSpecs(n) {
  const dir = path.join(process.env.LANES_ROOT || LANES_ROOT, `lane${n}`, 'specs');
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'spec.md')))
      .map(e => `specs/${e.name}`)
      .sort().reverse();
  } catch { return []; }
}
