// Pure helpers behind "Tạo dự án" (3 ways to start) and the project chat screen.
import { describe, it, expect } from 'vitest';
import { startBody, startProblem, threadStatus, moveItem, isDraft, draftStep } from '../src/lib/studio.js';

describe('create project — start body', () => {
  it('an idea is its text; a template adds the stack', () => {
    expect(startBody('idea', { text: '  Bán hàng 5 cửa hàng ' })).toEqual({ kind: 'idea', text: 'Bán hàng 5 cửa hàng' });
    const template = { kind: 'fullstack', stack: 'java-spring', options: { db: 'mysql' }, frontend: { stack: 'ts-react-vite', options: {} } };
    expect(startBody('template', { text: 'Bán hàng 5 cửa hàng', template }))
      .toEqual({ kind: 'template', text: 'Bán hàng 5 cửa hàng', template });
    expect(startBody('template', { text: 'Bán hàng 5 cửa hàng', template: { ...template, kind: 'single' } }).template)
      .toEqual({ kind: 'single', stack: 'java-spring', options: { db: 'mysql' } });
  });
  it('a git project carries its source, branch, documents and the project name/slug', () => {
    const f = { text: 'Shop có sẵn', name: 'Shop', slug: 'shop', source: { provider: 'url', url: ' https://github.com/a/shop.git ' }, branch: 'main',
      files: [{ name: 'yeu-cau.md', content: '# Yêu cầu' }], paths: 'docs/a.md\n\n docs/b.md ' };
    expect(startBody('git', f)).toEqual({ kind: 'git', text: 'Shop có sẵn', source: { provider: 'url', url: 'https://github.com/a/shop.git', branch: 'main' },
      docs: { files: [{ name: 'yeu-cau.md', content: '# Yêu cầu' }], paths: ['docs/a.md', 'docs/b.md'] }, import: { name: 'Shop', slug: 'shop', branch: 'main' } });
  });
  it('says what is missing before sending', () => {
    expect(startProblem('idea', { text: 'abc' })).toMatch(/vài chữ/);
    expect(startProblem('template', { text: 'Bán hàng 5 cửa hàng', template: { kind: 'single', stack: '' } })).toMatch(/backend/);
    expect(startProblem('template', { text: 'Bán hàng 5 cửa hàng', template: { kind: 'fullstack', stack: 'java-spring', frontend: { stack: '' } } })).toMatch(/frontend/);
    expect(startProblem('template', { text: 'Bán hàng 5 cửa hàng', template: { kind: 'single', stack: 'java-spring', options: {} } })).toBe('');
    expect(startProblem('git', { text: 'Shop có sẵn', source: { url: '' } })).toMatch(/repo/);
    expect(startProblem('git', { text: 'Shop có sẵn', source: { url: 'https://x/y.git' }, name: 'Shop', slug: 'shop', branch: 'main' })).toBe('');
  });
});

describe('project chat', () => {
  it('labels where each feature is', () => {
    expect(threadStatus({ status: 'pm' })).toBe('PM');
    expect(threadStatus({ status: 'system' })).toBe('Kiến trúc sư');
    expect(threadStatus({ status: 'ui' })).toBe('Thiết kế');
    expect(threadStatus({ status: 'waiting' })).toBe('Chờ lane');
    expect(threadStatus({ status: 'building', lane: 3 })).toBe('Lane 3 đang làm');
    expect(threadStatus({ status: 'done' })).toBe('Đã có');
    expect(threadStatus({ status: 'dropped' })).toBe('Đã bỏ');
  });
  it('moves a queued feature up or down, never out of the list', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });
  it('says which step a draft is at', () => {
    expect(draftStep({ stage: 'pm' })).toBe('Bước 1/4 · Yêu cầu sản phẩm');
    expect(draftStep({ stage: 'ui' })).toBe('Bước 3/4 · Thiết kế giao diện');
    expect(draftStep({ stage: 'create' })).toBe('Bước 4/4 · Tạo dự án');
    expect(draftStep({ stage: 'build' })).toBe('Đang tạo dự án');
  });
  it('drafts are chats with no project yet', () => {
    expect(isDraft({ projectId: null, stage: 'pm' })).toBe(true);
    expect(isDraft({ projectId: 'proj_9' })).toBe(false);
  });
});

describe('project documents', () => {
  it('labels every feature status', async () => {
    const { FEATURE_STATUS_LABEL } = await import('../src/lib/studio.js');
    expect(FEATURE_STATUS_LABEL).toEqual({ approved: 'Đã duyệt — chưa làm', done: 'Đã có', dropped: 'Đã bỏ' });
  });
});

describe('a Flutter mobile app', () => {
  it('"App mobile" is sent as a fullstack project with a Flutter frontend', async () => {
    const { startBody, appKindOf } = await import('../src/lib/studio.js');
    const template = { kind: 'mobile', stack: 'ts-nestjs', options: { auth: 'jwt' }, frontend: { stack: 'flutter-android', options: { org: 'com.x' } } };
    expect(startBody('template', { text: 'App đặt lịch khám', template }).template)
      .toEqual({ kind: 'fullstack', stack: 'ts-nestjs', options: { auth: 'jwt' }, frontend: { stack: 'flutter-android', options: { org: 'com.x' } } });
    expect(appKindOf({ frontend: { stack: 'flutter-android' } })).toBe('mobile');
    expect(appKindOf({ frontend: { stack: 'ts-react-vite' } })).toBe('web');
    expect(appKindOf(null)).toBe('web');
  });
  it('each kind of project offers only the frameworks that fit it', async () => {
    const { languagesFor, frontendStacks } = await import('../src/lib/scaffold.js');
    const catalog = { languages: [
      { id: 'java', label: 'Java', stacks: [{ id: 'java-spring', role: 'backend' }] },
      { id: 'typescript', label: 'TypeScript', stacks: [{ id: 'ts-react-vite', role: 'frontend' }, { id: 'ts-nestjs', role: 'backend' }] },
      { id: 'dart', label: 'Dart', stacks: [{ id: 'flutter-android', role: 'frontend' }] },
    ] };
    expect(languagesFor(catalog, 'single').map(l => l.id)).toEqual(['java', 'typescript']);
    expect(languagesFor(catalog, 'mobile').map(l => l.id)).toEqual(['java', 'typescript']);
    expect(frontendStacks(catalog, 'fullstack').map(s => s.id)).toEqual(['ts-react-vite']);
    expect(frontendStacks(catalog, 'mobile').map(s => s.id)).toEqual(['flutter-android']);
  });
});

