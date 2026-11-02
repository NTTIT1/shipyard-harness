import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';
import { readyForNext } from './lanequeue.js';
import * as projectDocs from './projectdocs.js';

// A project's feature queue (run/projects/<pid>/queue.json). Features approved in the project chat (and
// the first roadmap) wait here; the first free lane of THAT project takes the next one: it gets the project
// documents in docs/ and the approved feature spec in specs/<date>-<slug>/, so its PM/BA/DESIGN steps —
// already approved in the chat — are skipped. `assigned` remembers which lane builds what until it is done.

const root = () => path.join(process.env.HARNESS_ROOT || HARNESS_ROOT, 'run', 'projects');
const PID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_ITEMS = 50;
const SKIP_APPROVED = { PM: 'SKIP', BA: 'SKIP', DESIGN: 'SKIP' };
const bad = msg => Object.assign(new Error(msg), { status: 400 });
const qFile = pid => {
  if (!PID_RE.test(String(pid))) throw bad('mã dự án không hợp lệ');
  return path.join(root(), pid, 'queue.json');
};
const titleLine = title => `Tính năng "${title}"`;

export function readProjectQueue(pid) {
  try {
    const q = JSON.parse(fs.readFileSync(qFile(pid), 'utf8'));
    return { items: Array.isArray(q.items) ? q.items : [], assigned: Array.isArray(q.assigned) ? q.assigned : [], error: q.error || '' };
  } catch { return { items: [], assigned: [], error: '' }; }
}

function save(pid, q) {
  fs.mkdirSync(path.dirname(qFile(pid)), { recursive: true });
  fs.writeFileSync(qFile(pid), JSON.stringify(q, null, 2) + '\n');
  return q;
}

function clean(x, i) {
  const slug = String(x?.slug || '').trim();
  const title = String(x?.title || '').trim().slice(0, 120);
  if (!SLUG_RE.test(slug) || !title || (!x.spec && !x.requirement)) throw bad(`tính năng ${i + 1}: thiếu tên, slug hoặc yêu cầu`);
  const out = { slug, title };
  for (const k of ['sessionId', 'spec', 'designDir', 'requirement']) if (x[k]) out[k] = String(x[k]);
  if ((out.spec || '').length > 200_000 || (out.requirement || '').length > 8000) throw bad(`tính năng ${i + 1}: yêu cầu quá dài`);
  if (x.models && typeof x.models === 'object') out.models = x.models;
  return out;
}

/** Add one feature at the end of the project's queue. */
export function enqueue(pid, item) {
  const q = readProjectQueue(pid);
  if (q.items.length >= MAX_ITEMS) throw bad(`tối đa ${MAX_ITEMS} tính năng chờ`);
  q.items.push(clean(item, q.items.length));
  return save(pid, q);
}

/**
 * The person reorders or removes queued features, as one operation on what is there now (the screen may
 * be seconds old): { order: [slug…] } puts those first in that order — anything queued since stays after
 * them; { remove: slug } takes one out and marks it dropped in the project documents.
 */
export function writeProjectQueue(pid, op, docs = projectDocs) {
  if (!op || typeof op !== 'object' || Array.isArray(op) || (!Array.isArray(op.order) && typeof op.remove !== 'string')) {
    throw bad('thao tác hàng chờ không hợp lệ (order hoặc remove)');
  }
  const q = readProjectQueue(pid);
  if (typeof op.remove === 'string') {
    if (!q.items.some(x => x.slug === op.remove)) throw Object.assign(new Error('tính năng không còn trong hàng chờ'), { status: 409 });
    q.items = q.items.filter(x => x.slug !== op.remove);
    docs.setFeatureStatus(pid, op.remove, 'dropped');
  } else {
    const rank = new Map(op.order.map((slug, i) => [String(slug), i]));
    q.items = [...q.items].sort((a, b) => (rank.has(a.slug) ? rank.get(a.slug) : Infinity) - (rank.has(b.slug) ? rank.get(b.slug) : Infinity));
  }
  return save(pid, { ...q, error: '' });
}

/** Projects that have a queue file. */
export function queuedProjects() {
  try { return fs.readdirSync(root()).filter(p => PID_RE.test(p) && fs.existsSync(path.join(root(), p, 'queue.json'))); }
  catch { return []; }
}

const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

/** Ready the lane for one feature: the project documents (git-ignored copy) and, for an approved feature, its spec dir. */
function handOff(pid, item, dir, profile, docs) {
  if (docs.syncToLane(pid, dir)) docs.pointProfile(profile);
  if (!item.spec) return { requirement: item.requirement, ...(item.models ? { models: item.models } : {}) };
  const specDir = `specs/${new Date().toISOString().slice(0, 10)}-${item.slug}`;
  const at = path.join(dir, specDir);
  fs.mkdirSync(at, { recursive: true });
  // What the chat approved: the feature brief (spec.md), the architect's change design, the UI design.
  const work = item.designDir || '';
  const arch = work ? read(path.join(work, 'architecture.md')) : '';
  const design = work ? read(path.join(work, 'design.md')) : '';
  const links = [arch && '- Thiết kế thay đổi (kiến trúc sư, đã duyệt): `feature-architecture.md` — Plan phải theo đúng.',
    design && '- Thiết kế giao diện (đã duyệt): `design/design.md`, màn hình mẫu trong `design/src/`.'].filter(Boolean);
  fs.writeFileSync(path.join(at, 'spec.md'), links.length
    ? `${item.spec.replace(/\s*$/, '')}\n\n## Tài liệu đã duyệt trong chat dự án\n${links.join('\n')}\n` : item.spec);
  if (arch) fs.writeFileSync(path.join(at, 'feature-architecture.md'), arch);
  if (design) { fs.mkdirSync(path.join(at, 'design'), { recursive: true }); fs.writeFileSync(path.join(at, 'design', 'design.md'), design); }
  const mock = work ? path.join(work, 'mockups') : '';
  if (mock && fs.existsSync(mock)) fs.cpSync(mock, path.join(at, 'design', 'src'), { recursive: true });
  return { requirement: titleLine(item.title), spec_dir: specDir, gates: SKIP_APPROVED, ...(item.models ? { models: item.models } : {}) };
}

/** Change the queue as it is NOW on disk (others may have queued or removed something meanwhile). */
function update(pid, fn) {
  const q = readProjectQueue(pid);
  fn(q);
  return save(pid, q);
}

/**
 * One pass over every project with a queue.
 * d: { projects(), lanes(), isRunning(n), stopSession(n), state(n,args), assign(n,body), laneDir(n), profileDir(n), laneQueue(n), docs }
 */
export async function tickProjectQueues(d) {
  const lanes = await d.lanes();
  for (const pid of d.projects()) {
    const mine = lanes.filter(l => l.run_project_id === pid && l.bound_profile);
    // Built: the lane reached done after it was handed the feature (ship-feature renames the lane's title,
    // so the title is no guide; a lane takes nothing new before it is done, so the next done is this one).
    const built = readProjectQueue(pid).assigned.filter(a => {
      const l = mine.find(x => x.lane === a.lane);
      return l && l.status === 'passed' && l.stage === 'done' && Date.parse(l.stage_since || '') > Date.parse(a.at);
    });
    if (built.length) {
      for (const a of built) d.docs.setFeatureStatus(pid, a.slug, 'done');
      update(pid, q => { q.assigned = q.assigned.filter(a => !built.some(b => b.slug === a.slug && b.lane === a.lane)); });
    }
    // Every free lane of the project reads the current documents, whoever gives it its next feature.
    for (const l of mine) {
      if (readyForNext(l) && !d.isRunning(l.lane) && d.docs.syncToLane(pid, d.laneDir(l.lane))) d.docs.pointProfile(d.profileDir?.(l.lane));
    }
    for (const l of mine) {
      const next = readProjectQueue(pid).items[0];
      if (!next) break;
      if (!readyForNext(l) || (d.laneQueue(l.lane).items || []).length) continue;
      // Only a lane that finished its feature has its old session closed; a session open on an idle lane is
      // someone working there (an interactive session, /spec-new…): leave it alone.
      if (d.isRunning(l.lane)) { if (l.status === 'passed' && l.stage === 'done') d.stopSession(l.lane); continue; }
      try {
        if (l.status !== 'idle' && l.status !== 'down' && l.status) d.state(l.lane, ['set', 'status=idle']);
        await d.assign(l.lane, handOff(pid, next, d.laneDir(l.lane), d.profileDir?.(l.lane), d.docs));
        update(pid, q => {
          q.items = q.items.filter(x => x.slug !== next.slug);
          q.assigned.push({ slug: next.slug, title: next.title, lane: l.lane, at: new Date().toISOString() });
          q.error = '';
        });
      } catch (e) {
        update(pid, q => { q.error = `Chưa giao được "${next.title}": ${e.message}`; });
        break;
      }
    }
  }
}

export function startProjectQueueTicker(d, ms = 30_000) {
  let running = false;
  const t = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tickProjectQueues(d); } catch { /* next pass */ } finally { running = false; }
  }, ms);
  t.unref?.();
  return () => clearInterval(t);
}
