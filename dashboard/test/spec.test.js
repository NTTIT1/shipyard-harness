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
