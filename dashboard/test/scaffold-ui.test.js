// Wizard helpers: slug from Vietnamese names, step list and per-step validation.
import { describe, it, expect } from 'vitest';
import { slugify, wizardSteps, stepProblem, findStack, defaultOptions, summary, SLUG_RE } from '../src/lib/scaffold.js';

const catalog = { languages: [
  { id: 'java', label: 'Java', stacks: [{ id: 'java-spring', label: 'Spring Boot', available: true, missing: [], options: [
    { id: 'db', label: 'Database', type: 'choice', default: 'postgresql', choices: [{ id: 'postgresql', label: 'PostgreSQL' }] },
    { id: 'groupId', label: 'Group ID', type: 'text', default: 'com.example', pattern: '^[a-z]+(\\.[a-z]+)+$', help: 'com.x' },
    { id: 'docker', label: 'Docker', type: 'bool', default: true }] }] },
  { id: 'typescript', label: 'TypeScript', stacks: [{ id: 'ts-react-vite', label: 'React + Vite', noDatabase: true, available: false,
    missing: [{ tool: 'node', hint: '' }], options: [] }] },
] };

describe('slugify', () => {
  it('strips Vietnamese diacritics and đ', () => {
    expect(slugify('Quản lý Đơn hàng 2')).toBe('quan-ly-don-hang-2');
    expect(slugify('  123 Cửa hàng!! ')).toBe('cua-hang');
    expect(SLUG_RE.test(slugify('Hệ thống nhân sự HRM'))).toBe(true);
    expect(slugify('x'.repeat(60)).length).toBe(40);
  });
});

describe('wizard steps', () => {
  it('drops the database step for frontend stacks', () => {
    expect(wizardSteps(findStack(catalog, 'java-spring')).map(s => s.id)).toEqual(['info', 'language', 'stack', 'db', 'options', 'git', 'team', 'review']);
    expect(wizardSteps(findStack(catalog, 'ts-react-vite')).map(s => s.id)).not.toContain('db');
  });
  it('blocks each step until it is valid', () => {
    const s = findStack(catalog, 'java-spring');
    const form = { name: '', slug: '', language: '', options: defaultOptions(s) };
    expect(stepProblem('info', form, s)).toMatch(/tên/);
    expect(stepProblem('info', { ...form, name: 'A', slug: 'Bad' }, s)).toMatch(/Slug/);
    expect(stepProblem('info', { ...form, name: 'A', slug: 'ok-app' }, s)).toBe('');
    expect(stepProblem('stack', form, findStack(catalog, 'ts-react-vite'))).toMatch(/thiếu: node/);
    expect(stepProblem('options', { ...form, options: { ...form.options, groupId: 'bad' } }, s)).toMatch(/Group ID: com.x/);
    expect(stepProblem('options', form, s)).toBe('');
  });
  it('summarises choices with labels', () => {
    const s = findStack(catalog, 'java-spring');
    const rows = summary({ name: 'Kho', slug: 'kho', description: '', options: defaultOptions(s) }, s);
    expect(rows).toContainEqual(['Database', 'PostgreSQL']);
    expect(rows).toContainEqual(['Docker', 'Có']);
    expect(rows).toContainEqual(['Framework', 'Spring Boot']);
  });
});

describe('runSteps', () => {
  it('shows only MANAGER for a project-rules run', async () => {
    const { runSteps, STEPS } = await import('../src/lib/review.js');
    expect(runSteps([{ step: 'MANAGER' }])).toEqual(['MANAGER']);
    expect(runSteps([{ step: 'PM' }])).toBe(STEPS);
  });
});
