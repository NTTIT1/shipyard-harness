import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';

// Features waiting for a lane (run/laneN/queue.json). When the lane has finished its feature, the
// next one is given to it on its own, so a roadmap runs feature after feature without anyone
// coming back to hand each one over.

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
const qFile = n => path.join(root(), 'run', `lane${n}`, 'queue.json');
const MAX_ITEMS = 50;
const FREE = new Set(['idle', 'down', '', undefined]);

export function readQueue(n) {
  try {
    const q = JSON.parse(fs.readFileSync(qFile(n), 'utf8'));
    return { items: Array.isArray(q.items) ? q.items : [], error: q.error || '' };
  } catch { return { items: [], error: '' }; }
}

function save(n, q) {
  fs.mkdirSync(path.dirname(qFile(n)), { recursive: true });
  fs.writeFileSync(qFile(n), JSON.stringify(q, null, 2) + '\n');
  return q;
}

/** Replace lane n's queue: [{ title, requirement, models? }]. */
export function writeQueue(n, items) {
  if (!Array.isArray(items)) throw Object.assign(new Error('hàng đợi phải là một danh sách'), { status: 400 });
  if (items.length > MAX_ITEMS) throw Object.assign(new Error(`tối đa ${MAX_ITEMS} tính năng`), { status: 400 });
  const clean = items.map((x, i) => {
    const title = String(x?.title || '').trim().slice(0, 120);
    const requirement = String(x?.requirement || '').trim();
    if (!title || !requirement) throw Object.assign(new Error(`tính năng ${i + 1}: thiếu tên hoặc yêu cầu`), { status: 400 });
    if (requirement.length > 8000) throw Object.assign(new Error(`tính năng ${i + 1}: yêu cầu quá dài`), { status: 400 });
    const models = x.models && typeof x.models === 'object' ? x.models : undefined;
    return { title, requirement, ...(models ? { models } : {}) };
  });
  return save(n, { items: clean, error: '' });
}

/** Finished its feature (or never started one): the next queued feature may go. */
export function readyForNext(lane) {
  if (lane.pending_kind || lane.needs_action) return false;
  return FREE.has(lane.status) || (lane.status === 'passed' && lane.stage === 'done');
}

/**
 * One pass over every lane with a queue. A finished lane whose session is still open is closed
 * first (the next pass gives it the feature); a refused assignment stays queued with its reason.
 * d: { lanes(), isRunning(n), stopSession(n), state(n, args), assign(n, body) }
 */
export async function tickQueues(d) {
  const lanes = await d.lanes();
  for (const lane of lanes) {
    const n = lane.lane;
    const q = readQueue(n);
    if (!q.items.length || !readyForNext(lane)) continue;
    if (d.isRunning(n)) { d.stopSession(n); continue; }
    const [next, ...rest] = q.items;
    try {
      if (!FREE.has(lane.status)) d.state(n, ['set', 'status=idle']);
      await d.assign(n, { requirement: next.requirement, ...(next.models ? { models: next.models } : {}) });
      save(n, { items: rest, error: '' });
    } catch (e) {
      save(n, { items: q.items, error: `Chưa giao được "${next.title}": ${e.message}` });
    }
  }
}

export function startQueueTicker(d, ms = 30_000) {
  let running = false;
  const t = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tickQueues(d); } catch { /* next pass */ } finally { running = false; }
  }, ms);
  t.unref?.();
  return () => clearInterval(t);
}
