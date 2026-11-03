import { tr } from './i18n.js';
import { fmtUsd, fmtTokens, fmtVnd } from './costs.js';

// Quota checks (server/services/quota.js) as people read them.

export const QUOTA_TONE = { ok: 'ok', warn: 'warn', blocked: 'danger' };

/** "$4.20 / $10.00" in the check's own unit. */
export function quotaAmounts(c) {
  const f = v => (c.unit === 'usd' ? fmtUsd(v) : c.unit === 'tokens' ? `${fmtTokens(v)} token` : c.unit === 'vnd' ? fmtVnd(v) : `${Math.round(v)}%`);
  if (c.scope === 'plan') return c.level === 'blocked' ? tr('Anthropic đã tạm khoá') : tr('đã dùng {0}%', [Math.round(c.pct)]);
  if (c.enforced === false) return tr('{0} · chưa đặt riêng', [f(c.used)]);
  return `${f(c.used)} / ${f(c.limit)}`;
}

const planName = k => ({ five_hour: tr('Gói Claude · 5 giờ'), seven_day: tr('Gói Claude · 7 ngày'),
  seven_day_opus: tr('Gói Claude · 7 ngày (Opus)'), seven_day_sonnet: tr('Gói Claude · 7 ngày (Sonnet)') }[k] || tr('Gói Claude · {0}', [k]));

/** What the limit is, in words: "Hạn mức chung tháng", "Dự án HRM", "Lane 3", "Model claude-opus-5-5"… */
export function quotaTitle(c, projectName = id => id) {
  if (c.scope === 'month') return tr('Hạn mức chung tháng');
  if (c.scope === 'project') return tr('Dự án {0}', [projectName(c.key)]);
  if (c.scope === 'lane') return tr('Lane {0}', [c.key]);
  if (c.scope === 'model') return tr('Model {0}', [c.key]);
  if (c.scope === 'phase') return tr('Ngân sách bước {0}', [c.key]);
  if (c.scope === 'plan') return planName(c.key);
  return c.label || c.id;
}

/** The state chip: "Ổn" / "Sắp chạm" / "Đã chặn" / "Theo hạn mức chung". */
export function quotaState(c) {
  if (c.enforced === false) return { tone: 'neutral', label: tr('Theo hạn mức chung') };
  if (c.level === 'blocked') return { tone: 'danger', label: c.scope === 'plan' ? tr('Đang khoá') : tr('Đã chặn') };
  if (c.level === 'warn') return { tone: 'warn', label: tr('Sắp chạm') };
  return { tone: 'ok', label: tr('Ổn') };
}

/** Quick grant amounts in the check's unit. */
export function grantSteps(c) {
  if (c.unit === 'tokens') return [1e6, 5e6, 20e6];
  if (c.unit === 'vnd') return [50000, 200000, 500000];
  return [5, 20, 50];
}
export function grantLabel(c, v) {
  return c.unit === 'tokens' ? `+${fmtTokens(v)}` : c.unit === 'vnd' ? `+${fmtVnd(v)}` : `+${fmtUsd(v)}`;
}

/** Why the reset applies wider than this lane (the month, a model, a project are shared). */
export function resetScopeNote(c) {
  if (c.scope === 'lane') return tr('Chỉ đặt lại bộ đếm của lane này.');
  if (c.scope === 'month') return tr('Bộ đếm chung: mọi lane được tính lại từ 0.');
  if (c.scope === 'model') return tr('Bộ đếm của model: mọi lane dùng model này được tính lại.');
  if (c.scope === 'project') return tr('Bộ đếm của dự án: mọi lane của dự án được tính lại.');
  return '';
}

/** Fill of a meter, 0–100. */
export const meterPct = c => Math.max(0, Math.min(100, Number(c.pct) || 0));
