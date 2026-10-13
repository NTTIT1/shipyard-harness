// Lane liveness classification: a lane that SHOULD be heartbeating (running /
// provisioning, a watch/poll stage, or a pr-review loop) but has gone quiet is
// DEAD (its driving Claude session died); a lane at rest (idle/done/passed/
// failed/blocked, not watching) is IDLE and its old heartbeat is expected.
import { describe, it, expect } from 'vitest';
import { classifyLiveness } from '../server/services/state.js';

const DEAD = 600;
const cl = (o) => classifyLiveness(o, DEAD);

describe('classifyLiveness — actively working lanes', () => {
  it('running with a fresh heartbeat is active', () => {
    expect(cl({ status: 'running', stage: 'implementing', mode: 'ship', age: 30 })).toBe('active');
  });
  it('running with a stale heartbeat is dead', () => {
    expect(cl({ status: 'running', stage: 'implementing', mode: 'ship', age: 1200 })).toBe('dead');
  });
  it('provisioning follows the same rule (fresh=active, stale=dead)', () => {
    expect(cl({ status: 'provisioning', stage: 'booting', mode: 'ship', age: 20 })).toBe('active');
    expect(cl({ status: 'provisioning', stage: 'booting', mode: 'ship', age: 1200 })).toBe('dead');
  });
  it('a running lane with no measurable heartbeat is not flagged dead', () => {
    expect(cl({ status: 'running', stage: 'implementing', mode: 'ship', age: null })).toBe('active');
  });
});

describe('classifyLiveness — watch / review loops (the core bug)', () => {
  it('a watching-pr lane whose status drifted to idle but heartbeat is stale is dead', () => {
    expect(cl({ status: 'idle', stage: 'watching-pr', mode: 'ship', age: 3600 })).toBe('dead');
  });
  it('a watch-pr lane still claiming running but long silent is dead', () => {
    expect(cl({ status: 'running', stage: 'watch-pr', mode: 'ship', age: 40000 })).toBe('dead');
  });
  it('a polling stage that has gone quiet is dead', () => {
    expect(cl({ status: 'idle', stage: 'polling-prs', mode: 'ship', age: 1000 })).toBe('dead');
  });
  it('a watching lane with a fresh heartbeat is active', () => {
    expect(cl({ status: 'running', stage: 'watching-pr', mode: 'ship', age: 20 })).toBe('active');
  });
  it('a pr-review loop that stopped heartbeating is dead even when idle', () => {
    expect(cl({ status: 'idle', stage: 'idle', mode: 'pr-review', age: 1200 })).toBe('dead');
  });
  it('a pr-review loop actively polling is active', () => {
    expect(cl({ status: 'running', stage: 'idle', mode: 'pr-review', age: 25 })).toBe('active');
  });
});

describe('classifyLiveness — lanes at rest keep quiet (idle, never dead)', () => {
  it('a done/passed lane with a days-old heartbeat is idle, not dead', () => {
    expect(cl({ status: 'passed', stage: 'done', mode: 'ship', age: 300000 })).toBe('idle');
  });
  it('a plain idle lane with an old heartbeat is idle', () => {
    expect(cl({ status: 'idle', stage: 'no-state', mode: 'ship', age: 5000 })).toBe('idle');
  });
  it('a failed lane is idle for liveness purposes', () => {
    expect(cl({ status: 'failed', stage: 'implementing', mode: 'ship', age: 5000 })).toBe('idle');
  });
  it('a blocked lane waiting on a human is idle, not dead', () => {
    expect(cl({ status: 'blocked', stage: 'gate', mode: 'ship', age: 5000 })).toBe('idle');
  });
});

describe('classifyLiveness — threshold boundary', () => {
  it('exactly at the threshold is still active; one second past is dead', () => {
    expect(cl({ status: 'running', stage: 'implementing', mode: 'ship', age: DEAD })).toBe('active');
    expect(cl({ status: 'running', stage: 'implementing', mode: 'ship', age: DEAD + 1 })).toBe('dead');
  });
});

describe('classifyLiveness — waiting for human approval', () => {
  it('a lane parked at spec-review/waiting for hours is idle, not dead', () => {
    expect(cl({ status: 'waiting', stage: 'spec-review', mode: 'ship', age: 20000 })).toBe('idle');
  });
});
