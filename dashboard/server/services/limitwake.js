// A lane whose Claude account ran out of its usage window ("You've hit your session limit · resets
// 6:50pm") stops mid-feature with nothing left to wake it. This works out when the window resets so
// the dashboard can nudge the lane on its own at that time.

export const LIMIT_RE = /hit (?:your|its|the) (?:\w+[ -])?limit|usage limit reached|limit · resets/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MARGIN_MS = 60_000;        // a minute after the reset, so the new window is surely open
const FALLBACK_MS = 30 * 60_000; // reset time unknown: try again in half an hour

/** "resets 6:50pm" / "resets 3pm" / "resets Oct 30, 9am" → the next such moment (local time), or null. */
export function resetFromText(text, now = new Date()) {
  const m = /resets\s+(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text || ''));
  if (!m) return null;
  let h = Number(m[3]);
  const min = Number(m[4] || 0);
  const ap = (m[5] || '').toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'pm' ? 12 : 0); }
  if (h > 23 || min > 59) return null;
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, min);
  if (m[1]) {
    const mon = MONTHS.indexOf(m[1].toLowerCase());
    if (mon < 0) return null;
    d.setMonth(mon, Number(m[2]));
    if (d <= now) d.setFullYear(d.getFullYear() + 1);
  } else if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** The latest reset among the plan's windows that are currently refused (usage-plan.json), or null. */
export function resetFromPlan(plan, now = new Date()) {
  const times = Object.values(plan || {})
    .filter(w => w && w.status === 'rejected' && w.resetsAt)
    .map(w => new Date(w.resetsAt))
    .filter(d => !Number.isNaN(d.getTime()) && d > now);
  return times.length ? new Date(Math.max(...times)) : null;
}

/** When to wake the lane: the reset named in the message, else the plan's, else in half an hour. */
export function wakeTime(text, plan, now = new Date()) {
  const at = resetFromText(text, now) || resetFromPlan(plan, now);
  return new Date(at ? at.getTime() + MARGIN_MS : now.getTime() + FALLBACK_MS);
}

export const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
