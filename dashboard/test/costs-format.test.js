import { describe, it, expect } from 'vitest';
import { fmtVnd, fmtTokens, fmtUsd, ratioTone, sumTokens, PHASE_LABEL } from '../src/lib/costs.js';

describe('cost formatting', () => {
  it('formats VND, tokens and USD compactly', () => {
    expect(fmtVnd(1234567)).toBe('1.234.567 đ');
    expect(fmtVnd(0)).toBe('0 đ');
    expect(fmtTokens(950)).toBe('950');
    expect(fmtTokens(12_300)).toBe('12,3K');
    expect(fmtTokens(4_560_000)).toBe('4,56M');
    expect(fmtUsd(1.234)).toBe('$1.23');
    expect(fmtUsd(0.004)).toBe('<$0.01');
  });
  it('tones AI-vs-human ratio: cheap ok, close warn, more than people danger', () => {
    expect(ratioTone(0.2)).toBe('ok');
    expect(ratioTone(0.7)).toBe('warn');
    expect(ratioTone(1.3)).toBe('danger');
    expect(ratioTone(null)).toBe('neutral');
  });
  it('sums token kinds and labels phases', () => {
    expect(sumTokens({ in: 1, out: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10);
    expect(PHASE_LABEL.ORCH).toBe('Điều phối');
  });
});
