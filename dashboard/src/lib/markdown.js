import { marked } from 'marked';
import DOMPurify from 'dompurify';

// AI documents are untrusted: always sanitize the rendered HTML (spec §9).
export function renderMarkdown(md) {
  if (!md) return '';
  return DOMPurify.sanitize(marked.parse(String(md), { gfm: true, breaks: false }), { USE_PROFILES: { html: true } });
}
