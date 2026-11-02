// Pure view logic for the lane sidebar/header — kept out of components so it is unit-tested.
import { STEP_LABEL, leftOut } from './review.js';
import { tr } from './i18n.js';

const RUNNING = new Set(['running', 'provisioning']);

/** Lane status → [badge tone, Vietnamese label]; one table for the board, the lane header and the sidebar. */
export const LANE_STATUS = {
  running: ['accent', tr('Đang chạy')],
  waiting: ['warn', tr('Chờ duyệt')],
  passed: ['ok', tr('Hoàn tất')],
  blocked: ['danger', tr('Đang dừng')],
  failed: ['danger', tr('Lỗi')],
  provisioning: ['info', tr('Khởi tạo')],
  idle: ['neutral', tr('Rảnh')],
  down: ['neutral', tr('Đã tắt')],
};
export const laneStatus = st => LANE_STATUS[st || 'idle'] || ['neutral', st];

/** Harness stage id → what a person calls it. */
export const STAGE_VI = {
  intake: tr('Tiếp nhận yêu cầu'),
  plan: tr('Lập kế hoạch & Spec'),
  implement: tr('Đang lập trình'),
  gates: tr('Kiểm tra chất lượng'),
  e2e: tr('Kiểm thử tự động (E2E)'),
  review: 'AI Review code',
  qc: tr('Kiểm thử QC'),
  'sr-gate': tr('Cổng duyệt Senior'),
  pr: tr('Tạo Pull Request'),
  'watch-pr': tr('Chờ gộp PR'),
  merged: tr('Đã gộp nhánh'),
  'dev-qc': tr('Kiểm thử môi trường Dev'),
  done: tr('Hoàn tất'),
  'no-state': tr('Chưa nhận việc'),
  assigned: tr('Vừa giao việc'),
  provisioning: tr('Đang khởi tạo lane'),
  'spec-review': tr('Chờ duyệt spec'),
  fix: tr('Đang sửa lỗi'),
};

const roleLabel = id => STEP_LABEL[id.toUpperCase()] || tr('Bước {0}', [id.toUpperCase()]);
export const stageLabel = st => STAGE_VI[(st || '').toLowerCase()]
  || (/^role-(\w+)$/.test(st || '') ? roleLabel(st.slice(5)) : /^review-(\w+)$/.test(st || '') ? tr('Chờ duyệt {0}', [roleLabel(st.slice(7))]) : st || tr('Chưa nhận việc'));

const STEP_SUB = { APPROVED: tr('Đã duyệt'), AWAITING_REVIEW: tr('Chờ duyệt'), AI_WORKING: tr('AI đang làm'), PENDING: tr('Chưa tới') };

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
    if (s.status === 'SKIPPED') return { ...base, state: 'skipped', sub: tr('Bỏ qua (không có giao diện)') };
    if (finished || s.status === 'APPROVED') return { ...base, state: 'done', sub: tr('Đã duyệt') };
    if (s.status === 'AI_WORKING' || s.status === 'AWAITING_REVIEW' || s.step === run.currentStep) {
      const sub = run.status === 'CANCELLED' ? tr('Đã huỷ') : lane.status === 'blocked' ? tr('Đang dừng') : STEP_SUB[s.status] || tr('Đang làm');
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
  question: ['warn', tr('đang hỏi')], approve: ['warn', tr('chờ duyệt')], blocked: ['danger', tr('bị chặn')],
  dead: ['danger', tr('mất kết nối')], needs: ['accent', tr('cần bạn')],
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

/** A lane is shown under the project it works on (or when every project is in view). */
export const laneInScope = (lane, activeProjectId) => !!lane && (!activeProjectId || activeProjectId === 'ALL' || lane.run_project_id === activeProjectId);

/**
 * Projects a lane can be added for. The platform is the source of truth: a project folder left on this
 * machine after its project was deleted is not offered. The install's main project (lanes without a
 * profile work on it) comes first, by its own name.
 * local: [{ slug, name, stack, supported, reason }] (folders here) · reg: platform projects · mainId: its id.
 */
export function laneProjectOptions(local, reg, mainId) {
  const main = (reg || []).find(r => r.id === mainId);
  const out = [{ slug: '', name: main?.name || 'Dự án chính của máy này', projectId: main?.id || '', main: true, supported: true, stack: '' }];
  for (const p of local || []) {
    const r = (reg || []).find(x => x.slug === p.slug);
    if (!r || r.id === mainId) continue;
    out.push({ ...p, name: r.name || p.name, projectId: r.id, main: false });
  }
  return [out[0], ...out.slice(1).sort((a, b) => a.name.localeCompare(b.name, 'vi'))];
}

/**
 * A project's progress by its roadmap: built features count whole, a feature a lane is building counts by
 * that lane's progress; dropped ones are left out. null when the project has no roadmap to measure.
 */
export function projectProgress(list, lanes = []) {
  const live = (list || []).filter(f => f.status !== 'dropped');
  if (!live.length) return null;
  const n = s => live.filter(f => f.status === s).length;
  const partial = live.filter(f => f.status === 'building')
    .reduce((s, f) => s + Math.max(0, Math.min(100, Number((lanes || []).find(l => l.lane === f.lane)?.progress) || 0)) / 100, 0);
  return { total: live.length, done: n('done'), building: n('building'), waiting: n('waiting'), planned: n('planned'),
    dropped: (list || []).length - live.length, percent: Math.round(((n('done') + partial) / live.length) * 100) };
}
