// Pure helpers for the review screen (unit-tested; mirrors orchestrator rules, spec §3.2).
export const STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
export const STEP_LABEL = { PM: 'PM — Yêu cầu', BA: 'BA — Nghiệp vụ', ARCH: 'Kiến trúc', DESIGN: 'Thiết kế UI', DEV: 'Lập trình', TEST: 'Kiểm thử' };
export const ROLE_LABEL = { PM: 'PM', BA: 'BA', TECH_LEAD: 'Tech Lead', DESIGNER: 'Designer', DEVELOPER: 'Developer', TESTER: 'Tester',
  OWNER: 'Owner', MAINTAINER: 'Maintainer', VIEWER: 'Viewer', OWNER_FALLBACK: 'Owner (duyệt thay)', AUTO: 'Tự động' };
export const ACTION_LABEL = { APPROVE: 'Duyệt', REQUEST_CHANGES: 'Yêu cầu sửa', SEND_BACK: 'Trả về bước trước', CANCEL: 'Huỷ tính năng' };
export const STATUS_LABEL = { PENDING: 'chờ', AI_WORKING: 'AI đang làm', AWAITING_REVIEW: 'chờ duyệt', APPROVED: 'đã duyệt', SKIPPED: 'bỏ qua' };

export function sendBackTargets(currentStep, steps) {
  const i = STEPS.indexOf(currentStep);
  return STEPS.slice(0, Math.max(0, i)).filter(s => (steps.find(x => x.step === s) || {}).status !== 'SKIPPED');
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
