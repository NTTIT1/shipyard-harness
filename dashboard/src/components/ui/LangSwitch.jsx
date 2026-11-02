import React from 'react';
import { Languages } from 'lucide-react';
import { LANGS, lang, setLang, tr } from '../../lib/i18n.js';

/** Interface language picker; choosing one reloads the page in that language. */
export default function LangSwitch({ className = '' }) {
  return (
    <label className={`lang-switch ${className}`} title={tr('Ngôn ngữ giao diện')}>
      <Languages size={14} strokeWidth={1.75} aria-hidden="true" />
      <select aria-label={tr('Ngôn ngữ giao diện')} value={lang} onChange={e => setLang(e.target.value)}>
        {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}
