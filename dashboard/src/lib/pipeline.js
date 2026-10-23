// The lane pipeline after the code is written (checks, PR, merge, deploy wait, test QC, ticket).
// Project default: orchestrator /projects/{id}/delivery (frozen into each run). Lane override:
// config/lanes/lane<N>.pipeline.json. The lane resolves profile < project < lane (bin/delivery.py).
// Same rules as DeliveryConfig.java and delivery.py; pure helpers, used by the dashboard and its server.

export const CHECKS = [
  { id: 'ciGate', label: 'CI gate', desc: 'build, lint, test trên nhánh tính năng' },
  { id: 'e2e', label: 'E2E', desc: 'kiểm thử đầu-cuối trên stack của lane' },
  { id: 'codeReview', label: 'Review code bằng AI', desc: 'soát lỗi trước khi mở PR' },
  { id: 'qcLocal', label: 'QC trình duyệt (local)', desc: 'AI dùng thử tính năng trên app của lane, chụp ảnh' },
  { id: 'seniorGate', label: 'Kiểm định GO/NO-GO', desc: 'AI senior quyết có cho mở PR không' },
];
export const MERGE = [
  { id: 'HUMAN', label: 'Người merge PR' },
  { id: 'AUTO', label: 'Lane tự merge khi mọi thứ xanh' },
];
export const MERGE_METHOD = [
  { id: 'SQUASH', label: 'Squash' },
  { id: 'MERGE', label: 'Merge commit' },
  { id: 'REBASE', label: 'Rebase' },
];
export const QC_ON_FAIL = [
  { id: 'FIX_PR', label: 'Lane tự mở PR sửa' },
  { id: 'HUMAN', label: 'Dừng, chờ người quyết' },
];

const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;
const CONTEXT_RE = /^[A-Za-z0-9 ._:/()-]{1,100}$/;
const URL_RE = /^https?:\/\/[^\s'"`<>\\]{1,300}$/;

/** Local demo: no PR, no push to a Git host — the lane merges on this machine and runs the app. */
export const localDemoPipeline = () => ({ ...defaultPipeline(), e2e: false, openPr: false, localMerge: true });

/** A full pipeline with every switch at the behaviour lanes had before (all checks, PR, a human merges). */
export const defaultPipeline = (base = '') => ({
  ciGate: true, e2e: true, codeReview: true, qcLocal: true, seniorGate: true,
  openPr: true, localMerge: false, prBase: base, merge: 'HUMAN', mergeMethod: 'SQUASH',
  deployWait: false, deployContext: '', deployTimeoutMinutes: 30,
  testQc: false, testUrl: '', testQcOnFail: 'FIX_PR', ticket: false,
});

/** '' when the pipeline can be saved, else the first problem (Vietnamese). `range: false` = only what makes it unusable. */
export function pipelineProblem(p, { range = true } = {}) {
  if (!p) return '';
  const base = String(p.prBase || '').trim();
  if (base && (!BRANCH_RE.test(base) || base.startsWith('-') || base.includes('..'))) return 'Nhánh nhận PR không hợp lệ';
  if (p.openPr !== false && p.deployWait && !CONTEXT_RE.test(String(p.deployContext || '').trim())) return 'Ghi tên trạng thái CI cần chờ (vd deploy-dev)';
  if (p.openPr !== false && p.testQc && !URL_RE.test(String(p.testUrl || '').trim())) return 'Địa chỉ môi trường test dạng http(s)://…';
  const t = Number(p.deployTimeoutMinutes);
  if (range && p.deployWait && p.deployTimeoutMinutes !== '' && !(t >= 1 && t <= 240)) return 'Thời gian chờ deploy từ 1 đến 240 phút';
  return '';
}

/** What is sent/stored: bounded (like the orchestrator), consistent (no PR ⇒ nothing to merge or verify after). Throws when unusable. */
export function normalizePipeline(p) {
  const why = pipelineProblem(p, { range: false });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  const d = defaultPipeline();
  const b = v => v === true || v === 'true';
  const out = {};
  for (const c of CHECKS) out[c.id] = p[c.id] === undefined ? true : b(p[c.id]);
  out.openPr = p.openPr === undefined ? true : b(p.openPr);
  if (!out.openPr) out.localMerge = b(p.localMerge);
  const base = String(p.prBase || '').trim();
  if (base) out.prBase = base;
  out.merge = out.openPr && MERGE.some(m => m.id === p.merge) ? p.merge : 'HUMAN';
  if (out.merge === 'AUTO') out.mergeMethod = MERGE_METHOD.some(m => m.id === p.mergeMethod) ? p.mergeMethod : 'SQUASH';
  out.deployWait = out.openPr && b(p.deployWait);
  if (out.deployWait) {
    out.deployContext = String(p.deployContext).trim();
    const t = Math.round(Number(p.deployTimeoutMinutes));
    out.deployTimeoutMinutes = Number.isFinite(t) && p.deployTimeoutMinutes !== '' ? Math.max(1, Math.min(240, t)) : d.deployTimeoutMinutes;
  }
  out.testQc = out.openPr && b(p.testQc);
  if (out.testQc) {
    out.testUrl = String(p.testUrl).trim();
    out.testQcOnFail = QC_ON_FAIL.some(x => x.id === p.testQcOnFail) ? p.testQcOnFail : 'FIX_PR';
  }
  out.ticket = b(p.ticket);
  return out;
}

/** The pipeline as one line of steps, for cards and summaries. */
export function pipelineSteps(p) {
  if (!p) return [];
  const s = CHECKS.filter(c => p[c.id] !== false).map(c => c.label);
  if (p.openPr === false) {
    return [...s, p.localMerge ? `gộp vào ${p.prBase || 'nhánh tích hợp'} trên máy → chạy app (không đẩy Git)` : 'đẩy nhánh (không mở PR)'];
  }
  s.push(`PR vào ${p.prBase || 'nhánh tích hợp'}`);
  s.push(p.merge === 'AUTO' ? `lane tự merge (${(p.mergeMethod || 'SQUASH').toLowerCase()})` : 'người merge');
  if (p.deployWait) s.push(`chờ deploy "${p.deployContext}" ≤ ${p.deployTimeoutMinutes || 30} phút`);
  if (p.testQc) s.push(`QC môi trường test${p.testQcOnFail === 'HUMAN' ? ' (đỏ → chờ người)' : ' (đỏ → tự mở PR sửa)'}`);
  if (p.ticket) s.push('ticket');
  return s;
}

export const SOURCE_LABEL = { profile: 'cấu hình gốc của profile', project: 'mặc định của dự án', lane: 'riêng của lane này' };
