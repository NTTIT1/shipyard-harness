// Phase 5: pure helpers behind the "Đội AI" editor.
import { describe, it, expect } from 'vitest';
import { roleKeys, ruleColumns, toggleRole, forgetRule, ruleChanges, sameTeam, formatSize, skillRows } from '../src/lib/team.js';

const team = { roles: { DEV: { reads: ['rules/project.md'], skills: [] }, CUSTOM: { reads: [] }, PM: { reads: ['rules/project.md', 'rules/dev.md'] } } };

describe('team editor helpers', () => {
  it('orders roles by pipeline, unknown roles last; project.md first', () => {
    expect(roleKeys(team)).toEqual(['PM', 'DEV', 'CUSTOM']);
    expect(ruleColumns({ 'test.md': '', 'dev.md': '', 'project.md': '' })).toEqual(['project.md', 'dev.md', 'test.md']);
  });
  it('toggles reads/skills without mutating', () => {
    const t = toggleRole(team, 'DEV', 'reads', 'rules/dev.md');
    expect(t.roles.DEV.reads).toEqual(['rules/project.md', 'rules/dev.md']);
    expect(team.roles.DEV.reads).toEqual(['rules/project.md']);
    expect(toggleRole(t, 'DEV', 'reads', 'rules/dev.md').roles.DEV.reads).toEqual(['rules/project.md']);
    expect(toggleRole(team, 'CUSTOM', 'skills', 'x').roles.CUSTOM.skills).toEqual(['x']);
    expect(sameTeam(team, structuredClone(team))).toBe(true);
  });
  it('forgets a deleted rule everywhere and reports changes', () => {
    expect(forgetRule(team, 'dev.md').roles.PM.reads).toEqual(['rules/project.md']);
    expect(ruleChanges({ 'a.md': '1', 'b.md': '2' }, { 'a.md': '1', 'c.md': '3' })).toEqual({ 'c.md': '3', 'b.md': null });
    expect(ruleChanges({ 'a.md': '1' }, { 'a.md': '1' })).toEqual({});
  });
  it('formats sizes', () => {
    expect(formatSize(900)).toBe('900 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('skillRows', () => {
  it('lists installed, repo, catalog then unknown skills, keeping the suggested roles', () => {
    const state = {
      skills: ['react-ui', 'hallmark'],
      skillCatalog: [
        { id: 'react-ui', label: 'React UI', desc: 'd', roles: ['DEV'] },
        { id: 'jpa', label: 'JPA', desc: 'j', roles: ['DEV', 'REVIEW'] },
        { id: 'hallmark', label: 'Hallmark', desc: 'h', roles: ['DESIGN'], installed: true },
      ],
    };
    const rows = skillRows(state, { roles: { DEV: { skills: ['old-skill'] } } });
    expect(rows.map(r => [r.id, r.kind])).toEqual([['hallmark', 'installed'], ['react-ui', 'repo'], ['jpa', 'catalog'], ['old-skill', 'unknown']]);
    expect(rows.find(r => r.id === 'react-ui')).toMatchObject({ label: 'React UI', suggested: ['DEV'] });
    expect(rows[0].suggested).toEqual(['DESIGN']);
  });
  it('handles a state without a catalog', () => {
    expect(skillRows({ skills: ['x'] }, null)).toEqual([{ id: 'x', label: 'x', desc: '', suggested: [], kind: 'repo' }]);
  });
});

describe('skill library', () => {
  it('names a skill from a file name, Vietnamese included', async () => {
    const { skillIdFrom } = await import('../src/lib/team.js');
    expect(skillIdFrom('API chuẩn Công ty.md')).toBe('api-chuan-cong-ty');
    expect(skillIdFrom('Đặt tên__biến!!.md')).toBe('dat-ten__bien');
  });
  it('reads description from front matter, else the first plain line', async () => {
    const { parseSkillMd } = await import('../src/lib/team.js');
    expect(parseSkillMd('---\nname: a\ndescription: "Mô tả"\n---\n# T\nx').desc).toBe('Mô tả');
    expect(parseSkillMd('# Tiêu đề\n\n- Luôn viết test\n')).toMatchObject({ title: 'Tiêu đề', desc: 'Luôn viết test' });
  });
  it("one role's library: used in its order, search without accents, filters with counts, new skills listed", async () => {
    const { roleLibrary } = await import('../src/lib/team.js');
    const rows = skillRows({ skills: ['repo-a'], skillCatalog: [
      { id: 'jpa', label: 'JPA an toàn', desc: 'Giao dịch', roles: ['DEV'] },
      { id: 'prd', label: 'PRD chuẩn', desc: 'Tiêu chí nghiệm thu', roles: ['PM'] },
      { id: 'mach', label: 'Máy', desc: '', roles: [], installed: true },
    ] }, { roles: { DEV: { skills: ['repo-a'] } } }, { 'cua-toi': '# Của tôi\n- Quy tắc riêng' });
    const team = { roles: { DEV: { skills: ['repo-a'] }, PM: { skills: [] } } };
    const lib = roleLibrary(rows, team, 'DEV');
    expect(lib.used.map(r => r.id)).toEqual(['repo-a']);
    expect(lib.available.map(r => r.id)).toEqual(['cua-toi', 'jpa']);
    expect(lib.counts).toMatchObject({ all: 4, suggested: 2, installed: 1, catalog: 2, new: 1 });
    expect(roleLibrary(rows, team, 'DEV', { filter: 'all', q: 'nghiem thu' }).available.map(r => r.id)).toEqual(['prd']);
    expect(rows.find(r => r.id === 'cua-toi')).toMatchObject({ kind: 'new', desc: 'Quy tắc riêng' });
  });
});
