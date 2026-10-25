// "Claude + Gemini" split, tuned for tokens: Claude Code does what breaks a feature when it is wrong
// (driving the lane, writing code, architecture, browser QC, the final gate); Gemini Flash does the
// writing and the second opinions (specs, business analysis, mockups, test plans, plan critique, code
// review). A different model reviewing Claude's plan and code catches what one model alone misses.

/** The Gemini model to use: the first of these the provider lists (tested through the gateway). */
const GEMINI_PREFERRED = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
const CLAUDE = 'claude:claude-sonnet-5-5';

export function geminiModel(info) {
  const listed = info?.providers?.gemini?.models || [];
  const id = GEMINI_PREFERRED.find(m => listed.includes(m));
  return id ? `gemini:${id}` : '';
}

/** Which AI does each lane step, and why (shown on the dashboard). */
export const SPLIT = {
  main: ['claude', 'điều phối cả quy trình, git, gộp code, chạy app — dài, nhiều thao tác'],
  dev: ['claude', 'viết code — quyết định app chạy được'],
  pm: ['gemini', 'viết spec từ yêu cầu'],
  ba: ['gemini', 'viết nghiệp vụ'],
  arch: ['claude', 'kế hoạch kỹ thuật — sai từ đây là sai cả tính năng'],
  design: ['gemini', 'mockup theo thiết kế đã duyệt'],
  test: ['gemini', 'kế hoạch test'],
  'plan-critic': ['gemini', 'phản biện plan của Claude — góc nhìn thứ hai'],
  'impl-worker': ['claude', 'code song song'],
  'code-review': ['gemini', 'review code của Claude — góc nhìn thứ hai'],
  'qc-local': ['claude', 'điều khiển trình duyệt nhiều bước'],
  'senior-gate': ['claude', 'quyết định cuối có cho gộp/mở PR'],
  ticketer: ['gemini', 'viết ticket'],
  'dev-qc': ['claude', 'QC trình duyệt trên môi trường test'],
};

/**
 * The split as a lane/defaults model config ({ step: "provider:model", effort }). Steps not listed
 * keep their value; `null` when Gemini is not set up yet.
 */
export function claudeGeminiModels(info, current = {}) {
  const g = geminiModel(info);
  if (!g) return null;
  const out = { ...current };
  for (const [step, [ai]] of Object.entries(SPLIT)) out[step] = ai === 'claude' ? CLAUDE : g;
  // Thinking costs tokens: only where it pays off.
  out.effort = { ...(current.effort || {}), main: 'medium', dev: 'medium', arch: 'high', 'senior-gate': 'medium', 'qc-local': 'low', 'dev-qc': 'low', 'impl-worker': 'medium' };
  return out;
}

/** The idea chat: Gemini asks and writes the brief and mockups, Claude designs the system. */
export function claudeGeminiStudio(info) {
  const g = geminiModel(info);
  return g ? { pm: g, arch: CLAUDE, design: g } : null;
}
