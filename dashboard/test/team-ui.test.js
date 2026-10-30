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
