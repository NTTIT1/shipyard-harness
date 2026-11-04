// In-app confirmations replace window.confirm (the browser titles that one with the page's IP address).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { confirmDialog, registerDialogHost } from '../src/lib/dialog.js';

describe('confirmDialog', () => {
  it('goes to the mounted host and resolves with the answer', async () => {
    const seen = [];
    const off = registerDialogHost(req => { seen.push(req); req.resolve(true); });
    expect(await confirmDialog({ title: 'Xoá', message: 'Chắc chưa?', danger: true })).toBe(true);
    expect(seen[0]).toMatchObject({ title: 'Xoá', message: 'Chắc chưa?', danger: true });
    off();
  });
  it('the UI no longer calls window.confirm / alert anywhere', () => {
    const hits = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.jsx?$/.test(e.name) && !p.endsWith('lib/dialog.js') && /window\.(confirm|alert)\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
      }
    })(path.resolve(__dirname, '../src'));
    expect(hits).toEqual([]);
  });
});
