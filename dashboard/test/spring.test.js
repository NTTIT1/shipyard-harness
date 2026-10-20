// Fluid-interface springs behind Modal and the Sidebar drawer.
import { describe, it, expect } from 'vitest';
import { stepSpring, createSpring, project, rubberband, velocityFrom, SPRING } from '../src/lib/spring.js';

/** Drive a spring with a fake clock: each raf() runs on the next manual frame. */
function harness(opts) {
  let t = 0, queued = null;
  const values = [];
  const s = createSpring({ ...opts, onUpdate: x => values.push(x), raf: cb => { queued = cb; return 1; }, caf: () => { queued = null; }, now: () => t });
  const frames = (n, ms = 16) => { for (let i = 0; i < n && queued; i++) { t += ms; const cb = queued; queued = null; cb(); } };
  return { s, values, frames };
}

describe('spring', () => {
  it('critically damped (damping 1) settles on the target without overshoot', () => {
    const { s, values, frames } = harness({ value: 0 });
    s.to(100);
    frames(200);
    expect(s.value).toBe(100);
    expect(s.moving).toBe(false);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it('under-damped overshoots once a flick gives it momentum', () => {
    const { s, values, frames } = harness({ value: 0, config: SPRING.sheet });
    s.to(100, { velocity: 2000 });
    frames(200);
    expect(Math.max(...values)).toBeGreaterThan(100);
    expect(s.value).toBe(100);
  });

  it('retargeting mid-flight keeps the live value and velocity (no jump)', () => {
    const { s, values, frames } = harness({ value: 0 });
    s.to(100);
    frames(8);
    const before = s.value, vBefore = s.velocity;
    expect(before).toBeGreaterThan(0);
    expect(vBefore).toBeGreaterThan(0);
    s.to(0);                       // user reverses: Esc while opening
    expect(s.value).toBe(before);
    expect(s.velocity).toBe(vBefore);
    frames(1);
    expect(Math.abs(values.at(-1) - before)).toBeLessThan(15); // continues from where it was
    frames(300);
    expect(s.value).toBe(0);
  });

  it('set() follows the pointer 1:1 and drops stale velocity; immediate jumps for reduced motion', () => {
    const { s, frames } = harness({ value: 0 });
    s.to(100); frames(5);
    s.set(42);
    expect([s.value, s.velocity, s.moving]).toEqual([42, 0, false]);
    s.to(7, { immediate: true });
    expect([s.value, s.moving]).toEqual([7, false]);
  });

  it('one step moves toward the target', () => {
    const [x, v] = stepSpring(0, 0, 10, SPRING.ui, 1 / 60);
    expect(x).toBeGreaterThan(0);
    expect(v).toBeGreaterThan(0);
  });
});

describe('gesture helpers', () => {
  it('projects a flick forward like scroll deceleration', () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000, 0.99)).toBeCloseTo(-99, 0);
    expect(project(0)).toBe(0);
  });
  it('rubber-bands: follows less the further past the edge, never past the dimension', () => {
    const a = rubberband(50, 300), b = rubberband(500, 300);
    expect(a).toBeLessThan(50);
    expect(b - a).toBeLessThan(500 - 50);
    expect(b).toBeLessThan(300);
    expect(rubberband(-50, 300)).toBeCloseTo(-a);
  });
  it('measures release velocity over the last ~100ms', () => {
    const samples = [{ t: 0, x: 0 }, { t: 300, x: 0 }, { t: 350, x: 50 }, { t: 400, x: 100 }];
    expect(velocityFrom(samples)).toBe(1000);
    expect(velocityFrom([{ t: 0, x: 0 }])).toBe(0);
  });
});
