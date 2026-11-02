// A project's master documents (run/projects/<pid>/docs): what the project chat approved, the base every
// new feature is designed on, and what lanes get in docs/ when they take a feature.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, D;
beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-pdocs-'));
  process.env.HARNESS_ROOT = tmp;
  D = await import('../server/services/projectdocs.js');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const ARCH = '# Kiến trúc\n\n## Lộ trình tính năng\n1. **Đăng nhập** — tài khoản\n\n## Quyết định\n- Spring';
const seed = pid => D.seedDocs(pid, { brief: '# Bán hàng', architecture: ARCH, design: '# Giao diện',
  mockups: [{ name: '01.html', html: '<html>Đăng nhập</html>' }] });
const feature = (slug, title) => ({ slug, title, brief: `# ${title}\n\n## Tiêu chí chấp nhận\n1. Có nút`,
  architecture: `# ${title} — thay đổi`, design: '', mockups: [] });

describe('project docs', () => {
  it('seeds once and reads back', () => {
    expect(D.hasDocs('p1')).toBe(false);
    seed('p1');
    expect(D.hasDocs('p1')).toBe(true);
    D.seedDocs('p1', { brief: 'khác', architecture: '', design: '', mockups: [] });
    const d = D.readDocs('p1');
    expect(d.brief).toBe('# Bán hàng');
    expect(d.mockups).toEqual([{ name: '01.html', html: '<html>Đăng nhập</html>' }]);
    expect(d.features).toEqual([]);
  });

  it('adds features to the roadmap, numbered, without losing one', () => {
    seed('p2');
    D.addFeature('p2', feature('xuat-excel', 'Xuất Excel'));
    D.addFeature('p2', feature('in-hoa-don', 'In hoá đơn'));
    const d = D.readDocs('p2');
    expect(d.architecture).toContain('2. **Xuất Excel** — (Đã duyệt — chưa làm) xem features/xuat-excel/');
    expect(d.architecture).toContain('3. **In hoá đơn** — (Đã duyệt — chưa làm) xem features/in-hoa-don/');
    expect(d.architecture).toContain('## Quyết định');
    expect(d.features).toEqual([{ slug: 'xuat-excel', title: 'Xuất Excel', status: 'approved' },
      { slug: 'in-hoa-don', title: 'In hoá đơn', status: 'approved' }]);
  });

  it('creates the roadmap section when there is none', () => {
    D.seedDocs('p3', { brief: 'b', architecture: '# Kiến trúc', design: '', mockups: [] });
    D.addFeature('p3', feature('a', 'A'));
    expect(D.readDocs('p3').architecture).toMatch(/## Lộ trình tính năng\n1\. \*\*A\*\*/);
  });

  it('relabels a feature when it is built or dropped', () => {
    seed('p4');
    D.addFeature('p4', feature('xuat-excel', 'Xuất Excel'));
    D.setFeatureStatus('p4', 'xuat-excel', 'done');
    expect(D.readDocs('p4').architecture).toContain('**Xuất Excel** — (Đã có)');
    D.setFeatureStatus('p4', 'xuat-excel', 'dropped');
    expect(D.readDocs('p4').architecture).toContain('**Xuất Excel** — (Đã bỏ)');
    expect(D.readDocs('p4').features[0].status).toBe('dropped');
    expect(() => D.setFeatureStatus('p4', 'xuat-excel', 'xyz')).toThrow();
  });

  it('copies the docs into a git-ignored folder of the lane and points the profile at it', () => {
    seed('p5');
    D.addFeature('p5', feature('xuat-excel', 'Xuất Excel'));
    const lane = fs.mkdtempSync(path.join(tmp, 'lane-'));
    expect(D.syncToLane('p5', lane)).toBe(true);
    expect(fs.readFileSync(path.join(lane, '.shipyard-docs/product-brief.md'), 'utf8')).toBe('# Bán hàng');
    expect(fs.readFileSync(path.join(lane, '.shipyard-docs/architecture.md'), 'utf8')).toContain('Xuất Excel');
    expect(fs.existsSync(path.join(lane, '.shipyard-docs/design/mockups/01.html'))).toBe(true);
    expect(fs.existsSync(path.join(lane, '.shipyard-docs/features/xuat-excel/product-brief.md'))).toBe(true);
    const prof = fs.mkdtempSync(path.join(tmp, 'prof-'));
    fs.writeFileSync(path.join(prof, 'project-docs.json'), JSON.stringify({ brief: 'docs/x.md', other: ['docs/y.md'] }));
    D.pointProfile(prof);
    expect(JSON.parse(fs.readFileSync(path.join(prof, 'project-docs.json'), 'utf8'))).toEqual({ ...D.LANE_LOCATIONS, other: ['docs/y.md'] });
  });

  it('seeds an older project from the docs already in its repo', () => {
    const repo = fs.mkdtempSync(path.join(tmp, 'repo-'));
    fs.mkdirSync(path.join(repo, 'docs/design/mockups'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs/product-brief.md'), '# Cũ');
    fs.writeFileSync(path.join(repo, 'docs/design/mockups/a.html'), '<html></html>');
    D.seedFromRepo('p6', repo);
    expect(D.readDocs('p6').brief).toBe('# Cũ');
    expect(D.readDocs('p6').mockups.map(m => m.name)).toEqual(['a.html']);
    D.seedFromRepo('p7', null);
    expect(D.hasDocs('p7')).toBe(false);
  });

  it('refuses a bad project id', () => {
    expect(() => D.docsDir('../x')).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('project features list', () => {
  it('lists the roadmap with where each feature stands', () => {
    const arch = '## Lộ trình tính năng\n1. **Đăng nhập** — tài khoản (Đã có)\n2. **Khoá học** — danh sách\n3. **Bài giảng** — video\n4. **Thanh toán** — online\n5. **Xuất Excel** — (Đã duyệt — chưa làm) xem features/xuat-excel/\n6. **Chat** — (Đã bỏ) xem features/chat/\n\n## Rủi ro\n- x';
    const queue = { items: [{ slug: 'bai-giang', title: 'Bài giảng' }, { slug: 'xuat-excel', title: 'Xuất Excel' }], assigned: [{ slug: 'khoa-hoc', title: 'Khoá học', lane: 3 }] };
    expect(D.featureList(arch, queue)).toEqual([
      { title: 'Đăng nhập', text: 'tài khoản', status: 'done' },
      { title: 'Khoá học', text: 'danh sách', status: 'building', lane: 3 },
      { title: 'Bài giảng', text: 'video', status: 'waiting', position: 1 },
      { title: 'Thanh toán', text: 'online', status: 'planned' },
      { title: 'Xuất Excel', text: '', status: 'waiting', position: 2 },
      { title: 'Chat', text: '', status: 'dropped' },
    ]);
    expect(D.featureList('', { items: [], assigned: [] })).toEqual([]);
  });
  it('a roadmap feature from the first architecture is marked built by its title', () => {
    D.seedDocs('p8', { brief: '# B', architecture: '## Lộ trình tính năng\n1. **Đăng nhập** — tài khoản\n2. **Khoá học** — danh sách (Đã có)\n', design: '', mockups: [] });
    D.setFeatureStatus('p8', 'dang-nhap', 'done', 'Đăng nhập');
    expect(D.readDocs('p8').architecture).toContain('1. **Đăng nhập** — tài khoản (Đã có)');
    D.setFeatureStatus('p8', 'dang-nhap', 'done', 'Đăng nhập');
    expect(D.readDocs('p8').architecture.match(/\(Đã có\)/g)).toHaveLength(2);
  });
});

