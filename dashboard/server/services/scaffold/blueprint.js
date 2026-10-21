import fs from 'fs';
import os from 'os';
import path from 'path';
import { HARNESS_ROOT } from '../config.js';
import { run as runCmd, readText } from './util.js';
import { orchClient, parseVerdict, resultLine } from './setup.js';

// Architecture first (new-project wizard): the project is registered, a BLUEPRINT run asks the
// project architect for architecture.md, a TECH_LEAD/OWNER approves it in "Chờ duyệt", and only then
// is the skeleton generated — with the approved architecture committed as docs/architecture.md.
// State is persisted, so an approval that arrives after a dashboard restart still builds the project.

const STATE_FILE = () => path.join(HARNESS_ROOT, 'run', 'scaffold', 'blueprints.json');
const WORK_ROOT = () => path.join(HARNESS_ROOT, 'run', 'scaffold', 'blueprints');
const DOC = 'architecture.md';
const MAX_DOC = 200_000;

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
  fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 2));
}

const AGENT_PROMPT = () => readText(path.join(HARNESS_ROOT, 'claude', 'agents', 'project-architect-agent.md')).replace(/^---[\s\S]*?---\n/, '');

/** request.md for the architect: what the creator chose in the wizard plus their requirements. */
export function requestDoc(entry) {
  return [
    `# Dự án: ${entry.name} (${entry.slug})`,
    '',
    '## Công nghệ đã chọn (cố định)',
    ...entry.stackLines.map(l => `- ${l}`),
    '',
    '## Yêu cầu của người tạo dự án',
    '',
    entry.requirements,
    '',
  ].join('\n');
}

export function architectPrompt(entry, next) {
  const lines = [
    `Dự án mới: ${entry.name} (${entry.slug}). Chưa có code — đọc request.md trong thư mục làm việc.`,
    `Chế độ: ${next.mode}, lần nộp ${next.revision}.`,
    'Soạn architecture.md theo chỉ dẫn vai trò Project Architect.',
  ];
  if (next.mode === 'REVISE') {
    if (next.feedback) lines.push('', 'Góp ý của người duyệt (phải xử lý hết):', next.feedback);
    if (next.editedDocuments?.[DOC]) lines.push('', 'Người duyệt đã sửa trực tiếp architecture.md (đã ghi vào thư mục làm việc — giữ làm bản gốc).');
  }
  return lines.join('\n');
}

export function readArchitecture(dir) {
  const text = readText(path.join(dir, DOC));
  if (!text.trim()) throw new Error('Kiến trúc sư AI không tạo architecture.md');
  if (text.length > MAX_DOC) throw new Error(`architecture.md quá dài (>${MAX_DOC / 1000}KB)`);
  return text;
}

let shared = null;
/** The dashboard's single runner (wizard jobs + the approval proxy share it). */
export function defaultBlueprintRunner(opts) { return (shared ||= createBlueprintRunner(opts)); }

/**
 * `build(entry, architecture)` scaffolds the approved project (wired by the scaffold router to the
 * job runner) and resolves once it is done; it throws to report a failed build.
 */
export function createBlueprintRunner({ orch = orchClient(), run = runCmd, host = os.hostname(),
  claudeBin = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude'), model = 'claude-opus-5-5',
  load = readState, save = writeState, agentPrompt = AGENT_PROMPT, workRoot = WORK_ROOT } = {}) {
  const busy = new Set();
  let build = null;
  const update = (runId, patch) => { const s = load(); s[runId] = { ...s[runId], ...patch, updatedAt: new Date().toISOString() }; save(s); return s[runId]; };

  async function draft(runId, entry, next) {
    const dir = entry.workDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'request.md'), requestDoc(entry));
    if (entry.brief) fs.writeFileSync(path.join(dir, 'brief.md'), entry.brief);
    if (next.mode === 'REVISE' && next.editedDocuments?.[DOC]) fs.writeFileSync(path.join(dir, DOC), next.editedDocuments[DOC]);
    update(runId, { status: 'drafting', error: null });
    let out = '';
    await run(claudeBin, ['-p', '--output-format', 'json', '--model', model, '--effort', 'high',
      '--permission-mode', 'acceptEdits', '--disallowedTools', 'Bash,WebFetch,WebSearch',
      '--append-system-prompt', agentPrompt(), architectPrompt(entry, next)],
    { cwd: dir, timeoutMs: 30 * 60_000, log: l => { out += `${l}\n`; } });
    const v = parseVerdict(resultLine(out));
    if (!v.ok) throw new Error(v.error.replace('AI Manager', 'Kiến trúc sư AI'));
    await orch.submit(runId, { summary: v.summary.slice(0, 4000), documents: { [DOC]: readArchitecture(dir) },
      images: [], meta: {}, contextUsed: [] }, 'BLUEPRINT');
    update(runId, { status: 'awaiting-review', revision: next.revision });
  }

  async function scaffold(runId, entry, next) {
    const architecture = next.priorApproved?.BLUEPRINT?.[DOC];
    if (!architecture) throw new Error('không tìm thấy bản kiến trúc đã duyệt');
    if (!build) throw new Error('dashboard chưa sẵn sàng dựng dự án — thử lại sau');
    update(runId, { status: 'building', error: null });
    const result = await build({ ...entry, runId }, architecture);
    if (result?.jobId) update(runId, { jobId: result.jobId });
    await orch.release(runId, 'Kiến trúc đã duyệt; khung dự án đã được tạo');
    update(runId, { status: 'done' });
  }

  /** Do whatever the run needs now (draft, redraft, scaffold); safe to call any time. */
  async function work(runId) {
    const entry = load()[runId];
    if (!entry || busy.has(runId)) return entry || null;
    busy.add(runId);
    try {
      const next = await orch.next(runId);
      if (next.mode === 'WORK' || next.mode === 'REVISE') await draft(runId, entry, next);
      else if (next.mode === 'RELEASE') await scaffold(runId, entry, next);
      else if (next.mode === 'DONE') update(runId, { status: 'done' });
      else if (next.mode === 'CANCELLED') update(runId, { status: 'cancelled' });
    } catch (e) {
      update(runId, { status: 'error', error: e.message });
    } finally {
      busy.delete(runId);
    }
    return load()[runId];
  }

  return {
    setBuilder(fn) { build = fn; },
    owns: laneRef => typeof laneRef === 'string' && laneRef.startsWith(`${host}:blueprint:`),
    /** `snapshot` is everything the job runner needs to scaffold later (spec, user, dir, project, remote). */
    async start({ projectId, slug, name, stackLines, requirements, brief = '', createdBy, snapshot }) {
      const r = await orch.createRun({ projectId, laneRef: `${host}:blueprint:${slug}`, title: `Kiến trúc dự án — ${name}`,
        description: 'Kiến trúc sư AI soạn kiến trúc; duyệt xong Shipyard mới tạo khung dự án', createdBy, kind: 'BLUEPRINT' });
      update(r.id, { projectId, slug, name, stackLines, requirements, brief, createdBy, snapshot,
        workDir: path.join(workRoot(), slug), status: 'queued', createdAt: new Date().toISOString() });
      work(r.id);
      return r.id;
    },
    work,
    get: runId => load()[runId] || null,
    forProject: projectId => Object.entries(load()).filter(([, e]) => e.projectId === projectId)
      .map(([runId, e]) => ({ runId, status: e.status, error: e.error || null, jobId: e.jobId || null, updatedAt: e.updatedAt }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    isBusy: runId => busy.has(runId),
  };
}
