// In-app confirmation dialogs instead of window.confirm (which the browser titles with the page's
// address — "192.168.x.x cho biết…"). Mount <DialogHost /> once; then `await confirmDialog({...})`.
let show = null;

/**
 * Ask the person to confirm. Resolves true (confirmed) or false (cancelled / closed).
 * { title, message, confirmLabel, cancelLabel, danger }
 */
export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : opts || {};
  return new Promise(resolve => {
    if (!show) { resolve(window.confirm(o.message || o.title || '')); return; }   // host not mounted (tests)
    show({ ...o, resolve });
  });
}

/** Used by DialogHost: receives each request. */
export function registerDialogHost(fn) {
  show = fn;
  return () => { if (show === fn) show = null; };
}
