import { tr } from './i18n.js';
// Pure helpers for the review screen (unit-tested; mirrors orchestrator rules, spec §3.2).
export const STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'TESTCASE', 'DEV', 'SECURITY', 'TEST'];
export const STEP_LABEL = { PM: tr('PM — Yêu cầu'), BA: tr('BA — Nghiệp vụ'), ARCH: tr('Plan — Kiến trúc'), DESIGN: tr('Thiết kế UI'), TESTCASE: tr('Ca kiểm thử'), DEV: tr('Lập trình'), SECURITY: tr('Bảo mật'), TEST: tr('Kiểm thử'),
  MANAGER: tr('Luật dự án (AI Manager)'), BLUEPRINT: tr('Kiến trúc dự án (trước khi tạo khung)') };

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
  { id: 'REQUIRED', label: tr('Cần người duyệt') },
  { id: 'AUTO', label: tr('Tự duyệt') },
  { id: 'SKIP', label: tr('Bỏ bước') },
];

/** Steps that may be reordered (they feed DEV); DEV, then SECURITY and TEST, always close the workflow. */
export const MOVABLE = ['PM', 'BA', 'ARCH', 'DESIGN', 'TESTCASE'];

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
 * A workflow from before the security review (saved earlier, or written by the studio's AI) has six
 * steps: SECURITY goes right after DEV, needing a person (mirrors the orchestrator's withSecurity).
 */
export function withSecurity(workflow) {
  if (!Array.isArray(workflow) || workflow.some(w => w.step === 'SECURITY')) return workflow;
  const dev = workflow.findIndex(w => w.step === 'DEV');
  if (dev < 0) return workflow;
  return [...workflow.slice(0, dev + 1), { step: 'SECURITY', mode: 'REQUIRED' }, ...workflow.slice(dev + 1)];
}

/**
 * A workflow from before the test-case step gets TESTCASE right before DEV, in the TEST step's mode
 * (an all-automatic workflow does not suddenly wait for a person). Mirrors the orchestrator.
 */
export function withTestCases(workflow) {
  if (!Array.isArray(workflow) || workflow.some(w => w.step === 'TESTCASE')) return workflow;
  const dev = workflow.findIndex(w => w.step === 'DEV');
  if (dev < 0) return workflow;
  const mode = workflow.find(w => w.step === 'TEST')?.mode || 'REQUIRED';
  return [...workflow.slice(0, dev), { step: 'TESTCASE', mode }, ...workflow.slice(dev)];
}

/** Every step added since a workflow was written, each in its place. */
export const withNewSteps = workflow => withTestCases(withSecurity(workflow));
/**
 * Ready-made workflows (ids are also what the AI advisor may suggest). "Plan" is the ARCH step: it
 * writes plan.md + tasks.md. Auto steps only pass green submissions; a red test waits for a human.
 */
export const WORKFLOW_PRESETS = [
  { id: 'enterprise', label: tr('Doanh nghiệp'),
    desc: tr('BA → Kiến trúc → Thiết kế UI → PM chốt phạm vi → Ca kiểm thử → Code → Bảo mật → Test, bước nào cũng có người duyệt.'),
    steps: wf(['BA', 'REQUIRED'], ['ARCH', 'REQUIRED'], ['DESIGN', 'REQUIRED'], ['PM', 'REQUIRED'], ['TESTCASE', 'REQUIRED'], ['DEV', 'REQUIRED'], ['SECURITY', 'REQUIRED'], ['TEST', 'REQUIRED']) },
  { id: 'full', label: tr('Đầy đủ'), desc: tr('PM → BA → Plan → Thiết kế UI → Ca kiểm thử → Code → Bảo mật → Test, bước nào cũng có người duyệt.'),
    steps: wf(['PM', 'REQUIRED'], ['BA', 'REQUIRED'], ['ARCH', 'REQUIRED'], ['DESIGN', 'REQUIRED'], ['TESTCASE', 'REQUIRED'], ['DEV', 'REQUIRED'], ['SECURITY', 'REQUIRED'], ['TEST', 'REQUIRED']) },
  { id: 'plan-code-test', label: 'Plan → Code → Test', desc: tr('Bạn duyệt Plan; Code và Test tự qua khi xanh, đỏ thì dừng chờ người.'),
    steps: wf(['ARCH', 'REQUIRED'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['DESIGN', 'SKIP'], ['TESTCASE', 'AUTO'], ['DEV', 'AUTO'], ['SECURITY', 'AUTO'], ['TEST', 'AUTO']) },
  { id: 'auto', label: tr('Tự chạy hết'), desc: tr('Plan → Code → Test không chờ duyệt; chỉ dừng khi test hoặc CI đỏ.'),
    steps: wf(['ARCH', 'AUTO'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['DESIGN', 'SKIP'], ['TESTCASE', 'AUTO'], ['DEV', 'AUTO'], ['SECURITY', 'AUTO'], ['TEST', 'AUTO']) },
  { id: 'ui', label: tr('Thiết kế UI → Code → Test'), desc: tr('Cho dự án nặng giao diện: duyệt mockup trước khi code.'),
    steps: wf(['DESIGN', 'REQUIRED'], ['PM', 'SKIP'], ['BA', 'SKIP'], ['ARCH', 'SKIP'], ['TESTCASE', 'REQUIRED'], ['DEV', 'REQUIRED'], ['SECURITY', 'REQUIRED'], ['TEST', 'REQUIRED']) },
  { id: 'code', label: tr('Chỉ Code + Test'), desc: tr('Việc nhỏ, rõ ràng: AI tự lên kế hoạch trong bước Code.'),
    steps: wf(['PM', 'SKIP'], ['BA', 'SKIP'], ['ARCH', 'SKIP'], ['DESIGN', 'SKIP'], ['TESTCASE', 'SKIP'], ['DEV', 'AUTO'], ['SECURITY', 'AUTO'], ['TEST', 'REQUIRED']) },
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
  if (order.length !== STEPS.length || STEPS.some(s => !order.includes(s))) return tr('Quy trình phải có đủ {0} bước.', [STEPS.length]);
  const dev = order.indexOf('DEV');
  if (MOVABLE.some(s => order.indexOf(s) > dev)) return tr('Các bước tài liệu phải đứng trước Lập trình.');
  if (order.indexOf('TEST') < dev) return tr('Kiểm thử phải đứng sau Lập trình.');
  if (order.indexOf('SECURITY') < dev) return tr('Bảo mật phải đứng sau Lập trình.');
  if (workflow.find(w => w.step === 'DEV').mode === 'SKIP') return tr('Không thể bỏ bước Lập trình.');
  for (const w of workflow) {
    const why = stepConfigProblem(w.step, w.config);
    if (why) return `${STEP_LABEL[w.step]}: ${why}`;
  }
  return '';
}

// Mirrors lib/workflow.js configProblem (kept here so review.js has no import cycle).
function stepConfigProblem(step, cfg = {}) {
  if (!cfg) return '';
  const n = k => (cfg[k] === '' || cfg[k] == null ? null : Number(cfg[k]));
  if (n('maxRetries') != null && !(n('maxRetries') >= 0 && n('maxRetries') <= 5)) return tr('số vòng thử từ 0 đến 5');
  if (n('timeoutMinutes') != null && !(n('timeoutMinutes') >= 1 && n('timeoutMinutes') <= 480)) return tr('giới hạn từ 1 đến 480 phút');
  if (n('budgetVnd') != null && !(n('budgetVnd') >= 0)) return tr('ngân sách phải ≥ 0');
  const bad = (cfg.requiredInputs || []).find(p => !/^[A-Za-z0-9._/@-]{1,200}$/.test(p) || p.includes('..') || p.startsWith('/'));
  if (bad) return tr('đường dẫn không hợp lệ: {0}', [bad]);
  if (step === 'DEV' && cfg.condition && cfg.condition !== 'ALWAYS') return tr('bước Code luôn chạy');
  return '';
}
export const ROLE_LABEL = { PM: 'PM', BA: 'BA', TECH_LEAD: 'Tech Lead', DESIGNER: 'Designer', DEVELOPER: 'Developer', TESTER: 'Tester',
  OWNER: 'Owner', MAINTAINER: 'Maintainer', VIEWER: 'Viewer', OWNER_FALLBACK: tr('Owner (duyệt thay)'), AUTO: tr('Tự động') };

export const APPROVER_ROLE_OPTIONS = [
  { id: 'BA', label: tr('BA Lead (vai trò BA)'), desc: tr('Phê duyệt tài liệu đặc tả nghiệp vụ') },
  { id: 'TECH_LEAD', label: tr('Tech Lead (vai trò TECH_LEAD)'), desc: tr('Phê duyệt kiến trúc, giải pháp và code') },
  { id: 'PM', label: tr('Product Owner / PM (vai trò PM)'), desc: tr('Phê duyệt mục tiêu sản phẩm & UI/UX') },
  { id: 'DESIGNER', label: tr('Lead Designer (vai trò DESIGNER)'), desc: tr('Phê duyệt thiết kế và mockup giao diện') },
  { id: 'TESTER', label: tr('QA Lead (vai trò TESTER)'), desc: tr('Phê duyệt chất lượng và kết quả kiểm thử') },
  { id: 'MAINTAINER', label: tr('Maintainer (Quản trị viên)'), desc: tr('Thành viên quản trị dự án') },
  { id: 'OWNER', label: tr('Owner (Chủ dự án)'), desc: tr('Chủ sở hữu dự án') },
];

export function defaultApproverRole(step) {
  switch (step) {
    case 'BA': return 'BA';
    case 'ARCH': return 'TECH_LEAD';
    case 'DESIGN': return 'PM';
    case 'PM': return 'PM';
    case 'DEV': return 'TECH_LEAD';
    case 'SECURITY': return 'TECH_LEAD';
    case 'TESTCASE': return 'TESTER';
    case 'TEST': return 'TESTER';
    default: return 'TECH_LEAD';
  }
}
export const ACTION_LABEL = { APPROVE: tr('Duyệt'), REQUEST_CHANGES: tr('Yêu cầu sửa'), SEND_BACK: tr('Trả về bước trước'), CANCEL: tr('Huỷ tính năng') };
export const STATUS_LABEL = { PENDING: tr('chờ'), AI_WORKING: tr('AI đang làm'), AWAITING_REVIEW: tr('chờ duyệt'), APPROVED: tr('đã duyệt'), SKIPPED: tr('bỏ qua') };

export function sendBackTargets(currentStep, steps) {
  const order = steps?.length ? steps.map(s => s.step) : STEPS;
  const i = order.indexOf(currentStep);
  return order.slice(0, Math.max(0, i)).filter(s => (steps.find(x => x.step === s) || {}).status !== 'SKIPPED');
}

/** '' when valid, else a Vietnamese message. */
export function validateDecision({ action, feedback, sendBackTo, edits, currentStep, steps }) {
  const hasEdits = edits && Object.keys(edits).length > 0;
  if ((action === 'REQUEST_CHANGES' || action === 'SEND_BACK') && !(feedback || '').trim()) return tr('Cần nhập góp ý cho AI.');
  if (action === 'SEND_BACK' && !sendBackTargets(currentStep, steps).includes(sendBackTo)) return tr('Chọn một bước trước đó (không phải bước bị bỏ qua).');
  if (hasEdits && action !== 'APPROVE' && action !== 'REQUEST_CHANGES') return tr('Bản sửa tay chỉ đi kèm Duyệt hoặc Yêu cầu sửa — huỷ bản sửa trước.');
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

/** Approvals waiting per project: { [projectId]: n }. */
export function inboxCounts(items) {
  const out = {};
  for (const i of items || []) if (i?.projectId) out[i.projectId] = (out[i.projectId] || 0) + 1;
  return out;
}
/** The approvals of the project being viewed ('ALL' / none = every project). */
export const inboxFor = (items, projectId) => (!projectId || projectId === 'ALL' ? items || [] : (items || []).filter(i => i.projectId === projectId));

/** The usual order of the document steps; an added step slots in by it among the steps that run. */
const CANON = ['PM', 'BA', 'ARCH', 'DESIGN', 'TESTCASE'];

/**
 * Turns a left-out step back on ("Thêm bước"): it needs a person's approval, and a document step is placed
 * before the first running document step that normally follows it (else right before Lập trình).
 */
export function addStep(workflow, step, mode = 'REQUIRED') {
  const on = workflow.map(w => (w.step === step ? { ...w, mode } : w));
  if (!MOVABLE.includes(step)) return on;
  const rest = on.filter(w => w.step !== step);
  const me = on.find(w => w.step === step);
  const after = CANON.indexOf(step);
  let at = rest.findIndex(w => (MOVABLE.includes(w.step) && w.mode !== 'SKIP' && CANON.indexOf(w.step) > after) || !MOVABLE.includes(w.step));
  if (at < 0) at = rest.length;
  return [...rest.slice(0, at), me, ...rest.slice(at)];
}

/** Leaves a step out ("Bỏ bước"); Lập trình always runs. */
export const removeStep = (workflow, step) => (step === 'DEV' ? workflow : workflow.map(w => (w.step === step ? { ...w, mode: 'SKIP' } : w)));
