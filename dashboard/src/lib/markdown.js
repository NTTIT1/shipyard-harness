import { marked } from 'marked';
import DOMPurify from 'dompurify';

// AI documents are untrusted (spec §9): no scripts, no forms/inputs, no inline styles (fake overlays),
// and no remote images (tracking pixels) — only the dashboard's own /spec and /proof images.
const FORBID_TAGS = ['form', 'input', 'button', 'select', 'textarea', 'option', 'style', 'iframe', 'object', 'embed'];
let hooked = false;

function hook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'IMG' && !/^\/(spec|proof)\//.test(node.getAttribute('src') || '')) node.remove();
  });
}

export function renderMarkdown(md) {
  if (!md) return '';
  hook();
  return DOMPurify.sanitize(marked.parse(String(md), { gfm: true, breaks: false }),
    { USE_PROFILES: { html: true }, FORBID_TAGS, FORBID_ATTR: ['style'] });
}
