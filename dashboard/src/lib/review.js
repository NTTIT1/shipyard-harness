// Pure helpers for the review screen (unit-tested; mirrors orchestrator rules, spec §3.2).
export const STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
export const STEP_LABEL = { PM: 'PM — Yêu cầu', BA: 'BA — Nghiệp vụ', ARCH: 'Plan — Kiến trúc', DESIGN: 'Thiết kế UI', DEV: 'Lập trình', TEST: 'Kiểm thử',
  MANAGER: 'Luật dự án (AI Manager)', BLUEPRINT: 'Kiến trúc dự án (trước khi tạo khung)' };

/**
 * Steps shown for a run, in the run's own workflow order (the server lists them in order; steps the
 * workflow left out are hidden). A project-rules (SETUP) run has only MANAGER, a new project's
 * architecture (BLUEPRINT) run only BLUEPRINT.
 */
export function runSteps(steps) {
  for (const single of ['MANAGER', 'BLUEPRINT']) if ((steps || []).some(s => s.step === single)) return [single];
  if (!steps?.length) return STEPS;
  return steps.filter(s => !leftOut(s)).map(s => s.step);
}

/** A step the project's (or the feature's) workflow left out — not the same as DESIGN skipped for has_ui=false. */
export const leftOut = s => s?.status === 'SKIPPED' && s?.skipReason === 'workflow';

/** Progress of a run (0–100) from its frozen workflow; null when unknown. */
export function runProgress(run) {
  if (run.status === 'DONE' || run.status === 'RELEASING') return 100;
  const order = run.workflow?.length ? run.workflow : STEPS;
  const i = order.indexOf(run.currentStep);
  return i >= 0 ? Math.round(((i + 1) / order.length) * 100) : null;
}

export const GATE_MODES = [
  { id: 'REQUIRED', label: 'Cần người duyệt' },
  { id: 'AUTO', label: 'Tự duyệt' },
  { id: 'SKIP', label: 'Bỏ bước' },
];

/** Steps that may be reordered (they feed DEV); DEV then TEST always close the workflow. */
export const MOVABLE = ['PM', 'BA', 'ARCH', 'DESIGN'];

/** Moves a step to `target` inside the movable head of the workflow (drag & drop); returns a new list. */
export function moveTo(workflow, step, target) {
  const i = workflow.findIndex(w => w.step === step);
  const last = workflow.findIndex(w => !MOVABLE.includes(w.step)) - 1;
  if (i < 0 || !MOVABLE.includes(step)) return workflow;
  const j = Math.max(0, Math.min(target, last));
  if (j === i) return workflow;
  const out = [...workflow];
  const [w] = out.splice(i, 1);
  out.splice(j, 0, w);
  return out;
}

const wf = (...pairs) => pairs.map(([step, mode]) => ({ step, mode }));
/**
 * Ready-made workflows (ids are also what the AI advisor may suggest). "Plan" is the ARCH step: it
 * writes plan.md + tasks.md. Auto steps only pass green submissions; a red test waits for a human.
 */
export const WORKFLOW_PRESETS = [
  { id: 'full', label: 'Đầy đủ', desc: 'PM → BA → Plan → Thiết kế UI → Code → Test, bước nào cũng có người duyệt.',
    steps: wf(['PM', 'REQUIRED'], ['BA', 'REQUIRED'], ['ARCH', 'REQUIRED'], ['DESIGN', 'REQUIRED'], ['DEV', 'REQUIRED'], ['TEST', 'REQUIRED']) },
  { id: 'plan-code-test', label: 'Plan → Code → Test', desc: 'Bạn duyệt Plan; Code và Test tự qua khi xanh, đỏ thì dừng chờ người.',
    steps: wf(['ARCH', 'REQUIRED'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['DESIGN', 'SKIP'], ['DEV', 'AUTO'], ['TEST', 'AUTO']) },
  { id: 'auto', label: 'Tự chạy hết', desc: 'Plan → Code → Test không chờ duyệt; chỉ dừng khi test hoặc CI đỏ.',
    steps: wf(['ARCH', 'AUTO'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['DESIGN', 'SKIP'], ['DEV', 'AUTO'], ['TEST', 'AUTO']) },
  { id: 'ui', label: 'Thiết kế UI → Code → Test', desc: 'Cho dự án nặng giao diện: duyệt mockup trước khi code.',
    steps: wf(['DESIGN', 'REQUIRED'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['ARCH', 'SKIP'], ['DEV', 'REQUIRED'], ['TEST', 'REQUIRED']) },
  { id: 'code', label: 'Chỉ Code + Test', desc: 'Việc nhỏ, rõ ràng: AI tự lên kế hoạch trong bước Code.',
    steps: wf(['PM', 'SKIP'], ['BA', 'SKIP'], ['ARCH', 'SKIP'], ['DESIGN', 'SKIP'], ['DEV', 'AUTO'], ['TEST', 'REQUIRED']) },
];
export const presetById = id => WORKFLOW_PRESETS.find(p => p.id === id) || null;

/** Moves a step one place up/down inside the movable head of the workflow; returns a new list. */
export function moveStep(workflow, step, dir) {
  const i = workflow.findIndex(w => w.step === step), j = i + dir;
  if (i < 0 || !MOVABLE.includes(step) || j < 0 || j >= workflow.length || !MOVABLE.includes(workflow[j].step)) return workflow;
  const out = [...workflow];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** '' when the workflow is valid, else a Vietnamese message (mirrors the orchestrator's rules). */
export function workflowProblem(workflow) {
  const order = (workflow || []).map(w => w.step);
  if (order.length !== STEPS.length || STEPS.some(s => !order.includes(s))) return 'Quy trình phải có đủ 6 bước.';
  const dev = order.indexOf('DEV');
  if (MOVABLE.some(s => order.indexOf(s) > dev)) return 'Các bước tài liệu phải đứng trước Lập trình.';
  if (order.indexOf('TEST') < dev) return 'Kiểm thử phải đứng sau Lập trình.';
  if (workflow.find(w => w.step === 'DEV').mode === 'SKIP') return 'Không thể bỏ bước Lập trình.';
  return '';
}
export const ROLE_LABEL = { PM: 'PM', BA: 'BA', TECH_LEAD: 'Tech Lead', DESIGNER: 'Designer', DEVELOPER: 'Developer', TESTER: 'Tester',
  OWNER: 'Owner', MAINTAINER: 'Maintainer', VIEWER: 'Viewer', OWNER_FALLBACK: 'Owner (duyệt thay)', AUTO: 'Tự động' };
export const ACTION_LABEL = { APPROVE: 'Duyệt', REQUEST_CHANGES: 'Yêu cầu sửa', SEND_BACK: 'Trả về bước trước', CANCEL: 'Huỷ tính năng' };
export const STATUS_LABEL = { PENDING: 'chờ', AI_WORKING: 'AI đang làm', AWAITING_REVIEW: 'chờ duyệt', APPROVED: 'đã duyệt', SKIPPED: 'bỏ qua' };

export function sendBackTargets(currentStep, steps) {
  const order = steps?.length ? steps.map(s => s.step) : STEPS;
  const i = order.indexOf(currentStep);
  return order.slice(0, Math.max(0, i)).filter(s => (steps.find(x => x.step === s) || {}).status !== 'SKIPPED');
}

/** '' when valid, else a Vietnamese message. */
export function validateDecision({ action, feedback, sendBackTo, edits, currentStep, steps }) {
  const hasEdits = edits && Object.keys(edits).length > 0;
  if ((action === 'REQUEST_CHANGES' || action === 'SEND_BACK') && !(feedback || '').trim()) return 'Cần nhập góp ý cho AI.';
  if (action === 'SEND_BACK' && !sendBackTargets(currentStep, steps).includes(sendBackTo)) return 'Chọn một bước trước đó (không phải bước bị bỏ qua).';
  if (hasEdits && action !== 'APPROVE' && action !== 'REQUEST_CHANGES') return 'Bản sửa tay chỉ đi kèm Duyệt hoặc Yêu cầu sửa — huỷ bản sửa trước.';
  return '';
}

export function pendingRevision(view) {
  return [...(view?.revisions || [])].reverse().find(r => r.approvalStatus === 'PENDING') || null;
}

export function previousRevision(view, rev) {
  return [...(view?.revisions || [])].filter(r => r.step === rev.step && r.revisionNo < rev.revisionNo)
    .sort((a, b) => b.revisionNo - a.revisionNo)[0] || null;
}

/** Line diff via LCS; inputs over 2000 lines fall back to delete-all/add-all. */
export function lineDiff(a, b) {
  const A = a ? a.split('\n') : [], B = b ? b.split('\n') : [];
  if (A.length > 2000 || B.length > 2000) return [...A.map(s => ({ t: 'del', s })), ...B.map(s => ({ t: 'add', s }))];
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push({ t: 'same', s: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: 'del', s: A[i++] });
    else out.push({ t: 'add', s: B[j++] });
  }
  while (i < A.length) out.push({ t: 'del', s: A[i++] });
  while (j < B.length) out.push({ t: 'add', s: B[j++] });
  return out;
}

/** The inbox entry that lets this user decide the revision on screen (however the screen was opened). */
export function inboxItemFor(items, rev) {
  return rev?.approvalId ? (items || []).find(i => i.approvalId === rev.approvalId) : undefined;
}

/** hasUi to send with an ARCH approval: only when the reviewer changed the AI's answer. */
export function hasUiToSend(fromAi, chosen) {
  return chosen === fromAi || chosen == null ? undefined : chosen;
}

export function isMember(rows, userId) {
  return (rows || []).some(r => r.userId === userId);
}

/** Revision images must be served by this dashboard. */
export function safeImageSrc(p) {
  return typeof p === 'string' && /^\/(spec|proof)\/\d+\//.test(p) && !p.includes('..') ? p : '';
}
