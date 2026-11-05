// Feedback item 5: a project created from the company's own framework, with or without its sample code.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { normalizeFramework, saveFrameworks, readFrameworks, frameworkStack, applyFramework, replacements, namesFor } from '../server/services/scaffold/frameworks.js';
import { publicCatalog, validateRequest, STACKS } from '../server/services/scaffold/catalog.js';
import { run } from '../server/services/scaffold/util.js';

const ID = ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...a) => { const r = spawnSync('git', [...ID, ...a], { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); };
const put = (dir, f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };

const FW = {
  id: 'acme-spring', label: 'ACME Spring', language: 'java', repoUrl: '', branch: 'main', packageBase: 'com.acme',
  replace: [{ from: 'com.acme.starter', to: 'package' }, { from: 'acme-starter', to: 'slug' }, { from: 'AcmeStarter', to: 'pascal' }],
  samples: ['src/main/java/com/acme/starter/sample', 'docs/sample.md'], remove: ['.github/workflows/release-framework.yml'],
  commands: { dev: './mvnw spring-boot:run', test: './mvnw test' },
};

function frameworkRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
  const src = path.join(tmp, 'fw');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  put(src, 'pom.xml', '<artifactId>acme-starter</artifactId><groupId>com.acme</groupId>');
  put(src, 'src/main/java/com/acme/starter/AcmeStarterApplication.java', 'package com.acme.starter;\nclass AcmeStarterApplication {}\n');
  put(src, 'src/main/java/com/acme/starter/sample/HelloController.java', 'package com.acme.starter.sample;\n');
  put(src, 'docs/sample.md', '# mẫu');
  put(src, 'README.md', '# ACME starter — công ty');
  put(src, '.github/workflows/ci.yml', 'name: acme-ci');
  put(src, '.github/workflows/release-framework.yml', 'name: release');
  fs.writeFileSync(path.join(src, 'logo.png'), Buffer.from([0x89, 0x50, 0, 0, 0x61, 0x63, 0x6d, 0x65]));
  git(src, 'add', '-A'); git(src, 'commit', '-qm', 'framework');
  return { tmp, src };
}

describe('company framework settings', () => {
  it('checks every field and refuses what could reach a shell or escape the project', () => {
    expect(normalizeFramework({ ...FW, repoUrl: 'https://git.acme.vn/fw/spring.git' })).toMatchObject({ id: 'acme-spring', port: 8080 });
    const ok = { ...FW, repoUrl: '/srv/git/fw' };
    expect(() => normalizeFramework({ ...ok, repoUrl: 'file:///etc' })).toThrow(/repo/);
    expect(() => normalizeFramework({ ...ok, repoUrl: '--upload-pack=x' })).toThrow(/repo/);
    expect(() => normalizeFramework({ ...ok, branch: '--force' })).toThrow(/nhánh/);
    expect(() => normalizeFramework({ ...ok, samples: ['../x'] })).toThrow(/đường dẫn/);
    expect(() => normalizeFramework({ ...ok, replace: [{ from: 'acme', to: 'rm' }] })).toThrow(/slug, name/);
    expect(() => normalizeFramework({ ...ok, packageBase: '' })).toThrow(/gốc package/);
    expect(() => normalizeFramework({ ...ok, verify: 'mvn test; rm -rf /' })).toThrow(/đơn giản/);
    expect(normalizeFramework({ ...ok, samples: 'a/b,\nc/' }).samples).toEqual(['a/b', 'c']);
  });
  it('saves and reads the list; ids are unique', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fwf-')), 'frameworks.json');
    saveFrameworks([{ ...FW, repoUrl: '/srv/git/fw' }], f);
    expect(readFrameworks(f).map(x => x.id)).toEqual(['acme-spring']);
    expect(() => saveFrameworks([{ ...FW, repoUrl: '/a' }, { ...FW, repoUrl: '/b' }], f)).toThrow(/trùng/);
  });
  it('renames dotted names in paths too, longest first', () => {
    const fw = normalizeFramework({ ...FW, repoUrl: '/x' });
    const n = namesFor({ slug: 'kho-hang', name: 'Kho hàng' }, fw);
    expect(n).toMatchObject({ package: 'com.acme.kho_hang', pascal: 'KhoHang', snake: 'kho_hang' });
    const pairs = replacements(fw, n);
    expect(pairs).toContainEqual(['com/acme/starter', 'com/acme/kho_hang']);
    expect(pairs.findIndex(p => p[0] === 'com.acme.starter')).toBeLessThan(pairs.findIndex(p => p[0] === 'acme-starter'));
  });
});

describe('a project from the framework', () => {
  const make = async samples => {
    const { tmp, src } = frameworkRepo();
    const fw = normalizeFramework({ ...FW, repoUrl: src });
    const stack = frameworkStack(fw);
    const dir = path.join(tmp, 'kho-hang');
    const log = [];
    await stack.generate({ dir, parentDir: tmp, slug: 'kho-hang', name: 'Kho hàng', options: { samples }, run, log: l => log.push(l) });
    return { dir, log };
  };
  it('copies it with the new names, keeps the sample code, drops history and framework-only files', async () => {
    const { dir, log } = await make(true);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'pom.xml'), 'utf8')).toContain('<artifactId>kho-hang</artifactId>');
    const app = path.join(dir, 'src/main/java/com/acme/kho_hang/KhoHangApplication.java');
    expect(fs.readFileSync(app, 'utf8')).toBe('package com.acme.kho_hang;\nclass KhoHangApplication {}\n');
    expect(fs.existsSync(path.join(dir, 'src/main/java/com/acme/kho_hang/sample/HelloController.java'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'src/main/java/com/acme/starter'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.github/workflows/release-framework.yml'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, '.github/workflows/ci.yml'), 'utf8')).toBe('name: acme-ci');
    expect(fs.readFileSync(path.join(dir, 'logo.png'))[2]).toBe(0); // binary untouched
    expect(log.join('\n')).toMatch(/Đổi tên ở \d+ file/);
  });
  it('leaves the sample code out when asked', async () => {
    const { dir } = await make(false);
    expect(fs.existsSync(path.join(dir, 'src/main/java/com/acme/kho_hang/sample'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'docs/sample.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'src/main/java/com/acme/kho_hang/KhoHangApplication.java'))).toBe(true);
  });
  it('never writes outside the project', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fwx-'));
    put(d, 'a.txt', 'x');
    const fw = normalizeFramework({ ...FW, repoUrl: '/x', replace: [{ from: 'a.txt', to: 'slug' }] });
    applyFramework(d, fw, { slug: 'ok-name', name: 'n' });
    expect(fs.existsSync(path.join(d, 'ok-name'))).toBe(true);
  });
  it('shows up in the "Từ khung" catalog and passes the wizard checks', () => {
    const stack = frameworkStack(normalizeFramework({ ...FW, repoUrl: '/srv/git/fw' }));
    const stacks = [...STACKS, stack];
    const cat = publicCatalog({ git: { ok: true } }, stacks);
    const lang = cat.languages.find(l => l.id === 'company-java');
    expect(lang.stacks[0]).toMatchObject({ id: 'fw-acme-spring', company: true, available: true });
    const spec = validateRequest({ name: 'Kho hàng', slug: 'kho-hang', stack: 'fw-acme-spring', options: { samples: false } }, { git: { ok: true } }, stacks);
    expect(spec.options).toEqual({ samples: false, db: 'none' });
  });
});
