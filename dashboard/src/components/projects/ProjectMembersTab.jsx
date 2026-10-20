import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, UserPlus, AlertCircle, SlidersHorizontal, Check } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { platform } from '../../lib/platform.js';
import { ROLE_LABEL, isMember } from '../../lib/review.js';
import { avatarColor, initials } from '../../lib/avatar.js';

const ROLES = ['OWNER', 'MAINTAINER', 'PM', 'BA', 'TECH_LEAD', 'DESIGNER', 'DEVELOPER', 'TESTER', 'VIEWER'];

export default function ProjectMembersTab({ pid, canManage }) {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState({});
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  const load = useCallback(async () => {
    try {
      const m = await platform.members(pid);
      setRows(m);
      const us = await platform.users(m.map(x => x.userId));
      setUsers(Object.fromEntries(us.map(u => [u.id, u])));
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const setRoles = async (userId, roles) => {
    setSaving(true);
    try {
      await platform.setMemberRoles(pid, userId, roles);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const add = async e => {
    e.preventDefault();
    setErr('');
    try {
      const u = await platform.lookupUser(email.trim());
      if (isMember(rows, u.id)) {
        setErr(`${email.trim()} đã là thành viên — bấm "Sửa vai trò" tại dòng của họ để cấp thêm quyền.`);
        return;
      }
      await platform.setMemberRoles(pid, u.id, ['VIEWER']);
      setEmail('');
      await load();
    } catch (e2) {
      setErr(e2.status === 404
        ? `Không tìm thấy người dùng ${email.trim()} — quản trị viên cần tạo tài khoản ở mục Người dùng trước.`
        : e2.message);
    }
  };

  return (
    <div className="pj-tab-stack">
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
          <button className="linklike" onClick={() => setErr('')} style={{ color: 'inherit', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <div className="card-panel pj-apple-card">
        <div className="card-header pj-apple-card-head">
          <div className="card-header-title">
            <span>Thành viên dự án</span>
            <span className="bdg bdg-neutral">{rows.length}</span>
          </div>

          {canManage && (
            <form className="pj-inline-invite" onSubmit={add}>
              <input
                type="email"
                required
                aria-label="Email thành viên mới"
                placeholder="Thêm bằng email (vd: dev@cong-ty.vn)…"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pj-inline-invite-input"
              />
              <Button type="submit" size="sm" variant="primary" icon={UserPlus}>
                Thêm
              </Button>
            </form>
          )}
        </div>

        <div className="pj-member-list">
          {rows.length === 0 ? (
            <div className="pj-empty-row">
              Chưa có thành viên nào trong dự án này.
            </div>
          ) : (
            rows.map(r => {
              const u = users[r.userId];
              const name = u?.fullName || r.userId;
              const emailStr = u?.email || '';
              const ini = initials(name, emailStr, 'P');
              const avatarBg = avatarColor(r.userId || emailStr);
              const isEditing = editingUserId === r.userId;

              return (
                <div key={r.userId} className={`pj-member-row${isEditing ? ' is-editing' : ''}`}>
                  <div className="pj-member-main">
                    <div className="user-info-cell">
                      <div className="user-avatar" style={{ backgroundColor: avatarBg }}>
                        {ini}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name-row">{name}</div>
                        {emailStr && <div className="user-email-row">{emailStr}</div>}
                      </div>
                    </div>

                    <div className="pj-member-right">
                      <div className="pj-active-roles">
                        {r.roles.map(role => (
                          <Badge key={role} tone={role === 'OWNER' ? 'accent' : 'neutral'}>
                            {ROLE_LABEL[role] || role}
                          </Badge>
                        ))}
                      </div>

                      {canManage && (
                        <div className="pj-member-actions">
                          <button
                            type="button"
                            className={`pj-role-edit-toggle${isEditing ? ' active' : ''}`}
                            onClick={() => setEditingUserId(isEditing ? null : r.userId)}>
                            {isEditing ? <Check size={12} /> : <SlidersHorizontal size={12} />}
                            <span>{isEditing ? 'Xong' : 'Vai trò'}</span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            aria-label="Xoá thành viên"
                            title="Xoá thành viên khỏi dự án"
                            onClick={() => window.confirm(`Xoá thành viên ${name} khỏi dự án?`)
                              && platform.removeMember(pid, r.userId).then(load, e => setErr(e.message))}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {canManage && isEditing && (
                    <div className="pj-role-drawer">
                      <span className="pj-role-drawer-label">Bật / tắt vai trò cho {name}:</span>
                      <div className="role-chips-group">
                        {ROLES.map(role => {
                          const active = r.roles.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              disabled={saving}
                              aria-pressed={active}
                              className={`role-chip-pill${active ? ' active' : ''}`}
                              onClick={() => {
                                const next = active
                                  ? r.roles.filter(x => x !== role)
                                  : [...r.roles, role];
                                if (next.length) setRoles(r.userId, next);
                              }}>
                              <span className="role-chip-dot" />
                              <span>{ROLE_LABEL[role]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pj-card-footnote">
          Một thành viên có thể giữ nhiều vai trò (PM, BA, Developer, Tester…). Các bước chưa có người phụ trách riêng sẽ do <b>Owner</b> duyệt thay.
        </div>
      </div>
    </div>
  );
}
