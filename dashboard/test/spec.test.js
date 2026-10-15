// specFile() serves ONLY markdown inside the lane clone's specs/ dir.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, specFile;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spec-'));
  process.env.HARNESS_ROOT = path.join(tmp, 'harness');
  process.env.LANES_ROOT = path.join(tmp, 'lanes');
  const d = path.join(tmp, 'lanes', 'lane2', 'specs', '2026-10-12-x');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'spec.md'), '# x');
  fs.writeFileSync(path.join(d, 'secret.env'), 'K=V');
  fs.writeFileSync(path.join(tmp, 'lanes', 'lane2', 'README.md'), 'outside specs');
  ({ specFile } = await import('../server/services/spec.js'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('specFile', () => {
  it('serves a spec.md inside specs/', () => {
    expect(specFile(2, 'specs/2026-10-12-x/spec.md')).toMatch(/spec\.md$/);
  });
  it('refuses path traversal', () => {
    expect(specFile(2, 'specs/../../../../etc/passwd')).toBeNull();
  });
  it('refuses markdown outside specs/', () => {
    expect(specFile(2, 'README.md')).toBeNull();
  });
  it('refuses non-markdown files', () => {
    expect(specFile(2, 'specs/2026-10-12-x/secret.env')).toBeNull();
  });
  it('returns null for a lane without specs/', () => {
    expect(specFile(7, 'specs/a/spec.md')).toBeNull();
  });
});

describe('listSpecs', () => {
  it('lists spec dirs that have a spec.md', async () => {
    const { listSpecs } = await import('../server/services/spec.js');
    expect(listSpecs(2)).toEqual(['specs/2026-10-12-x']);
    expect(listSpecs(7)).toEqual([]);
  });
});

describe('specFile — design images', () => {
  it('serves images under specs/<dir>/design/ but not elsewhere', () => {
    const lane = path.join(process.env.LANES_ROOT, 'lane3');
    fs.mkdirSync(path.join(lane, 'specs', '2026-10-15-x', 'design'), { recursive: true });
    fs.writeFileSync(path.join(lane, 'specs', '2026-10-15-x', 'design', '01-list.png'), 'png');
    fs.writeFileSync(path.join(lane, 'specs', '2026-10-15-x', 'secret.png'), 'png');
    expect(specFile(3, 'specs/2026-10-15-x/design/01-list.png')).toMatch(/01-list\.png$/);
    expect(specFile(3, 'specs/2026-10-15-x/secret.png')).toBeNull();
    expect(specFile(3, 'specs/2026-10-15-x/design/../secret.png')).toBeNull();
  });
});
