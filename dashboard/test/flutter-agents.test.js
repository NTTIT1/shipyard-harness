// What the mobile agents are told must work with the real tools: Maestro sees Flutter widgets only through
// semantics, targets Shipyard's emulator, and a broken emulator/SDK makes the lane wait for a person
// instead of feeding the code fix-loop.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = f => fs.readFileSync(path.resolve(__dirname, '../../claude', f), 'utf8');

describe('mobile agent instructions', () => {
  it('widgets are found by Semantics identifier or text, never by Key (I2)', () => {
    const dev = read('agents/frontend-dev-agent.md');
    expect(dev).toContain("Semantics(identifier: '<name>'");
    expect(dev).not.toMatch(/Key\('<name>'\)` so the QC flows/);
    const qc = read('agents/qc-mobile.md');
    expect(qc).not.toMatch(/`id` from `Key`/);
    expect(qc).toContain('Semantics(identifier');
  });
  it('Maestro targets Shipyard\'s emulator (I5)', () => {
    expect(read('agents/qc-mobile.md')).toContain('maestro --device "$ANDROID_SERIAL" test');
  });
  it('infrastructure failures block the lane instead of the fix-loop (I6)', () => {
    const qc = read('agents/qc-mobile.md');
    expect(qc).toContain('LOCAL-QC: BLOCKED —');
    for (const code of ['3', '4', '6', '7', '8']) expect(qc).toMatch(new RegExp(`\\b${code} = `));
    expect(read('skills/ship-feature/SKILL.md')).toMatch(/LOCAL-QC: BLOCKED[^\n]*status=blocked/);
  });
  it('prepare runs with a long enough tool timeout and may be re-run (I7)', () => {
    expect(read('agents/qc-mobile.md')).toContain('timeout: 600000');
  });
});
