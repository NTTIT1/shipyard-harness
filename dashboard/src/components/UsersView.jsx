import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, KeyRound, Lock, Unlock } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Modal from './Modal.jsx';
import { platform } from '../lib/platform.js';
import { validateNewUser, validatePassword, userState, isAdmin } from '../lib/users.js';

const EMPTY = { email: '', fullName: '', password: '', systemRole: 'USER' };

function ResetPassword({ target, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const v = validatePassword(pw, pw2);
    if (v) return setErr(v);
    try { await platform.resetPassword(target.id, pw); onDone(`Đã đặt lại mật khẩu cho ${target.email}.`); onClose(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Đặt lại mật khẩu — ${target.email}`} onClose={onClose}
      buttons={[{ label: 'Huỷ', fn: onClose }, { label: 'Đặt lại', cls: 'add', fn: save }]}>
      <div className="pj-form">
        <input type="password" autoComplete="new-password" aria-label="Mật khẩu mới" placeholder="Mật khẩu mới (≥ 8 ký tự)" value={pw} onChange={e => setPw(e.target.value)} />
        <input type="password" autoComplete="new-password" aria-label="Nhập lại mật khẩu" placeholder="Nhập lại" value={pw2} onChange={e => setPw2(e.target.value)} />
        {err && <p className="m-err" role="alert">{err}</p>}
        <p className="rv-sub">Người dùng sẽ bị đăng xuất khỏi các thiết bị khác và được mở khoá nếu đang bị tạm khoá.</p>
      </div>
    </Modal>
  );
}

function MyPassword({ onLogout }) {
  const [f, setF] = useState({ cur: '', pw: '', pw2: '' });
  const [msg, setMsg] = useState({ err: '', ok: '' });
  const submit = async e => {
    e.preventDefault();
    const v = validatePassword(f.pw, f.pw2);
    if (v) return setMsg({ err: v, ok: '' });
    try {
      await platform.changeMyPassword(f.cur, f.pw);
      setF({ cur: '', pw: '', pw2: '' });
      setMsg({ err: '', ok: 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới…' });
      setTimeout(() => onLogout?.(), 1500);
    } catch (e2) { setMsg({ err: e2.message === 'Current password is incorrect' ? 'Mật khẩu hiện tại không đúng.' : e2.message, ok: '' }); }
  };
  return (
    <form className="pj-form us-narrow" onSubmit={submit}>
      <strong>Đổi mật khẩu của tôi</strong>
      <input type="password" required autoComplete="current-password" aria-label="Mật khẩu hiện tại" placeholder="Mật khẩu hiện tại" value={f.cur} onChange={e => setF({ ...f, cur: e.target.value })} />
      <input type="password" required autoComplete="new-password" aria-label="Mật khẩu mới" placeholder="Mật khẩu mới (≥ 8 ký tự)" value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} />
      <input type="password" required autoComplete="new-password" aria-label="Nhập lại mật khẩu mới" placeholder="Nhập lại mật khẩu mới" value={f.pw2} onChange={e => setF({ ...f, pw2: e.target.value })} />
      {msg.err && <p className="m-err" role="alert">{msg.err}</p>}
      {msg.ok && <p className="rv-sub" role="status">{msg.ok}</p>}
      <Button type="submit" icon={KeyRound}>Đổi mật khẩu</Button>
    </form>
  );
}

function AdminUsers({ me }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const load = useCallback(async () => {
    try { setRows(await platform.adminUsers()); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, ok) => {
    setBusy(true); setNote('');
    try { await fn(); await load(); if (ok) setNote(ok); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const create = e => {
    e.preventDefault();
    const v = validateNewUser(form);
    if (v) return setErr(v);
    act(async () => { await platform.createUser(form); setForm(EMPTY); },
      `Đã tạo tài khoản ${form.email.trim()}. Gửi email + mật khẩu cho họ, rồi thêm họ vào dự án ở mục Dự án → Thành viên.`);
  };
  return (
    <>
      {err && <p className="m-err" role="alert">{err}</p>}
      {note && <p className="rv-sub" role="status">{note}</p>}
      <div className="us-scroll">
        <table className="grid">
          <thead><tr><th>Người dùng</th><th>Quyền hệ thống</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {rows.map(u => {
              const st = userState(u);
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td>{u.fullName}{self && <span className="faint"> (bạn)</span>}<div className="faint">{u.email}</div></td>
                  <td>
                    <select aria-label={`Quyền hệ thống của ${u.email}`} value={u.systemRole} disabled={busy || self}
                      onChange={e => act(() => platform.updateUser(u.id, { systemRole: e.target.value }))}>
                      <option value="USER">Người dùng</option>
                      <option value="SYS_ADMIN">Quản trị hệ thống</option>
                    </select>
                  </td>
                  <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="us-actions">
                    <Button size="sm" variant="ghost" icon={KeyRound} disabled={busy} onClick={() => setResetFor(u)}>Đặt lại mật khẩu</Button>
                    {!self && (u.status === 'DISABLED'
                      ? <Button size="sm" variant="ghost" icon={Unlock} disabled={busy}
                          onClick={() => act(() => platform.updateUser(u.id, { status: 'ACTIVE' }), `Đã mở khoá ${u.email}.`)}>Mở khoá</Button>
                      : <Button size="sm" variant="ghost" icon={Lock} disabled={busy}
                          onClick={() => window.confirm(`Khoá tài khoản ${u.email}? Họ sẽ không đăng nhập được nữa.`)
                            && act(() => platform.updateUser(u.id, { status: 'DISABLED' }), `Đã khoá ${u.email}.`)}>Khoá</Button>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="pj-form us-narrow" onSubmit={create}>
        <strong>Tạo tài khoản</strong>
        <input type="email" required aria-label="Email" placeholder="email@công-ty.vn" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <input required aria-label="Họ tên" placeholder="Họ tên" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
        <input type="password" required autoComplete="new-password" aria-label="Mật khẩu ban đầu" placeholder="Mật khẩu ban đầu (≥ 8 ký tự)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <select aria-label="Quyền hệ thống" value={form.systemRole} onChange={e => setForm({ ...form, systemRole: e.target.value })}>
          <option value="USER">Người dùng</option>
          <option value="SYS_ADMIN">Quản trị hệ thống</option>
        </select>
        <Button type="submit" variant="primary" icon={UserPlus} disabled={busy}>Tạo tài khoản</Button>
      </form>
      <p className="rv-sub">Quyền hệ thống chỉ quyết định ai quản lý tài khoản. Ai được vào dự án nào, giữ vai trò gì (PM, BA, Tester…) thì đặt ở <b>Dự án → Thành viên</b>.</p>
      {resetFor && <ResetPassword target={resetFor} onClose={() => setResetFor(null)} onDone={setNote} />}
    </>
  );
}

export default function UsersView({ user, onLogout }) {
  const admin = isAdmin(user);
  return (
    <section className="rv-page" aria-labelledby="us-title">
      <h1 id="us-title" className="rv-h1">{admin ? 'Người dùng' : 'Tài khoản'}</h1>
      {admin && <AdminUsers me={user} />}
      <MyPassword onLogout={onLogout} />
    </section>
  );
}
