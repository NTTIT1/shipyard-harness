import { useCallback, useState } from 'react';

// Where you were — project, screen, lane — survives a reload (F5); each browser remembers its own.
function stored(key) {
  try { const v = localStorage.getItem(key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
}

/** useState whose value is kept in localStorage under `key`; `restore` vets the stored value on load. */
export function useRemembered(key, initial, restore = v => v) {
  const [value, setValue] = useState(() => { const v = stored(key); return v === undefined ? initial : restore(v); });
  const set = useCallback(next => setValue(cur => {
    const v = typeof next === 'function' ? next(cur) : next;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: session-only */ }
    return v;
  }), [key]);
  return [value, set];
}

/** The remembered project once the list is known: one that is gone falls back to "Tất cả dự án". */
export function restoreProject(id, projects) {
  if (!id || id === 'ALL') return 'ALL';
  return (projects || []).some(p => p.id === id) ? id : 'ALL';
}

const VIEWS = ['board', 'inbox', 'projects', 'users', 'costs', 'studio', 'docs', 'lanes'];
/** The screen to reopen: a review needs the item it was opened from, so it reopens the inbox. */
export function restoreView(v) {
  if (v === 'review') return 'inbox';
  return VIEWS.includes(v) ? v : 'board';
}
