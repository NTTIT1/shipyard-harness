import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/review.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import DialogHost from './components/ui/DialogHost.jsx';
import './index.css';
import { lang, tr } from './lib/i18n.js';

document.documentElement.lang = lang;

// The dashboard was rebuilt while this tab was open: the old page asks for files that are gone. Reload once
// to get the new build instead of a blank screen.
window.addEventListener('vite:preloadError', e => {
  try {
    if (sessionStorage.getItem('shipyard-reloaded-for-build')) return;
    sessionStorage.setItem('shipyard-reloaded-for-build', '1');
  } catch { /* storage blocked: still reload once */ }
  e.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => { setTimeout(() => { try { sessionStorage.removeItem('shipyard-reloaded-for-build'); } catch { /* none */ } }, 10000); });

// Last line of defence: any render error shows what broke and a way back, never a white page.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary title={tr('Giao diện gặp lỗi')} reload>
    <AuthGate>{auth => <App {...auth} />}</AuthGate>
    <DialogHost />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
