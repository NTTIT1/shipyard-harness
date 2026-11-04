import { confirmDialog } from '../lib/dialog.js';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  UserPlus, KeyRound, Lock, Unlock, Users, Shield, User,
  CheckCircle2, AlertCircle, Search, Mail, Info, ShieldCheck, X
} from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Modal from './Modal.jsx';
import { platform } from '../lib/platform.js';
import { validateNewUser, validatePassword, userState, isAdmin } from '../lib/users.js';
import { avatarColor, initials } from '../lib/avatar.js';
import { tr } from '../lib/i18n.js';

const EMPTY = { email: '', fullName: '', password: '', systemRole: 'USER' };

function ResetPassword({ target, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const v = validatePassword(pw, pw2);
    if (v) return setErr(v);
    try {
      await platform.resetPassword(target.id, pw);
      onDone(tr('Đã đặt lại mật khẩu cho {0}.', [target.email]));
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal title={tr('Đặt lại mật khẩu — {0}', [target.email])} onClose={onClose}
      buttons={[{ label: tr('Huỷ'), fn: onClose }, { label: tr('Đặt lại'), cls: 'add', fn: save }]}>
      <div className="pj-form" style={{ border: 'none', padding: 0 }}>
        <div className="form-field u-mb10">
          <label className="form-label">{tr('Mật khẩu mới')}</label>
          <input type="password" autoComplete="new-password" aria-label={tr('Mật khẩu mới')}
            placeholder={tr('Mật khẩu mới (≥ 8 ký tự)')} value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        <div className="form-field u-mb10">
          <label className="form-label">{tr('Nhập lại mật khẩu')}</label>
          <input type="password" autoComplete="new-password" aria-label={tr('Nhập lại mật khẩu')}
            placeholder={tr('Nhập lại')} value={pw2} onChange={e => setPw2(e.target.value)} />
        </div>
        {err && (
          <div className="alert-banner err" role="alert">
            <AlertCircle size={16} />
            <div className="alert-banner-content">{err}</div>
          </div>
        )}
        <div className="alert-banner info u-mt8">
          <Info size={16} />
          <div className="alert-banner-content rv-sub u-m0">{tr('Người dùng sẽ bị đăng xuất khỏi các thiết bị khác và được mở khoá nếu đang bị tạm khoá.')}</div>
        </div>
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
      setMsg({ err: '', ok: tr('Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới…') });
      setTimeout(() => onLogout?.(), 1500);
    } catch (e2) {
      setMsg({ err: e2.message === 'Current password is incorrect' ? tr('Mật khẩu hiện tại không đúng.') : e2.message, ok: '' });
    }
  };
  return (
    <div className="card-panel">
      <div className="card-header">
        <div className="card-header-title">
          <KeyRound size={17} className="ic-accent" />
          <span>{tr('Đổi mật khẩu của tôi')}</span>
        </div>
      </div>
      <div className="card-body">
        <form className="pj-form us-narrow" onSubmit={submit} style={{ border: 'none', padding: 0 }}>
          <div className="form-field">
            <label className="form-label">{tr('Mật khẩu hiện tại')}</label>
            <input type="password" required autoComplete="current-password" aria-label={tr('Mật khẩu hiện tại')}
              placeholder={tr('Nhập mật khẩu hiện tại')} value={f.cur} onChange={e => setF({ ...f, cur: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="form-label">{tr('Mật khẩu mới')}</label>
            <input type="password" required autoComplete="new-password" aria-label={tr('Mật khẩu mới')}
              placeholder={tr('Mật khẩu mới (≥ 8 ký tự)')} value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} />
          </div>
          <div className="form-field">
            <label className="form-label">{tr('Xác nhận mật khẩu mới')}</label>
            <input type="password" required autoComplete="new-password" aria-label={tr('Nhập lại mật khẩu mới')}
              placeholder={tr('Nhập lại mật khẩu mới')} value={f.pw2} onChange={e => setF({ ...f, pw2: e.target.value })} />
          </div>
          {msg.err && (
            <div className="alert-banner err" role="alert">
              <AlertCircle size={16} />
              <div className="alert-banner-content m-err u-m0">{msg.err}</div>
            </div>
          )}
          {msg.ok && (
            <div className="alert-banner ok" role="status">
              <CheckCircle2 size={16} />
              <div className="alert-banner-content rv-sub u-m0 ic-ok">{msg.ok}</div>
            </div>
          )}
          <div className="u-mt4">
            <Button type="submit" variant="primary" icon={KeyRound}>{tr('Đổi mật khẩu')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminUsers({ me }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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
    act(async () => {
      await platform.createUser(form);
      setForm(EMPTY);
      setShowAdd(false);
    }, tr('Đã tạo tài khoản {0}. Gửi email + mật khẩu cho họ, rồi thêm họ vào dự án ở mục Dự án → Thành viên.', [form.email.trim()]));
  };

  // KPI calculations
  const stats = useMemo(() => {
    const total = rows.length;
    const admins = rows.filter(u => u.systemRole === 'SYS_ADMIN').length;
    const active = rows.filter(u => u.status === 'ACTIVE' && (!u.lockedUntil || Date.parse(u.lockedUntil) <= Date.now())).length;
    const locked = rows.filter(u => u.status === 'DISABLED' || (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now())).length;
    return { total, admins, active, locked };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(u =>
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <>
      {/* Top KPI Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon accent"><Users size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{stats.total}</span>
            <span className="stat-label">{tr('Tổng tài khoản')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><Shield size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{stats.admins}</span>
            <span className="stat-label">{tr('Quản trị viên')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon ok"><CheckCircle2 size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{stats.active}</span>
            <span className="stat-label">{tr('Đang hoạt động')}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warn"><Lock size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{stats.locked}</span>
            <span className="stat-label">{tr('Đã / Tạm khoá')}</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={18} />
          <div className="alert-banner-content m-err u-m0">{err}</div>
          <button className="linklike" onClick={() => setErr('')} style={{ color: 'inherit', marginLeft: 'auto' }}>✕</button>
        </div>
      )}
      {note && (
        <div className="alert-banner ok" role="status">
          <CheckCircle2 size={18} />
          <div className="alert-banner-content rv-sub u-m0 ic-ok">{note}</div>
          <button className="linklike" onClick={() => setNote('')} style={{ color: 'inherit', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {/* User Directory Card */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <Users size={18} className="ic-accent" />
            <span>{tr('Danh sách người dùng')}</span>
            <span className="bdg bdg-neutral" style={{ marginLeft: 4 }}>{filteredRows.length}</span>
          </div>
          <Button
            size="sm"
            variant={showAdd ? 'secondary' : 'primary'}
            icon={showAdd ? X : UserPlus}
            onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? tr('Đóng form tạo') : tr('Tạo tài khoản')}
          </Button>
        </div>

        {/* Collapsible / Expandable Create User Section */}
        {showAdd && (
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: '16px 18px' }}>
            <form className="pj-form" onSubmit={create} style={{ border: 'none', padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <UserPlus size={16} className="ic-accent" />
                <strong style={{ fontSize: 13.5 }}>{tr('Tạo tài khoản mới')}</strong>
              </div>
              <div className="form-grid-2">
                <div className="form-field">
                  <label className="form-label">{tr('Email đăng nhập')}</label>
                  <input type="email" required aria-label="Email" placeholder={tr('email@công-ty.vn')}
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">{tr('Họ và tên')}</label>
                  <input required aria-label={tr('Họ tên')} placeholder={tr('Họ tên người dùng')}
                    value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">{tr('Mật khẩu ban đầu')}</label>
                  <input type="password" required autoComplete="new-password" aria-label={tr('Mật khẩu ban đầu')}
                    placeholder={tr('Mật khẩu ban đầu (≥ 8 ký tự)')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="form-field">
                  <label className="form-label">{tr('Quyền hệ thống')}</label>
                  <select aria-label={tr('Quyền hệ thống')} value={form.systemRole}
                    onChange={e => setForm({ ...form, systemRole: e.target.value })}>
                    <option value="USER">{tr('Người dùng (USER)')}</option>
                    <option value="SYS_ADMIN">{tr('Quản trị hệ thống (SYS_ADMIN)')}</option>
                  </select>
                </div>
              </div>
              <div className="row-wrap-8 u-mt12">
                <Button type="submit" variant="primary" icon={UserPlus} disabled={busy}>{tr('Tạo tài khoản')}</Button>
                <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>{tr('Huỷ')}</Button>
              </div>
            </form>
          </div>
        )}

        {/* Search bar inside directory */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="filter-bar">
            <div className="search-input-wrap">
              <Search size={15} />
              <input
                type="search"
                aria-label={tr('Tìm người dùng')}
                placeholder={tr('Tìm người dùng theo tên hoặc email…')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            {query && (
              <Button size="sm" variant="ghost" onClick={() => setQuery('')}>{tr('Xoá bộ lọc')}</Button>
            )}
          </div>
        </div>

        {/* User Table */}
        <div className="us-scroll modern-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="grid modern-table">
            <thead>
              <tr>
                <th>{tr('Người dùng')}</th>
                <th>{tr('Quyền hệ thống')}</th>
                <th>{tr('Trạng thái')}</th>
                <th className="u-right">{tr('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-faint)' }}>{tr('Không tìm thấy người dùng nào phù hợp với "{0}".', [query])}</td>
                </tr>
              ) : (
                filteredRows.map(u => {
                  const st = userState(u);
                  const self = u.id === me?.id;
                  const ini = initials(u.fullName, u.email);
                  const avatarBg = avatarColor(u.id || u.email);

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="user-info-cell">
                          <div className="user-avatar" style={{ backgroundColor: avatarBg }}>
                            {ini}
                          </div>
                          <div>
                            <div className="user-name-row">
                              <span>{u.fullName || '—'}</span>
                              {self && <Badge tone="accent">{tr('bạn')}</Badge>}
                            </div>
                            <div className="user-email-row">
                              <Mail size={12} className="u-o70" />
                              <span>{u.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="irow-6">
                          {u.systemRole === 'SYS_ADMIN' ? (
                            <Shield size={15} className="ic-info" />
                          ) : (
                            <User size={15} className="u-faint" />
                          )}
                          <select
                            aria-label={tr('Quyền hệ thống của {0}', [u.email])}
                            value={u.systemRole}
                            disabled={busy || self}
                            className="role-select-box"
                            onChange={e => act(() => platform.updateUser(u.id, { systemRole: e.target.value }))}>
                            <option value="USER">{tr('Người dùng')}</option>
                            <option value="SYS_ADMIN">{tr('Quản trị hệ thống')}</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <Badge tone={st.tone} dot={true}>{st.label}</Badge>
                      </td>
                      <td className="us-actions" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={KeyRound}
                          disabled={busy}
                          title={tr('Đặt lại mật khẩu cho tài khoản này')}
                          onClick={() => setResetFor(u)}>{tr('Đặt lại mật khẩu')}</Button>
                        {!self && (u.status === 'DISABLED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Unlock}
                            disabled={busy}
                            title={tr('Mở khoá tài khoản')}
                            onClick={() => act(() => platform.updateUser(u.id, { status: 'ACTIVE' }), tr('Đã mở khoá {0}.', [u.email]))}>{tr('Mở khoá')}</Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Lock}
                            disabled={busy}
                            title={tr('Khoá tài khoản')}
                            onClick={async () => (await confirmDialog({ title: tr('Khoá tài khoản'), message: tr('Khoá tài khoản {0}? Họ sẽ không đăng nhập được nữa.', [u.email]), confirmLabel: tr('Khoá'), danger: true }))
                              && act(() => platform.updateUser(u.id, { status: 'DISABLED' }), tr('Đã khoá {0}.', [u.email]))}>{tr('Khoá')}</Button>
                        ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Informative Callout */}
      <div className="alert-banner info">
        <Info size={18} className="ic-accent" />
        <div className="alert-banner-content rv-sub u-m0">
          <b>{tr('Quyền hệ thống')}</b>{' '}{tr('quyết định ai quản lý tài khoản và thiết lập toàn cục. Để phân quyền truy cập dự án cụ thể (PM, BA, Tech Lead, Tester…), hãy mở mục')}{' '}<b>{tr('Dự án → Thành viên')}</b>.
        </div>
      </div>

      {resetFor && <ResetPassword target={resetFor} onClose={() => setResetFor(null)} onDone={setNote} />}
    </>
  );
}

export default function UsersView({ user, onLogout }) {
  const admin = isAdmin(user);
  return (
    <section className="rv-page" aria-labelledby="us-title">
      <div className="rv-page-header">
        <div className="rv-page-title-wrap">
          <h1 id="us-title" className="rv-h1">
            <Users size={22} strokeWidth={1.75} className="ic-accent" />
            <span>{admin ? tr('Quản lý người dùng') : tr('Tài khoản cá nhân')}</span>
          </h1>
          <p className="rv-page-desc">
            {admin
              ? tr('Quản trị danh sách người dùng, cấp quyền hệ thống và quản lý bảo mật truy cập.')
              : tr('Xem thông tin tài khoản và cập nhật mật khẩu của bạn.')}
          </p>
        </div>
      </div>

      {admin && <AdminUsers me={user} />}
      <MyPassword onLogout={onLogout} />
    </section>
  );
}
