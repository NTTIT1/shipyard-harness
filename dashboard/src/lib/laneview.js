// Pure view logic for the lane sidebar/header — kept out of components so it is unit-tested.
import { STEP_LABEL, leftOut } from './review.js';

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

const roleLabel = id => STEP_LABEL[id.toUpperCase()] || `Bước ${id.toUpperCase()}`;
export const stageLabel = st => STAGE_VI[(st || '').toLowerCase()]
  || (/^role-(\w+)$/.test(st || '') ? roleLabel(st.slice(5)) : /^review-(\w+)$/.test(st || '') ? `Chờ duyệt ${roleLabel(st.slice(7))}` : st || 'Chưa nhận việc');

const STEP_SUB = { APPROVED: 'Đã duyệt', AWAITING_REVIEW: 'Chờ duyệt', AI_WORKING: 'AI đang làm', PENDING: 'Chưa tới' };

/**
 * The lane's feature as the steps of its own workflow (e.g. Doanh nghiệp: BA → Plan → Thiết kế UI →
 * PM → Lập trình → Kiểm thử), from the platform run view ({ run, steps } — steps already in workflow
 * order). Steps the workflow left out are not shown; DESIGN skipped because there is no UI stays, marked
 * skipped. Once every gate passed (RELEASING/DONE) or the lane finished, every step is done.
 * → { steps: [{ id, label, sub, state: done|current|pending|skipped }], progress, current, releasing } | null
 */
export function workflowTrack(view, lane = {}) {
  const steps = (view?.steps || []).filter(s => !leftOut(s));
  if (!steps.length) return null;
  const run = view.run || {};
  const finished = run.status === 'RELEASING' || run.status === 'DONE' || lane.status === 'passed' || lane.stage === 'done';
  const out = steps.map(s => {
    const base = { id: s.step, label: STEP_LABEL[s.step] || s.step };
    if (s.status === 'SKIPPED') return { ...base, state: 'skipped', sub: 'Bỏ qua (không có giao diện)' };
    if (finished || s.status === 'APPROVED') return { ...base, state: 'done', sub: 'Đã duyệt' };
    if (s.status === 'AI_WORKING' || s.status === 'AWAITING_REVIEW' || s.step === run.currentStep) {
      const sub = run.status === 'CANCELLED' ? 'Đã huỷ' : lane.status === 'blocked' ? 'Đang dừng' : STEP_SUB[s.status] || 'Đang làm';
      return { ...base, state: 'current', sub };
    }
    return { ...base, state: 'pending', sub: STEP_SUB.PENDING };
  });
  const passed = out.filter(s => s.state === 'done' || s.state === 'skipped').length;
  return {
    steps: out,
    progress: Math.round(passed / out.length * 100),
    current: out.find(s => s.state === 'current') || null,
    releasing: run.status === 'RELEASING' && !(lane.status === 'passed' || lane.stage === 'done'),
  };
}

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
