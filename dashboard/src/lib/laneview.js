// Pure view logic for the lane sidebar/header — kept out of components so it is unit-tested.

const RUNNING = new Set(['running', 'provisioning']);

/** Lane status → [badge tone, Vietnamese label]; one table for the board, the lane header and the sidebar. */
export const LANE_STATUS = {
  running: ['accent', 'Đang chạy'],
  waiting: ['warn', 'Chờ duyệt'],
  passed: ['ok', 'Hoàn tất'],
  blocked: ['danger', 'Đang dừng'],
  failed: ['danger', 'Lỗi'],
  provisioning: ['info', 'Khởi tạo'],
  idle: ['neutral', 'Rảnh'],
  down: ['neutral', 'Đã tắt'],
};
export const laneStatus = st => LANE_STATUS[st || 'idle'] || ['neutral', st];

/** Harness stage id → what a person calls it. */
export const STAGE_VI = {
  intake: 'Tiếp nhận yêu cầu',
  plan: 'Lập kế hoạch & Spec',
  implement: 'Đang lập trình',
  gates: 'Kiểm tra chất lượng',
  e2e: 'Kiểm thử tự động (E2E)',
  review: 'AI Review code',
  qc: 'Kiểm thử QC',
  'sr-gate': 'Cổng duyệt Senior',
  pr: 'Tạo Pull Request',
  'watch-pr': 'Chờ gộp PR',
  merged: 'Đã gộp nhánh',
  'dev-qc': 'Kiểm thử môi trường Dev',
  done: 'Hoàn tất',
  'no-state': 'Chưa nhận việc',
  assigned: 'Vừa giao việc',
  provisioning: 'Đang khởi tạo lane',
  'spec-review': 'Chờ duyệt spec',
  fix: 'Đang sửa lỗi',
};

export const stageLabel = st => STAGE_VI[(st || '').toLowerCase()]
  || (/^role-(\w+)$/.test(st || '') ? `Bước ${st.slice(5).toUpperCase()}` : /^review-(\w+)$/.test(st || '') ? `Chờ duyệt ${st.slice(7).toUpperCase()}` : st || 'Chưa nhận việc');

/** Why a lane wants attention → [tone, label]. */
export const ATTENTION = {
  question: ['warn', 'đang hỏi'], approve: ['warn', 'chờ duyệt'], blocked: ['danger', 'bị chặn'],
  dead: ['danger', 'mất kết nối'], needs: ['accent', 'cần bạn'],
};
const FREE = new Set(['idle', 'down', '']);

/**
 * "dead" comes from state heartbeats, written only between stages; a lane whose session is working
 * (mid-turn or waiting on a background step) is not lost. Older servers only say session_running.
 */
export function liveLiveness(l) {
  const working = l.session_active ?? l.session_running;
  return l.liveness === 'dead' && working ? 'active' : l.liveness;
}

export function laneAttention(l) {
  if (l.pending_kind) return 'question';
  if (l.stage === 'spec-review' && l.status === 'waiting') return 'approve';
  if (l.status === 'blocked') return 'blocked';
  if (l.liveness === 'dead') return 'dead';
  if (l.needs_action) return 'needs';
  return null;
}

function rank(l) {
  if (laneAttention(l)) return 0;
  if (RUNNING.has(l.status)) return 1;
  return 2;
}

export function sortLanes(lanes) {
  return [...lanes].sort((a, b) => rank(a) - rank(b) || a.lane - b.lane);
}

export function isFree(l) {
  return !l.session_running && FREE.has(l.status || '');
}

export function primaryActions(l, { archived = false } = {}) {
  if (archived) return [];
  const out = [];
  if (l.session_running && l.stage === 'spec-review' && l.status === 'waiting') out.push('approve');
  if (l.session_running) out.push('stop');
  else if (l.session_resumable) out.push('resume');
  else if (isFree(l)) out.push('assign');
  return out.slice(0, 2);
}

export function mergeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  const byId = new Map();
  for (const e of steps) {
    if (!e || !e.id) continue;
    const prev = byId.get(e.id);
    const started = prev?.started ?? (e.event === 'start' ? e.at : undefined);
    byId.set(e.id, { ...(prev || {}), ...e, started });
  }
  return [...byId.values()];
}
