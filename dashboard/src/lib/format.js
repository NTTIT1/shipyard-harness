import { tr } from './i18n.js';
export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** "45 giây", "12 phút", "3 giờ 5 phút", "2 ngày 4 giờ": two units at most, the reader wants magnitude. */
export function fmtDur(s) {
  if (s == null || Number.isNaN(Number(s))) return '—';
  s = Math.max(0, Math.round(Number(s)));
  if (s < 60) return tr('{0} giây', [s]);
  if (s < 3600) return tr('{0} phút', [Math.floor(s / 60)]);
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return m ? tr('{0} giờ {1} phút', [h, m]) : tr('{0} giờ', [h]); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return h ? tr('{0} ngày {1} giờ', [d, h]) : tr('{0} ngày', [d]);
}

/** Heartbeat age: ["3 phút trước", recency class]. */
export function fmtAge(s) {
  if (s == null) return ['—', ''];
  const cls = s < 120 ? 'hb-fresh' : s < 900 ? 'hb-warn' : 'hb-stale';
  return [s < 5 ? tr('vừa xong') : tr('{0} trước', [fmtDur(s)]), cls];
}

// Heartbeat colour follows LIVENESS, not raw age: a DEAD lane is loud red, an
// IDLE lane is muted (its old heartbeat is expected and fine), and an ACTIVE lane
// keeps the fresh→warn recency shading from fmtAge.
export function hbClass(liveness, ageCls) {
  if (liveness === 'dead') return 'hb-dead';
  if (liveness === 'idle') return 'hb-idle';
  return ageCls;
}

export function fmtWhen(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return fmtAge((Date.now() - t) / 1000)[0];
}

export function prNum(u) {
  const m = /\/pull\/(\d+)/.exec(u || '');
  return m ? '#' + m[1] : 'PR';
}
