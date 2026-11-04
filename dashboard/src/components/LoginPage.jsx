import React, { useEffect, useRef, useState } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock, AlertCircle, ArrowUpFromLine, Loader2 } from 'lucide-react';
import LaneShowcase from './LaneShowcase.jsx';
import { login } from '../lib/api.js';
import { useTheme } from '../hooks/useTheme.js';
import { loginErrorVi } from '../lib/users.js';
import { tr } from '../lib/i18n.js';
import { LanguageMenu, ThemeToggle } from './TopActions.jsx';


/**
 * Sign in: the product on the left (logo, what it is), the form on the right; one column on a phone.
 * A wrong password shakes the card once (a still highlight under reduced motion) and says why.
 */
export default function LoginPage({ onLogin, notice }) {
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [caps, setCaps] = useState(false);
  const [shake, setShake] = useState(0);
  const pw = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await login(email.trim(), password).catch(() => ({ ok: false, error: tr('Không kết nối được dashboard') }));
    setBusy(false);
    if (r.ok) { onLogin(r.user); return; }
    setError(loginErrorVi(r.error) || tr('Đăng nhập thất bại'));
    setShake(n => n + 1);
  }
  // After a failed try the card is re-mounted to replay the shake: put the cursor back in the password.
  useEffect(() => { if (shake) pw.current?.select(); }, [shake]);
  const capsCheck = e => { if (e.getModifierState) setCaps(e.getModifierState('CapsLock')); };

  return (
    <main className="login">
      <div className="login-corner">
        <LanguageMenu />
        <ThemeToggle theme={theme} onToggle={toggle} />
      </div>

      <section className="login-hero" aria-label="GM AI Factory">
        <span className="sb-logo login-hero-logo" role="img" aria-label="GM AI Factory">
          <img src="/logo.png" alt="" className="sb-logo-img on-light" /><img src="/logo-light.png" alt="" className="sb-logo-img on-dark" />
        </span>
        <h2 className="login-hero-title">{tr('Đội AI làm phần mềm cho bạn')}</h2>
        <p className="login-hero-sub">{tr('Từ ý tưởng tới pull request đã kiểm thử — nhiều tính năng chạy song song, chi phí có hạn mức.')}</p>
        <LaneShowcase />
      </section>

      <section className="login-side">
        <form key={shake} className={`login-card${shake ? ' shake' : ''}`} onSubmit={submit} aria-labelledby="login-title" noValidate={false}>
          <span className="sb-logo login-card-logo" role="img" aria-label="GM AI Factory">
            <img src="/logo.png" alt="" className="sb-logo-img on-light" /><img src="/logo-light.png" alt="" className="sb-logo-img on-dark" />
          </span>
          <h1 id="login-title">{tr('Đăng nhập')}</h1>
          <p className="login-sub">{tr('Dùng tài khoản Shipyard Platform của bạn.')}</p>

          {notice && !error && <div className="login-note" role="status">{notice}</div>}
          {error && <div className="login-error" role="alert"><AlertCircle size={15} aria-hidden="true" /><span>{error}</span></div>}

          <label className="login-field">
            <span className="login-label">Email</span>
            <span className="login-input">
              <Mail size={16} aria-hidden="true" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="ban@congty.vn"
                required autoFocus spellCheck={false} aria-invalid={!!error} />
            </span>
          </label>
          <label className="login-field">
            <span className="login-label">{tr('Mật khẩu')}</span>
            <span className="login-input">
              <Lock size={16} aria-hidden="true" />
              <input ref={pw} type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={capsCheck} onKeyUp={capsCheck} autoComplete="current-password" required aria-invalid={!!error} />
              <button type="button" className={`login-eye${show ? ' on' : ''}`} onClick={() => setShow(!show)}
                aria-label={show ? tr('Ẩn mật khẩu') : tr('Hiện mật khẩu')} title={show ? tr('Ẩn mật khẩu') : tr('Hiện mật khẩu')}>
                {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
            {caps && <span className="login-caps" role="status"><ArrowUpFromLine size={12} aria-hidden="true" />{tr('Caps Lock đang bật')}</span>}
          </label>

          <button type="submit" className="login-btn" disabled={busy || !email.trim() || !password}>
            {busy ? <Loader2 size={16} className="login-spin" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
            <span>{busy ? tr('Đang đăng nhập…') : tr('Đăng nhập')}</span>
          </button>
          <p className="login-foot">{tr('Quên mật khẩu hoặc chưa có tài khoản? Liên hệ quản trị viên của hệ thống.')}</p>
        </form>
        <p className="login-copy">© GM AI Factory</p>
      </section>
    </main>
  );
}
