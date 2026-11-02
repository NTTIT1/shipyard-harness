// UI language: Vietnamese by default, and every tr('…') in the UI has an English and a Japanese entry.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import { tr, lang } from '../src/lib/i18n.js';
import en from '../src/i18n/en.json';
import ja from '../src/i18n/ja.json';
import vi from '../src/i18n/vi.json';

const VI = /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵĐ]/;
function keysIn(dir, out = new Set()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) keysIn(p, out);
    else if (/\.jsx?$/.test(e.name)) {
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes('tr(')) continue;
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === 'tr' && n.arguments[0]?.type === 'StringLiteral') out.add(n.arguments[0].value);
        for (const k in n) if (k !== 'loc') walk(n[k]);
      })(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program);
    }
  }
  return out;
}
const placeholders = s => (s.match(/\{\d+\}/g) || []).sort().join();

describe('i18n', () => {
  it('defaults to Vietnamese and fills {n} placeholders', () => {
    expect(lang).toBe('vi');
    expect(tr('Lưu')).toBe('Lưu');
    expect(tr('Lane {0} (rảnh)', [3])).toBe('Lane 3 (rảnh)');
    expect(tr('chưa có bản dịch')).toBe('chưa có bản dịch');
  });
  it('has English and Japanese for every UI string', () => {
    const keys = [...keysIn(path.resolve(__dirname, '../src'))];
    expect(keys.length).toBeGreaterThan(1000);
    // English-source strings need no English entry; Vietnamese-source ones need both.
    expect(keys.filter(k => VI.test(k) && !en[k])).toEqual([]);
    expect(keys.filter(k => !ja[k])).toEqual([]);
    expect(keys.filter(k => !VI.test(k) && !vi[k] && !en[k])).toEqual([]);
  });
  it('keeps the same placeholders in every translation', () => {
    for (const d of [en, ja, vi]) for (const [k, v] of Object.entries(d)) expect([k, placeholders(v)]).toEqual([k, placeholders(k)]);
  });
});
