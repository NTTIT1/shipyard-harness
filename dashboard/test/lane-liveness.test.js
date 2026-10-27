import { describe, it, expect } from 'vitest';
import { liveLiveness, laneAttention } from '../src/lib/laneview.js';
import { phaseIdx } from '../src/lib/constants.js';

describe('lane map + liveness', () => {
  it('a lane whose session is working is not "mất kết nối"', () => {
    expect(liveLiveness({ liveness: 'dead', session_active: true })).toBe('active');
    expect(liveLiveness({ liveness: 'dead', session_running: true })).toBe('active');   // older server
    expect(liveLiveness({ liveness: 'dead', session_running: true, session_active: false })).toBe('dead');
    expect(liveLiveness({ liveness: 'dead' })).toBe('dead');
    expect(laneAttention({ liveness: liveLiveness({ liveness: 'dead', session_active: true }) })).toBe(null);
  });
  it('role-pipeline stages show on the map', () => {
    expect(phaseIdx('role-arch')).toBe(phaseIdx('plan'));
    expect(phaseIdx('review-pm')).toBe(phaseIdx('plan'));
    expect(phaseIdx('role-dev')).toBe(phaseIdx('implementing'));
    expect(phaseIdx('review-test')).toBe(phaseIdx('qc'));
    expect(phaseIdx('test')).toBe(phaseIdx('qc'));
    expect(phaseIdx('arch')).toBe(phaseIdx('plan'));
    expect(phaseIdx('implementing')).toBe(2);
    expect(phaseIdx('nope')).toBe(-1);
  });
});
