// UI language. The source text is the key — Vietnamese, or English on the few screens first written in
// English (vi.json translates those). tr('Lưu') shows the current language's entry when one exists,
// otherwise the key itself, so a missing translation never breaks a screen. {0} {1}… take args.
// The language is read once at load; switching reloads the page (every label, constants included, re-reads it).
import en from '../i18n/en.json' with { type: 'json' };
import ja from '../i18n/ja.json' with { type: 'json' };
import vi from '../i18n/vi.json' with { type: 'json' };

export const LANGS = [
  { id: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ja', label: '日本語', short: 'JA' },
];
const KEY = 'shipyard-lang';
function stored() { try { return localStorage.getItem(KEY); } catch { return null; } }

export const lang = LANGS.some(l => l.id === stored()) ? stored() : 'vi';
/** BCP-47 locale for dates and numbers in the current language. */
export const locale = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }[lang];
const DICT = { vi, en, ja }[lang];

export function tr(text, args) {
  const out = DICT[text] || text;
  return args ? out.replace(/\{(\d+)\}/g, (m, i) => (args[i] == null ? '' : String(args[i]))) : out;
}

export function setLang(id) {
  if (id === lang || !LANGS.some(l => l.id === id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked: stays Vietnamese */ }
  window.location.reload();
}
