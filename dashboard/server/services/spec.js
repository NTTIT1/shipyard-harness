import fs from 'fs';
import path from 'path';
import { LANES_ROOT } from './config.js';

// Resolve a lane-relative spec file, confined to <lane clone>/specs/ and .md only
// (the dashboard links a lane's spec.md while it waits for approval).
export function specFile(n, relpath) {
  const lane = path.join(LANES_ROOT, `lane${n}`);
  let base, p;
  try { base = fs.realpathSync(path.join(lane, 'specs')); } catch { return null; }
  try { p = fs.realpathSync(path.join(lane, relpath)); } catch { return null; }
  if (p.startsWith(base + path.sep) && /\.md$/i.test(p) && fs.statSync(p).isFile()) return p;
  return null;
}
