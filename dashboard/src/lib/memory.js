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

/** What the row says next to its kind badge. */
export function memoryLabel(it) {
  const p = parts(it.title);
  switch (it.kind) {
    // the step and the file are always the last two parts; the feature title may itself contain " — "
    case 'ARTIFACT': return p.length >= 3 ? `${p[p.length - 2]} · ${p[p.length - 1]}` : it.title;
    case 'DECISION': return 'Quyết định kiến trúc';
    case 'FEATURE_SUMMARY': return 'Tóm tắt khi hoàn tất';
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
