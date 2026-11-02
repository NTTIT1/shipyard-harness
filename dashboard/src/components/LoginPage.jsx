import React, { useState } from 'react';
import { Ship, LogIn, Eye, EyeOff, X } from 'lucide-react';
import Button from './ui/Button.jsx';
import { login } from '../lib/api.js';
import { useTheme } from '../hooks/useTheme.js';
import { loginErrorVi } from '../lib/users.js';
import { tr } from '../lib/i18n.js';
import LangSwitch from './ui/LangSwitch.jsx';

export default function LoginPage({ onLogin, notice }) {
  useTheme(); // applies the stored/OS theme before the app shell mounts
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await login(email.trim(), password).catch(() => ({ ok: false, error: tr('Không kết nối được dashboard') }));
    setBusy(false);
    if (r.ok) onLogin(r.user);
    else setError(loginErrorVi(r.error) || tr('Đăng nhập thất bại'));
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
        <div className="login-brand"><Ship size={22} strokeWidth={1.75} aria-hidden="true" /> <b>Shipyard</b><LangSwitch className="login-lang" /></div>
        <h1 id="login-title">{tr('Đăng nhập')}</h1>
        <p className="login-sub">{tr('Dùng tài khoản Shipyard Platform để vào dashboard.')}</p>
        {notice && !error && <div className="login-note">{notice}</div>}
        {error && <div className="m-status bad" role="alert"><X size={14} strokeWidth={2} aria-hidden="true" /> {error}</div>}
        <label className="m-l">Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="m-l">{tr('Mật khẩu')}<span className="m-pw">
            <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" required />
            <button type="button" className={`m-eye ${show ? 'on' : ''}`} onClick={() => setShow(!show)}
              aria-label={show ? tr('Ẩn mật khẩu') : tr('Hiện mật khẩu')}>
              {show ? <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          </span>
        </label>
        <Button type="submit" variant="primary" icon={LogIn} className="login-btn" disabled={busy}>
          {busy ? tr('Đang đăng nhập…') : tr('Đăng nhập')}
        </Button>
      </form>
    </main>
  );
}
