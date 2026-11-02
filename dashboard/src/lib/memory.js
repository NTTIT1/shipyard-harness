import { tr } from './i18n.js';
// Memory items are titled by the context service, e.g.
//   ARTIFACT        "<feature> — <STEP> — <file>"
//   DECISION        "Quyết định kiến trúc — <feature>"
//   FEATURE_SUMMARY "Tính năng: <feature>"
//   FEEDBACK        "Góp ý của <role> — <STEP> — <feature>"
//   HUMAN_EDIT      "<role> sửa <file> — <STEP> — <feature>"
// These helpers turn that into a feature group name, a short row label and a one-line preview.

const parts = t => String(t || '').split(' — ').map(s => s.trim());

/** The feature (run) an item belongs to, for grouping. */
export function memoryFeature(it) {
  const p = parts(it.title);
  switch (it.kind) {
    case 'ARTIFACT': return p.length >= 3 ? p.slice(0, -2).join(' — ') : p[0];
    case 'DECISION': return p.slice(1).join(' — ') || p[0];
    case 'FEATURE_SUMMARY': return String(it.title || '').replace(/^Tính năng:\s*/, '');
    case 'FEEDBACK':
    case 'HUMAN_EDIT': return p[p.length - 1];
    default: return p[0];
  }
}

// A document approved in a project chat (runId "chat:<session>"): named by what it is.
const CHAT_DOC = { PM: 'Yêu cầu sản phẩm', ARCH: 'Thiết kế hệ thống', DESIGN: 'Thiết kế giao diện' };
const fromChat = it => String(it.runId || '').startsWith('chat:');

/** What the row says next to its kind badge. */
export function memoryLabel(it) {
  const p = parts(it.title);
  if (it.kind === 'ARTIFACT' && fromChat(it) && CHAT_DOC[p[p.length - 2]]) return tr(CHAT_DOC[p[p.length - 2]]);
  switch (it.kind) {
    // the step and the file are always the last two parts; the feature title may itself contain " — "
    case 'ARTIFACT': return p.length >= 3 ? `${p[p.length - 2]} · ${p[p.length - 1]}` : it.title;
    case 'DECISION': return tr('Quyết định kiến trúc');
    case 'FEATURE_SUMMARY': return tr('Tóm tắt khi hoàn tất');
    case 'FEEDBACK': return p.length >= 2 ? `${p[0]} · ${p[1]}` : it.title;
    case 'HUMAN_EDIT': return p.length >= 2 ? `${p[0]} · ${p[1]}` : it.title;
    default: return it.title;
  }
}

/** First meaningful line of the content, without markdown furniture. */
export function memoryPreview(content) {
  for (const raw of String(content || '').split('\n')) {
    const l = raw.replace(/^\s*(#{1,6}\s+|[-*>]\s+|\d+\.\s+|---+\s*$)/, '').replace(/[*_`]/g, '').trim();
    if (l && /[\p{L}\p{N}]/u.test(l) && !/^(title|created|spec|ba|plan):/i.test(l)) return l.length > 140 ? `${l.slice(0, 139)}…` : l;
  }
  return '';
}

/**
 * Items grouped by feature (run), oldest first inside a group. What the chat approved when the project was
 * created comes first and is pinned (the base of everything else); the other groups newest first.
 */
export function memoryGroups(items, kind = '') {
  const byRun = new Map();
  for (const it of (items || []).filter(i => !kind || i.kind === kind)) {
    const key = it.runId || '—';
    if (!byRun.has(key)) byRun.set(key, { key, name: '', latest: '', items: [], pinned: false });
    const g = byRun.get(key);
    g.items.push(it);
    g.name ||= memoryFeature(it);
    if (String(it.createdAt) > g.latest) g.latest = String(it.createdAt);
  }
  const out = [...byRun.values()];
  for (const g of out) {
    g.items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    g.pinned = g.key.startsWith('chat:') && g.name.startsWith('Tạo dự án');
  }
  return out.sort((a, b) => (b.pinned - a.pinned) || b.latest.localeCompare(a.latest));
}
