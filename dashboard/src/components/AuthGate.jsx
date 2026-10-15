import React, { useEffect, useState, useCallback } from 'react';
import LoginPage from './LoginPage.jsx';
import { fetchMe, logout } from '../lib/api.js';

// Renders the app only for a signed-in user. The server is the real gate (every
// /api, /proof, /spec route 401s without the session cookie); this just decides
// which screen to show and reacts when a session expires mid-use.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ phase: 'loading', user: null, authEnabled: true, notice: '' });

  useEffect(() => {
    fetchMe()
      .then(r => setState(r.ok
        ? { phase: 'in', user: r.user, authEnabled: r.authEnabled !== false, notice: '' }
        : { phase: 'out', user: null, authEnabled: true, notice: '' }))
      .catch(() => setState({ phase: 'out', user: null, authEnabled: true, notice: '' }));
    const expired = () => setState(s => s.phase === 'in' && s.authEnabled
      ? { phase: 'out', user: null, authEnabled: true, notice: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' }
      : s);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  const onLogout = useCallback(async () => {
    await logout().catch(() => {});
    setState({ phase: 'out', user: null, authEnabled: true, notice: '' });
  }, []);

  if (state.phase === 'loading') return <div className="login" aria-busy="true" />;
  if (state.phase === 'out') {
    return <LoginPage notice={state.notice} onLogin={user => setState({ phase: 'in', user, authEnabled: true, notice: '' })} />;
  }
  return children({ user: state.user, onLogout: state.authEnabled ? onLogout : null });
}
