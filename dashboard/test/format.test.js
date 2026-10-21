import { describe, it, expect } from 'vitest';
import { fmtDur, fmtAge, fmtWhen } from '../src/lib/format.js';

describe('Vietnamese durations', () => {
  it('keeps two units at most', () => {
    expect(fmtDur(42)).toBe('42 giây');
    expect(fmtDur(125)).toBe('2 phút');
    expect(fmtDur(3600 * 3 + 300)).toBe('3 giờ 5 phút');
    expect(fmtDur(7200)).toBe('2 giờ');
    expect(fmtDur(86400 + 6 * 3600 + 59)).toBe('1 ngày 6 giờ');
    expect(fmtDur(null)).toBe('—');
  });
  it('ages read "… trước" with the recency class', () => {
    expect(fmtAge(2)).toEqual(['vừa xong', 'hb-fresh']);
    expect(fmtAge(600)).toEqual(['10 phút trước', 'hb-warn']);
    expect(fmtAge(null)).toEqual(['—', '']);
    expect(fmtWhen(new Date(Date.now() - 3 * 86400e3).toISOString())).toBe('3 ngày trước');
    expect(fmtWhen('không phải ngày')).toBe('không phải ngày');
  });
});
