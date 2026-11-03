import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';

// A project's master documents (run/projects/<pid>/docs/): what its chat approved — the product brief,
// the architecture (with the feature roadmap), the design and its mockups, and one folder per feature
// added later (features/<slug>/). New features are designed on these; a lane taking a feature gets a
// copy in its docs/, the paths every lane step reads (bin/project_docs.py).

const root = () => path.join(process.env.HARNESS_ROOT || HARNESS_ROOT, 'run', 'projects');
const PID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LABEL = { approved: '(Đã duyệt — chưa làm)', done: '(Đã có)', dropped: '(Đã bỏ)' };
const ROADMAP = '## Lộ trình tính năng';
const bad = msg => Object.assign(new Error(msg), { status: 400 });

export function docsDir(pid) {
  if (!PID_RE.test(String(pid))) throw bad('mã dự án không hợp lệ');
  return path.join(root(), pid, 'docs');
}
const featuresFile = pid => path.join(path.dirname(docsDir(pid)), 'features.json');
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const readFeatures = pid => { try { return JSON.parse(read(featuresFile(pid))) || []; } catch { return []; } };
const mockupsIn = dir => {
  try { return fs.readdirSync(dir).filter(f => /\.html?$/i.test(f)).sort().map(name => ({ name, html: read(path.join(dir, name)) })); }
  catch { return []; }
};
function writeSet(dir, { brief = '', architecture = '', design = '', mockups = [] }) {
  write(path.join(dir, 'product-brief.md'), brief || '');
  write(path.join(dir, 'architecture.md'), architecture || '');
  if (design) write(path.join(dir, 'design.md'), design);
  for (const m of mockups || []) write(path.join(dir, 'mockups', path.basename(m.name)), m.html || '');
}

export const hasDocs = pid => fs.existsSync(path.join(docsDir(pid), 'product-brief.md'));

/** First documents of the project; never overwrites what is there. */
export function seedDocs(pid, docs) {
  if (hasDocs(pid)) return;
  writeSet(docsDir(pid), docs);
}

const metaFile = pid => path.join(path.dirname(docsDir(pid)), 'meta.json');
/** What kind of app the project is ({ appKind: 'web' | 'mobile' }): screens are shown at its size. */
export function setMeta(pid, { appKind }) {
  if (!['web', 'mobile'].includes(appKind)) throw bad(`loại app không hợp lệ: ${appKind}`);
  write(metaFile(pid), JSON.stringify({ appKind }, null, 2));
}

export function readDocs(pid) {
  const dir = docsDir(pid);
  return { brief: read(path.join(dir, 'product-brief.md')), architecture: read(path.join(dir, 'architecture.md')),
    design: read(path.join(dir, 'design.md')), mockups: mockupsIn(path.join(dir, 'mockups')), features: readFeatures(pid),
    appKind: (() => { try { return JSON.parse(read(metaFile(pid))).appKind || 'web'; } catch { return 'web'; } })() };
}

/** Add one item to the architecture's roadmap section (created when missing), numbered after the last. */
function appendRoadmap(arch, line) {
  const lines = String(arch || '').split('\n');
  let start = lines.findIndex(l => l.startsWith(ROADMAP));
  if (start < 0) return `${String(arch || '').replace(/\s*$/, '')}\n\n${ROADMAP}\n1. ${line}\n`;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const items = lines.slice(start + 1, end).filter(l => /^\s*(?:\d+[.)]|[-*])\s+/.test(l));
  let at = end;
  while (at > start + 1 && !lines[at - 1].trim()) at--;
  lines.splice(at, 0, `${items.length + 1}. ${line}`);
  return lines.join('\n');
}

/** A feature approved in the chat: its own documents, and a line in the roadmap marked approved-not-built. */
export function addFeature(pid, { slug, title, brief, architecture, design, mockups }) {
  if (!SLUG_RE.test(String(slug))) throw bad('slug tính năng không hợp lệ');
  const dir = docsDir(pid);
  writeSet(path.join(dir, 'features', slug), { brief, architecture, design, mockups });
  const arch = path.join(dir, 'architecture.md');
  write(arch, appendRoadmap(read(arch), `**${title}** — ${LABEL.approved} xem features/${slug}/`));
  write(featuresFile(pid), JSON.stringify([...readFeatures(pid).filter(f => f.slug !== slug), { slug, title, status: 'approved' }], null, 2));
}

/**
 * A feature is built, dropped… Features added in the chat are tracked in features.json; a feature of the
 * first roadmap is known by its title only: its roadmap line gets the label (replaced, or added at the end).
 */
export function setFeatureStatus(pid, slug, status, title = '') {
  if (!LABEL[status]) throw bad(`trạng thái không hợp lệ: ${status}`);
  const list = readFeatures(pid);
  const f = list.find(x => x.slug === slug);
  if (f) {
    f.status = status;
    write(featuresFile(pid), JSON.stringify(list, null, 2));
  }
  const name = f?.title || title;
  if (!name) return;
  const arch = path.join(docsDir(pid), 'architecture.md');
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = read(arch).split('\n');
  const k = lines.findIndex(l => new RegExp(`^\\s*(?:\\d+[.)]|[-*])\\s+\\*\\*${esc}\\*\\*`).test(l));
  if (k < 0) return;
  const had = /\((?:Đã duyệt — chưa làm|Đã có|Đã bỏ)\)/;
  lines[k] = had.test(lines[k]) ? lines[k].replace(had, LABEL[status]) : `${lines[k].replace(/\s+$/, '')} ${LABEL[status]}`;
  write(arch, lines.join('\n'));
}

// Where a lane keeps its copy of the master documents: untracked and git-ignored (.git/info/exclude),
// so a branch cut never trips over them and no PR carries them. The lane profile's project-docs.json
// points every lane step there (bin/project_docs.py).
export const LANE_DOCS = '.shipyard-docs';
export const LANE_LOCATIONS = { brief: `${LANE_DOCS}/product-brief.md`, architecture: `${LANE_DOCS}/architecture.md`,
  design: `${LANE_DOCS}/design/design.md`, mockups: `${LANE_DOCS}/design/mockups` };

/** Copy the master documents into a lane checkout; false when the project has none yet. */
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

export function syncToLane(pid, laneDir) {
  const src = docsDir(pid);
  if (!hasDocs(pid)) return false;
  const dst = path.join(laneDir, LANE_DOCS);
  // Unchanged since the last copy: nothing to do (this runs for every free lane on each queue pass).
  const stamp = String(Math.max(...[...walk(src)].map(f => fs.statSync(f).mtimeMs), fs.statSync(featuresFile(pid), { throwIfNoEntry: false })?.mtimeMs || 0));
  if (read(path.join(dst, '.stamp')) === stamp) return true;
  fs.rmSync(dst, { recursive: true, force: true });
  write(path.join(dst, 'product-brief.md'), read(path.join(src, 'product-brief.md')));
  write(path.join(dst, 'architecture.md'), read(path.join(src, 'architecture.md')));
  if (fs.existsSync(path.join(src, 'design.md'))) write(path.join(dst, 'design', 'design.md'), read(path.join(src, 'design.md')));
  for (const m of mockupsIn(path.join(src, 'mockups'))) write(path.join(dst, 'design', 'mockups', m.name), m.html);
  if (fs.existsSync(path.join(src, 'features'))) fs.cpSync(path.join(src, 'features'), path.join(dst, 'features'), { recursive: true });
  write(path.join(dst, '.stamp'), stamp);
  const exclude = path.join(laneDir, '.git', 'info', 'exclude');
  if (fs.existsSync(path.join(laneDir, '.git')) && !read(exclude).split('\n').includes(`/${LANE_DOCS}/`)) {
    const cur = read(exclude);
    write(exclude, `${cur && !cur.endsWith('\n') ? `${cur}\n` : cur}/${LANE_DOCS}/\n`);
  }
  return true;
}

/** Point a lane profile's documents at the lane copy; the person's own documents ("other") stay. */
export function pointProfile(profileDir) {
  if (!profileDir) return;
  const f = path.join(profileDir, 'project-docs.json');
  let cur = {};
  try { cur = JSON.parse(read(f)) || {}; } catch { cur = {}; }
  write(f, `${JSON.stringify({ ...cur, ...LANE_LOCATIONS, other: Array.isArray(cur.other) ? cur.other : [] }, null, 2)}\n`);
}

/** A project made before the chat existed: start from the documents already in its repo (if any). */
export function seedFromRepo(pid, repoDir) {
  if (!repoDir || hasDocs(pid)) return;
  const d = path.join(repoDir, 'docs');
  const brief = read(path.join(d, 'product-brief.md'));
  const architecture = read(path.join(d, 'architecture.md'));
  if (!brief && !architecture) return;
  seedDocs(pid, { brief: brief || '# Yêu cầu sản phẩm\n', architecture, design: read(path.join(d, 'design', 'design.md')),
    mockups: mockupsIn(path.join(d, 'design', 'mockups')) });
}

/**
 * Every feature of the project: the roadmap in the architecture (the first MVP list and every feature added
 * in the chat since), each with where it stands — built, a lane building it, waiting in the queue (its
 * place), not scheduled yet, or dropped.
 */
export function featureList(architecture, queue = { items: [], assigned: [] }) {
  const m = String(architecture || '').match(/^##\s+Lộ trình tính năng[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (!m) return [];
  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return m[1].split('\n').map(l => l.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/)?.[1]?.trim()).filter(Boolean).map(t => {
    const title = (t.match(/^\*\*(.+?)\*\*/)?.[1] || t.split(/\s+[—–-]\s+/)[0]).replace(/\*\*/g, '').trim();
    const text = t.replace(/^\*\*.+?\*\*/, '').replace(title, '').replace(/^\s*[—–-]\s*/, '')
      .replace(/\((Đã có|Đã bỏ|Đã duyệt — chưa làm)\)/g, '').replace(/xem features\/\S*/g, '').replace(/\s+/g, ' ').trim();
    const f = { title, text };
    if (/\(Đã có\)/.test(t)) return { ...f, status: 'done' };
    if (/\(Đã bỏ\)/.test(t)) return { ...f, status: 'dropped' };
    const a = (queue.assigned || []).find(x => same(x.title, title));
    if (a) return { ...f, status: 'building', lane: a.lane };
    const k = (queue.items || []).findIndex(x => same(x.title, title));
    if (k >= 0) return { ...f, status: 'waiting', position: k + 1 };
    return { ...f, status: 'planned' };
  });
}
