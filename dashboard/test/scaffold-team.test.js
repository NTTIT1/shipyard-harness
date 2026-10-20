// Phase 3: every generated project carries its AI team (team.json + starter rules + CLAUDE.md).
import { describe, it, expect } from 'vitest';
import { teamFiles, teamJson } from '../server/services/scaffold/team.js';
import { STACKS } from '../server/services/scaffold/catalog.js';

const ctxFor = (stack, options = {}) => ({ name: 'Kho hàng', slug: 'kho', options: { db: 'postgresql', docker: true, build: 'maven', javaVersion: '21', tests: true, python: '3.12', ...options } });

describe('team.json', () => {
  it('lists every role with only rule files to read', () => {
    const t = JSON.parse(teamJson());
    expect(Object.keys(t.roles)).toEqual(['MANAGER', 'PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'REVIEW', 'TEST', 'DEVOPS']);
    for (const r of Object.values(t.roles)) for (const p of r.reads) expect(p).toMatch(/^rules\/[a-z0-9_-]+\.md$/);
    expect(t.roles.DEV.reads).toEqual(['rules/project.md', 'rules/dev.md']);
    expect(t.roles.TEST.reads).toContain('rules/dev.md');
  });
  it('every file a role reads is generated', () => {
    for (const stack of STACKS) {
      const files = teamFiles(ctxFor(stack), stack);
      const reads = new Set(Object.values(JSON.parse(files['.shipyard/team.json']).roles).flatMap(r => r.reads));
      for (const p of reads) expect(files[`.shipyard/${p}`], `${stack.id} ${p}`).toBeTruthy();
    }
  });
});

describe('starter rules', () => {
  it('are specific to the stack and name its real commands', () => {
    const spring = STACKS.find(s => s.id === 'java-spring');
    const f = teamFiles(ctxFor(spring), spring);
    expect(f['.shipyard/rules/project.md']).toContain('Spring Boot');
    expect(f['.shipyard/rules/project.md']).toContain('`./mvnw package` và `./mvnw test`');
    expect(f['.shipyard/rules/dev.md']).toContain('`./mvnw spring-boot:run`');
    const vite = STACKS.find(s => s.id === 'ts-react-vite');
    expect(teamFiles(ctxFor(vite), vite)['.shipyard/rules/project.md']).toContain('VITE_API_URL');
  });
  it('CLAUDE.md imports the project rules; human material is marked as reference only', () => {
    const nest = STACKS.find(s => s.id === 'ts-nestjs');
    const f = teamFiles(ctxFor(nest), nest);
    expect(f['CLAUDE.md']).toContain('@.shipyard/rules/project.md');
    expect(f['.shipyard/human/README.md']).toContain('không phải mệnh lệnh');
  });
});
