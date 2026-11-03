#!/usr/bin/env node
// Called by bin/run-step.sh before a headless step: may lane N run <step> on <model> under its quota?
//   quota-check.js <N> <model> <step>  -> exit 0 (go on; a warning may be printed on stderr)
//                                         exit 1 + the reason on stdout (the lane is now held for an admin)
import { laneQuota, holdLane } from '../services/quotaguard.js';
import { readHold, describeCheck } from '../services/quota.js';

const [n, model, step] = [Number(process.argv[2]), process.argv[3] || '', process.argv[4] || ''];
if (!(n > 0) || !model) { console.error('usage: quota-check.js <N> <model> <step>'); process.exit(64); }
try {
  const held = readHold(n);
  if (held) { console.log(`hết hạn mức — ${held.checks.map(describeCheck).join('; ')}`); process.exit(1); }
  const q = laneQuota(n, { model, step });
  const blocks = q.blocking.filter(c => c.scope !== 'plan');
  if (blocks.length) {
    holdLane(n, blocks, { source: 'step' });
    console.log(`hết hạn mức — ${blocks.map(describeCheck).join('; ')}`);
    process.exit(1);
  }
  for (const c of q.warning) console.error(`harness: quota: sắp chạm ${describeCheck(c)}`);
} catch (e) {
  // The guard never blocks work by failing itself.
  console.error(`harness: quota-check: ${e.message}`);
}
process.exit(0);
