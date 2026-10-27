// Product studio API (chat from an idea to a created project) + small pure helpers.
import { authFetch } from './api.js';

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
  start: text => call('POST', '/api/studio', { text }),
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

export const APPROVE_LABEL = { pm: 'Duyệt yêu cầu', system: 'Duyệt thiết kế hệ thống', ui: 'Duyệt giao diện' };
export const EXAMPLES = [
  'Tôi cần hệ thống bán hàng cho 5 cửa hàng, khoảng 1000 người dùng',
  'Ứng dụng đặt lịch khám cho phòng khám nha khoa',
  'Công cụ nội bộ quản lý đơn nghỉ phép cho công ty 200 người',
];

/** Who wrote a chat message, for its label. */
export function speaker(msg, stages) {
  if (msg.role === 'user') return 'Bạn';
  if (msg.role === 'shipyard') return 'Shipyard';
  return stages.find(s => s.id === msg.stage)?.role || 'AI';
}

/** Should the view keep polling? (an AI is answering, or the project is being generated) */
export const isLive = s => !!s && (s.busy || s.job?.status === 'running');

/** The requirement a roadmap feature is assigned to a lane with (the lane's PM/Plan start from it). */
// How a lane takes a roadmap feature: build it, or (the app already exists) document what is there.
export const FEATURE_MODES = [
  { id: 'full', label: 'Làm đầy đủ — tài liệu, code, kiểm tra' },
  { id: 'docs', label: 'App đã có — chỉ tài liệu + QC chụp ảnh, không sửa code' },
];
const DOCS_ONLY = 'CHẾ ĐỘ APP ĐÃ CÓ: repo đã có app chạy được. Chỉ đọc code và viết tài liệu (spec, plan, tasks) mô tả đúng '
  + 'những gì app đang có cho tính năng này, đánh dấu tasks "đã có sẵn". KHÔNG sửa code. Sau đó bật app của lane, QC trên '
  + 'trình duyệt với mọi tài khoản vai trò và chụp ảnh các màn chính làm bằng chứng; lỗi thấy được thì ghi vào tài liệu '
  + 'mục "Lỗi phát hiện", không sửa. Tài liệu nộp qua các bước duyệt như thường (người duyệt xem và duyệt trên dashboard). '
  + 'Rồi gộp tài liệu vào nhánh tích hợp trên máy. Không hỏi lại về hướng làm.';

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
