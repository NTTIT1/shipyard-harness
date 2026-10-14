import { useEffect, useState } from 'react';

const KEY = 'shipyard-theme';
function stored() { try { return localStorage.getItem(KEY); } catch { return null; } }
function system() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// data-theme on <html>; an explicit choice is remembered, otherwise follow the OS.
export function useTheme() {
  const [theme, setTheme] = useState(() => stored() || system());
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: session-only */ }
    return next;
  });
  return { theme, toggle };
}
