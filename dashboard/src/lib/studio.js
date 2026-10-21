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
