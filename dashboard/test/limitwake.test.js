import { describe, it, expect } from 'vitest';
import { LIMIT_RE, resetFromText, resetFromPlan, wakeTime } from '../server/services/limitwake.js';

const at = (...a) => new Date(2026, 9, 26, ...a);
const hm = d => [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

describe('limitwake', () => {
  it('recognises the usage-limit replies', () => {
    expect(LIMIT_RE.test("You've hit your session limit · resets 6:50pm (Asia/Ho_Chi_Minh)")).toBe(true);
    expect(LIMIT_RE.test('It failed because the model hit its session limit')).toBe(true);
    expect(LIMIT_RE.test('Claude usage limit reached|1793000000')).toBe(true);
    expect(LIMIT_RE.test('Bước BA đã xong và đã nộp.')).toBe(false);
  });
  it('reads the reset time, today or tomorrow', () => {
    expect(hm(resetFromText('resets 6:50pm (Asia/Ho_Chi_Minh)', at(8, 28)))).toEqual([10, 26, 18, 50]);
    expect(hm(resetFromText('resets 3pm', at(8)))).toEqual([10, 26, 15, 0]);
    expect(hm(resetFromText('resets 1:50am', at(23)))).toEqual([10, 27, 1, 50]);
    expect(hm(resetFromText('resets 12am', at(23)))).toEqual([10, 27, 0, 0]);
    expect(hm(resetFromText('weekly limit · resets Oct 30, 9am', at(8)))).toEqual([10, 30, 9, 0]);
    expect(resetFromText('no time here', at(8))).toBe(null);
  });
  it('falls back to the plan, then to half an hour', () => {
    const now = new Date('2026-10-26T01:00:00Z');
    const plan = { five_hour: { status: 'rejected', resetsAt: '2026-10-26T06:50:00Z' }, seven_day: { status: 'allowed', resetsAt: '2026-10-30T00:00:00Z' } };
    expect(resetFromPlan(plan, now).toISOString()).toBe('2026-10-26T06:50:00.000Z');
    expect(wakeTime('limit reached', plan, now).toISOString()).toBe('2026-10-26T06:51:00.000Z');
    expect(wakeTime('limit reached', {}, now).toISOString()).toBe('2026-10-26T01:30:00.000Z');
  });
});
