// Product studio API (chat from an idea to a created project) + small pure helpers.
import { authFetch } from './api.js';
import { tr } from './i18n.js';

async function call(method, url, body) {
  const r = await authFetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

export const studio = {
  list: () => call('GET', '/api/studio'),
  // body: { kind: 'idea'|'template'|'git', text, template?, source?, docs? } (a string is an idea).
  start: body => call('POST', '/api/studio', typeof body === 'string' ? { text: body } : body),
  get: id => call('GET', `/api/studio/${id}`),
  send: (id, text) => call('POST', `/api/studio/${id}/messages`, { text }),
  approve: (id, stage) => call('POST', `/api/studio/${id}/approve`, { stage }),
  skipUi: id => call('POST', `/api/studio/${id}/skip-ui`),
  reopen: (id, stage) => call('POST', `/api/studio/${id}/reopen`, { stage }),
  setWorkflow: (id, workflow) => call('PUT', `/api/studio/${id}/workflow`, { workflow }),
  backToCreate: id => call('POST', `/api/studio/${id}/back-to-create`),
  create: (id, body) => call('POST', `/api/studio/${id}/create`, body),
  remove: id => call('DELETE', `/api/studio/${id}`),
};

// A project's chat: the thread that created it, its feature threads and its queue (members read, admins write).
export const projectChat = {
  get: pid => call('GET', `/api/projects/${pid}/chat`),
  thread: (pid, id) => call('GET', `/api/projects/${pid}/chat/${id}`),
  addFeature: (pid, text) => call('POST', `/api/projects/${pid}/chat/features`, { text }),
  queue: pid => call('GET', `/api/projects/${pid}/queue`),
  docs: pid => call('GET', `/api/projects/${pid}/docs`),
  features: pid => call('GET', `/api/projects/${pid}/features`).then(r => r.list || []),
  // op: { order: [slug…] } or { remove: slug } — applied to the queue as it is on the server now.
  saveQueue: (pid, op) => call('PUT', `/api/projects/${pid}/queue`, op),
};

/** What "Tạo dự án" sends for each way to start: an idea, a template (stack) or an existing git repo. */
export function startBody(kind, f) {
  const text = String(f.text || '').trim();
  if (kind === 'template') {
    const t = f.template || {};
    return { kind, text, template: { kind: t.kind === 'fullstack' ? 'fullstack' : 'single', stack: t.stack, options: t.options || {},
      ...(t.kind === 'fullstack' ? { frontend: { stack: t.frontend?.stack, options: t.frontend?.options || {} } } : {}) } };
  }
  if (kind !== 'git') return { kind: 'idea', text };
  const branch = String(f.branch || '').trim();
  return {
    kind, text,
    source: { provider: f.source?.provider || 'url', url: String(f.source?.url || '').trim(), ...(branch ? { branch } : {}) },
    docs: { files: f.files || [], paths: String(f.paths || '').split('\n').map(x => x.trim()).filter(Boolean) },
    import: { name: String(f.name || '').trim(), slug: String(f.slug || '').trim(), branch },
  };
}

export function startProblem(kind, f) {
  if (String(f.text || '').trim().length < 5) return tr('Mô tả thêm vài chữ');
  if (kind === 'template' && !f.template?.stack) return tr('Chọn backend (ngôn ngữ và framework)');
  if (kind === 'template' && f.template.kind === 'fullstack' && !f.template.frontend?.stack) return tr('Chọn frontend');
  if (kind === 'git') {
    if (!String(f.source?.url || '').trim()) return tr('Nhập URL repo hoặc thư mục');
    if (!String(f.name || '').trim() || !String(f.slug || '').trim()) return tr('Nhập tên và slug dự án');
    if (!String(f.branch || '').trim()) return tr('Bấm "Đọc nhánh" rồi chọn nhánh tích hợp');
  }
  return '';
}

const STATUS_LABEL = { pm: 'PM', system: 'Kiến trúc sư', ui: 'Thiết kế', waiting: 'Chờ lane', done: 'Đã có', dropped: 'Đã bỏ' };
/** Where a feature thread is: a role still talking, waiting for a lane, built by lane N, built, dropped. */
export function threadStatus(t) {
  if (t.status === 'building') return tr('Lane {0} đang làm', [t.lane]);
  return tr(STATUS_LABEL[t.status] || t.status);
}

/** Move item i one place up (-1) or down (+1); out-of-range moves change nothing. */
export function moveItem(items, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= items.length) return items.slice();
  const out = items.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Where a feature of the project documents stands. */
export const FEATURE_STATUS_LABEL = { approved: 'Đã duyệt — chưa làm', done: 'Đã có', dropped: 'Đã bỏ' };
/** Where a roadmap feature stands, as the project documents show it. */
export function featureState(f) {
  if (f.status === 'building') return tr('Lane {0} đang làm', [f.lane]);
  if (f.status === 'waiting') return tr('Chờ lane · thứ {0}', [f.position]);
  return tr({ done: 'Đã có', dropped: 'Đã bỏ', planned: 'Chưa xếp lịch' }[f.status] || f.status);
}

/** A creation chat not yet tied to a project (shown under "Tiếp tục bản nháp"). */
export const isDraft = s => !s.projectId;

export const APPROVE_LABEL = { pm: tr('Duyệt yêu cầu'), system: tr('Duyệt thiết kế hệ thống'), ui: tr('Duyệt giao diện') };
export const EXAMPLES = [
  tr('Tôi cần hệ thống bán hàng cho 5 cửa hàng, khoảng 1000 người dùng'),
  tr('Ứng dụng đặt lịch khám cho phòng khám nha khoa'),
  tr('Công cụ nội bộ quản lý đơn nghỉ phép cho công ty 200 người'),
];

/** Who wrote a chat message, for its label. */
export function speaker(msg, stages) {
  if (msg.role === 'user') return tr('Bạn');
  if (msg.role === 'shipyard') return 'Shipyard';
  return tr(stages.find(s => s.id === msg.stage)?.role || 'AI');
}

/** The platform id of the project a session created, once it is registered (null before). */
export const projectIdOf = s => s?.project?.projectId || s?.job?.project?.id || null;

/** Should the view keep polling? (an AI is answering, or the project is being generated) */
export const isLive = s => !!s && (s.busy || s.job?.status === 'running');

/** The requirement a roadmap feature is assigned to a lane with (the lane's PM/Plan start from it). */
// How a lane takes a roadmap feature: build it, or (the app already exists) document what is there.
export const FEATURE_MODES = [
  { id: 'full', label: tr('Làm đầy đủ — tài liệu, code, kiểm tra') },
  { id: 'docs', label: tr('App đã có — chỉ tài liệu + QC chụp ảnh, không sửa code') },
];
const DOCS_ONLY = 'CHẾ ĐỘ APP ĐÃ CÓ: repo đã có app chạy được cho tính năng này. Đi ĐỦ quy trình role của dự án '
  + '(orch.sh next/submit), mỗi tài liệu nộp để người duyệt xem trên dashboard: PM viết spec.md, ARCH viết plan.md + '
  + 'tasks.md — mô tả đúng những gì code đang có (đọc code), tasks đánh dấu "đã có sẵn". DEV: KHÔNG sửa code, chỉ '
  + 'xác nhận code khớp tài liệu. TEST + QC trình duyệt với mọi tài khoản vai trò, chụp ảnh các màn chính; lỗi thấy '
  + 'được ghi vào spec.md mục "Lỗi phát hiện", không sửa. Cuối cùng gộp tài liệu vào nhánh tích hợp trên máy. '
  + 'Không hỏi lại về hướng làm.';

export function featureRequirement(feature, project, mode = 'full') {
  // The first line names the feature: it becomes the lane's feature title.
  return [
    `Tính năng "${feature.title}" của dự án ${project.name} (lộ trình đã duyệt trong Shipyard):`,
    ...(mode === 'docs' ? [DOCS_ONLY] : []),
    feature.text,
    '',
    'Làm theo tài liệu đã duyệt trong repo: docs/product-brief.md, docs/architecture.md (module, dữ liệu, API, cấu trúc thư mục) và docs/design/ nếu có.',
  ].join('\n');
}

const FREE = ['idle', 'down', '', undefined];
/** Lanes bound to this project that can take a feature now. */
export const freeLanesOf = (lanes, projectId) => (lanes || [])
  .filter(l => l.run_project_id === projectId && l.bound_profile && !l.session_running && FREE.includes(l.status));
export const lanesOf = (lanes, projectId) => (lanes || []).filter(l => l.run_project_id === projectId && l.bound_profile);

const DRAFT_STEPS = { pm: [1, 'Yêu cầu sản phẩm'], system: [2, 'Thiết kế hệ thống'], ui: [3, 'Thiết kế giao diện'], create: [4, 'Tạo dự án'] };
/** Where a creation chat stands, for the project list ("Bước 2/4 · Thiết kế hệ thống"). */
export function draftStep(d) {
  const st = DRAFT_STEPS[d.stage];
  return st ? tr('Bước {0}/4 · {1}', [st[0], tr(st[1])]) : tr('Đang tạo dự án');
}
