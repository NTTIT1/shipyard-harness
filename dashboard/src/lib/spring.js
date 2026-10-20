// Interruptible springs for gesture-driven UI (Apple "Designing Fluid Interfaces", WWDC 2018).
// Parameters are Apple's designer-facing pair, not mass/stiffness/damping:
//   damping  — damping ratio: 1 = critically damped (no overshoot), < 1 = bounces.
//   response — seconds to (roughly) reach the target; lower = snappier. Not a duration.
// A spring always continues from its current value AND velocity, so retargeting mid-flight
// (a gesture reversing, Esc while opening) never jumps or hits a "brick wall".

export const SPRING = {
  ui: { damping: 1, response: 0.35 },       // default: modal, sidebar when driven by a button
  sheet: { damping: 0.86, response: 0.32 }, // released after a drag: carries momentum, slight give
};

/** One integration step of a damped spring toward `target` (mass 1). Pure, for tests. */
export function stepSpring(x, v, target, { damping, response }, dt) {
  const k = (2 * Math.PI / response) ** 2;
  const c = 4 * Math.PI * damping / response;
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt;               // semi-implicit Euler: stable at UI stiffnesses
  return [x + nv * dt, nv];
}

/**
 * Where a flick would come to rest, using Apple's deceleration projection (sample code of the
 * WWDC talk): v in px/s, rate ≈ 0.998 like scrolling, 0.99 for a snappier throw.
 */
export function project(velocity, rate = 0.998) {
  return (velocity / 1000) * rate / (1 - rate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (!dimension) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Release velocity (px/s) from the last ~100ms of pointer samples [{ t, x }]. */
export function velocityFrom(samples, axis = 'x') {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) if (last.t - s.t <= 100) { first = s; break; }
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last[axis] - first[axis]) / dt : 0;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A spring-driven value. `onUpdate(value)` runs every frame (write styles there, not React state).
 * `to(target, { velocity })` retargets from the live value; `set(value)` jumps (gesture tracking).
 */
export function createSpring({ value = 0, config = SPRING.ui, precision = 0.01, onUpdate, onRest,
  raf = cb => requestAnimationFrame(cb), caf = id => cancelAnimationFrame(id), now = () => performance.now() } = {}) {
  let x = value, v = 0, target = value, cfg = config, frame = null, last = 0;

  const tick = () => {
    const t = now();
    let dt = Math.min((t - last) / 1000, 0.064); // a backgrounded tab must not explode the step
    last = t;
    while (dt > 0) {                             // fixed sub-steps keep stiff springs stable
      const h = Math.min(dt, 1 / 240);
      [x, v] = stepSpring(x, v, target, cfg, h);
      dt -= h;
    }
    if (Math.abs(x - target) < precision && Math.abs(v) < precision * 10) {
      x = target; v = 0; frame = null;
      onUpdate?.(x); onRest?.(x);
      return;
    }
    onUpdate?.(x);
    frame = raf(tick);
  };

  const api = {
    get value() { return x; },
    get velocity() { return v; },
    get target() { return target; },
    get moving() { return frame !== null; },
    to(next, { velocity, config: c, immediate } = {}) {
      target = next;
      if (c) cfg = c;
      if (velocity !== undefined) v = velocity;
      if (immediate) { api.set(next); onRest?.(x); return api; }
      if (frame === null) { last = now(); frame = raf(tick); }
      return api;
    },
    /** Follow the pointer 1:1 (stops any animation, keeps no stale velocity). */
    set(next) {
      if (frame !== null) { caf(frame); frame = null; }
      x = next; target = next; v = 0;
      onUpdate?.(x);
      return api;
    },
    stop() { if (frame !== null) { caf(frame); frame = null; } return api; },
  };
  return api;
}
