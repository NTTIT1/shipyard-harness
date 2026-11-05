// Per-step workflow settings (stored on the project, frozen into each run, enforced by the lane:
// bin/run-step.sh + bin/step_guard.py, conditions by the orchestrator). Pure helpers, unit-tested.
import { STEP_LABEL } from './review.js';
import { geminiModel } from './modelPresets.js';
import { tr } from './i18n.js';

export const CONDITIONS = [
  { id: 'ALWAYS', label: tr('Luôn chạy') },
  { id: 'HAS_UI', label: tr('Chỉ khi tính năng có giao diện') },
  { id: 'PREV_PASSED', label: tr('Chỉ khi bước trước đạt (CI/test xanh)') },
];
export const ON_FAILURE = [
  { id: 'ESCALATE_HUMAN', label: tr('Chuyển con người') },
  { id: 'RETRY', label: tr('Tự thử lại theo số vòng') },
  { id: 'FAIL_RUN', label: tr('Dừng cả quy trình') },
];

/** Documents a step can be told to read. A bare name lives in the feature's spec folder. */
export const KNOWN_INPUTS = [
  { path: 'request.md', label: tr('Yêu cầu gốc') },
  { path: 'spec.md', label: 'Spec (PM)' },
  { path: 'ba.md', label: tr('Nghiệp vụ (BA)') },
  { path: 'plan.md', label: tr('Kế hoạch (Plan)') },
  { path: 'tasks.md', label: tr('Danh sách task') },
  { path: 'entities.json', label: tr('Thực thể dữ liệu') },
  { path: 'design.md', label: tr('Thiết kế UI') },
  { path: 'qc-plan.md', label: tr('Kế hoạch test') },
  { path: 'docs/architecture.md', label: tr('Kiến trúc dự án') },
  { path: 'docs/product-brief.md', label: tr('Bản yêu cầu sản phẩm') },
  { path: 'docs/design', label: tr('Mockup đã duyệt') },
];
export const INPUT_RE = /^[A-Za-z0-9._/@-]{1,200}$/;
export const validInput = p => INPUT_RE.test(p) && !p.includes('..') && !p.startsWith('/');

/** What the lane actually runs inside each phase, before its human gate (the "detailed" view). */
export const PHASE_WORK = {
  PM: [['AI PM', tr('viết spec.md: user story, tiêu chí nghiệm thu')]],
  BA: [['AI BA', tr('viết ba.md: luồng, quy tắc nghiệp vụ, dữ liệu')]],
  ARCH: [[tr('AI Kiến trúc sư'), tr('plan.md, tasks.md, entities.json; quyết định có giao diện hay không')], [tr('AI phản biện plan'), tr('soi lỗ hổng của kế hoạch')]],
  DESIGN: [[tr('AI Thiết kế'), tr('mockup HTML + ảnh desktop/mobile, design.md')]],
  DEV: [['Code', tr('phiên chính của lane hoặc OpenHands trong hộp kín')], ['CI + e2e', tr('build, test, kiểm tra trước khi đẩy')], ['AI review code', tr('soát lỗi trước khi duyệt')]],
  TESTCASE: [[tr('AI Thiết kế ca kiểm thử'), tr('qc-plan.md: mã TC, bước, kết quả mong đợi, độ phủ tiêu chí nghiệm thu — người duyệt trước khi code')]],
  SECURITY: [[tr('Quét tự động'), tr('bí mật trong code, gitleaks, semgrep, thư viện có lỗ hổng (công cụ nào có trên máy)')], [tr('AI Bảo mật'), tr('rà soát diff theo OWASP Top 10 và phân quyền, viết security-report.md')]],
  TEST: [['AI Tester', tr('chạy từng ca kiểm thử đã duyệt + test tự động')], [tr('QC trên trình duyệt'), tr('chụp ảnh bằng chứng cho từng ca')],
    [tr('Báo cáo & bug'), tr('test-report.md, bugs.csv; ghi bug vào Jira / GitHub / Google Sheets nếu đã cấu hình')]],
};

/** Phase → the model step id the lane resolves (Giao việc / lane defaults use the same ids). */
export const PHASE_MODEL_STEP = { PM: 'pm', BA: 'ba', ARCH: 'arch', DESIGN: 'design', TESTCASE: 'testcase', DEV: 'dev', SECURITY: 'security', TEST: 'test' };

const fmtVnd = n => `${Number(n).toLocaleString('vi-VN')} ₫`;
const shortModel = m => (m ? m.replace(/^claude:/, '').replace(/^openhands:/, 'OpenHands · ') : '');

/** One-line summary of a step's guardrails for the canvas node ('' when nothing is set). */
export function configSummary(cfg = {}) {
  const parts = [];
  if (cfg.timeoutMinutes) parts.push(tr('{0} phút', [cfg.timeoutMinutes]));
  if (cfg.onFailure === 'RETRY') parts.push(tr('thử lại {0} lần', [cfg.maxRetries ?? 0]));
  if (cfg.onFailure === 'FAIL_RUN') parts.push(tr('lỗi → dừng quy trình'));
  if (cfg.budgetVnd) parts.push(tr('trần {0}', [fmtVnd(cfg.budgetVnd)]));
  if (cfg.condition === 'HAS_UI') parts.push(tr('khi có giao diện'));
  if (cfg.condition === 'PREV_PASSED') parts.push(tr('khi bước trước đạt'));
  if (cfg.requiredInputs?.length) parts.push(tr('{0} đầu vào', [cfg.requiredInputs.length]));
  return parts.join(' · ');
}
export const modelLabel = (cfg = {}) => shortModel(cfg.model) || tr('model mặc định');

/** Clean a step's settings the way the orchestrator will (it re-validates strictly). */
export function cleanConfig(step, cfg = {}) {
  const out = {};
  if (cfg.model) out.model = cfg.model;
  const int = (k, lo, hi) => {
    if (cfg[k] === '' || cfg[k] == null) return;
    const n = Math.round(Number(cfg[k]));
    if (Number.isFinite(n)) out[k] = Math.max(lo, Math.min(hi, n));
  };
  int('maxRetries', 0, 5);
  int('timeoutMinutes', 1, 480);
  int('budgetVnd', 0, 1e9);
  if (cfg.condition && cfg.condition !== 'ALWAYS' && step !== 'DEV') out.condition = cfg.condition;
  if (cfg.onFailure && cfg.onFailure !== 'ESCALATE_HUMAN') out.onFailure = cfg.onFailure;
  const inputs = [...new Set((cfg.requiredInputs || []).map(s => String(s).trim()).filter(validInput))].slice(0, 20);
  if (inputs.length) out.requiredInputs = inputs;
  return out;
}

/** Problems that would make the server refuse the workflow, per step ('' when fine). */
export function configProblem(step, cfg = {}) {
  if (cfg.maxRetries !== undefined && cfg.maxRetries !== '' && !(Number(cfg.maxRetries) >= 0 && Number(cfg.maxRetries) <= 5)) return tr('Số vòng thử từ 0 đến 5');
  if (cfg.timeoutMinutes && !(Number(cfg.timeoutMinutes) >= 1 && Number(cfg.timeoutMinutes) <= 480)) return tr('Giới hạn từ 1 đến 480 phút');
  if (cfg.budgetVnd && !(Number(cfg.budgetVnd) >= 0)) return tr('Ngân sách phải là số ≥ 0');
  const bad = (cfg.requiredInputs || []).find(p => !validInput(p));
  if (bad) return tr('Đường dẫn không hợp lệ: {0}', [bad]);
  if (step === 'DEV' && cfg.condition && cfg.condition !== 'ALWAYS') return tr('Bước Code luôn chạy');
  return '';
}

/**
 * Sensible starting settings per role: strong model for analysis and architecture, the cheapest
 * configured model for testing, minute limits everywhere, and the documents each role really needs.
 */
export function suggestedConfigs(info) {
  const claude = info?.claude_models || [];
  const strong = claude.find(m => /opus/.test(m.id))?.id || claude[0]?.id;
  const cheap = claude.find(m => /haiku/.test(m.id))?.id || claude.find(m => /sonnet/.test(m.id))?.id || strong;
  const m = id => (id ? `claude:${id}` : '');
  // With Gemini set up: the token-saving split (lib/modelPresets.js) — Gemini writes, Claude plans.
  const g = geminiModel(info);
  if (g) {
    const sonnet = claude.find(x => /sonnet/.test(x.id))?.id || strong;
    return {
      PM: { model: g, timeoutMinutes: 20, requiredInputs: ['request.md'] },
      BA: { model: g, timeoutMinutes: 20, requiredInputs: ['spec.md'] },
      ARCH: { model: m(sonnet), timeoutMinutes: 45, maxRetries: 1, onFailure: 'RETRY' },
      DESIGN: { model: g, timeoutMinutes: 30, condition: 'HAS_UI' },
      TESTCASE: { model: g, timeoutMinutes: 20 },
      DEV: {},
      // Reading code for vulnerabilities needs a strong reasoner: Claude even in the token-saving split.
      SECURITY: { model: m(sonnet), timeoutMinutes: 30, maxRetries: 1, onFailure: 'RETRY' },
      TEST: { model: g, timeoutMinutes: 30, maxRetries: 2, onFailure: 'RETRY', condition: 'PREV_PASSED' },
    };
  }
  return {
    PM: { model: m(strong), timeoutMinutes: 30, requiredInputs: ['request.md'] },
    BA: { model: m(strong), timeoutMinutes: 30, requiredInputs: ['spec.md'] },
    ARCH: { model: m(strong), timeoutMinutes: 45, maxRetries: 1, onFailure: 'RETRY' },
    DESIGN: { model: m(strong), timeoutMinutes: 45, condition: 'HAS_UI' },
    TESTCASE: { model: m(strong), timeoutMinutes: 30 },
    DEV: {},
    SECURITY: { model: m(strong), timeoutMinutes: 30, maxRetries: 1, onFailure: 'RETRY' },
    TEST: { model: m(cheap), timeoutMinutes: 60, maxRetries: 2, onFailure: 'RETRY', condition: 'PREV_PASSED' },
  };
}

export const phaseName = s => STEP_LABEL[s] || s;

/** The models a project's workflow sets, keyed by the lane's model step ids ({ arch: 'claude:…' }). */
export function workflowModels(workflow) {
  const out = {};
  for (const w of workflow || []) {
    const id = PHASE_MODEL_STEP[w.step];
    if (id && w.mode !== 'SKIP' && w.config?.model) out[id] = w.config.model;
  }
  return out;
}
