import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Copy, UserPlus } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import MemoryPanel from './MemoryPanel.jsx';
import { platform } from '../lib/platform.js';
import { STEPS, STEP_LABEL, ROLE_LABEL, isMember } from '../lib/review.js';

const ROLES = ['OWNER', 'MAINTAINER', 'PM', 'BA', 'TECH_LEAD', 'DESIGNER', 'DEVELOPER', 'TESTER', 'VIEWER'];

function Members({ pid, canManage }) {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState({});
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const m = await platform.members(pid);
      setRows(m);
      const us = await platform.users(m.map(x => x.userId));
      setUsers(Object.fromEntries(us.map(u => [u.id, u])));
      setErr('');
    } catch (e) { setErr(e.message); }
  }, [pid]);
  useEffect(() => { load(); }, [load]);
  const setRoles = async (userId, roles) => {
    setSaving(true);
    try { await platform.setMemberRoles(pid, userId, roles); await load(); } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const add = async e => {
    e.preventDefault();
    setErr('');
    try {
      const u = await platform.lookupUser(email.trim());
      if (isMember(rows, u.id)) { setErr(`${email.trim()} đã là thành viên — đổi vai trò trong bảng.`); return; }
      await platform.setMemberRoles(pid, u.id, ['VIEWER']);
      setEmail('');
      await load();
    } catch (e2) { setErr(e2.status === 404 ? `Không tìm thấy người dùng ${email.trim()} — quản trị viên cần tạo tài khoản cho họ ở mục Người dùng trước.` : e2.message); }
  };
  return (
    <div className="rv-page">
      {err && <p className="m-err" role="alert">{err}</p>}
      <table className="grid">
        <thead><tr><th>Thành viên</th><th>Vai trò</th>{canManage && <th />}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.userId}>
              <td>{users[r.userId]?.fullName || r.userId}<div className="faint">{users[r.userId]?.email}</div></td>
              <td>{canManage ? (
                <div className="role-checks">{ROLES.map(role => (
                  <label key={role}><input type="checkbox" disabled={saving} checked={r.roles.includes(role)}
                    onChange={e => {
                      const next = e.target.checked ? [...r.roles, role] : r.roles.filter(x => x !== role);
                      if (next.length) setRoles(r.userId, next);
                    }} /> {ROLE_LABEL[role]}</label>))}</div>
              ) : r.roles.map(role => <Badge key={role}>{ROLE_LABEL[role]}</Badge>)}</td>
              {canManage && <td><Button size="sm" variant="ghost" icon={Trash2} aria-label="Xoá thành viên"
                onClick={() => window.confirm('Xoá thành viên này khỏi dự án?') && platform.removeMember(pid, r.userId).then(load, e => setErr(e.message))} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <form className="mem-bar" onSubmit={add}>
          <input type="email" required aria-label="Email thành viên mới" placeholder="email@công-ty.vn" value={email} onChange={e => setEmail(e.target.value)} />
          <Button type="submit" icon={UserPlus}>Thêm thành viên</Button>
        </form>
      )}
      <p className="rv-sub">Một người có thể giữ nhiều vai trò. Vai trò chưa ai giữ thì Owner duyệt thay.</p>
    </div>
  );
}

function GatePolicy({ pid, canManage }) {
  const [policy, setPolicy] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { platform.gatePolicy(pid).then(setPolicy, e => setErr(e.message)); }, [pid]);
  const toggle = async (step, auto) => {
    try { setPolicy(await platform.setGatePolicy(pid, { [step]: auto ? 'AUTO' : 'REQUIRED' })); } catch (e) { setErr(e.message); }
  };
  if (!policy) return err ? <p className="m-err">{err}</p> : <p className="muted-empty">Đang tải…</p>;
  return (
    <div className="rv-page">
      {err && <p className="m-err">{err}</p>}
      <table className="grid"><thead><tr><th>Bước</th><th>Chế độ</th></tr></thead><tbody>
        {STEPS.map(s => (
          <tr key={s}><td>{STEP_LABEL[s]}</td><td>
            <label className="rv-sub"><input type="checkbox" disabled={!canManage} checked={policy[s] === 'AUTO'} onChange={e => toggle(s, e.target.checked)} /> Tự động duyệt</label>
          </td></tr>))}
      </tbody></table>
      <p className="rv-sub">Bước tự động vẫn được ghi lịch sử và vẫn đưa vào bộ nhớ, nhưng không chờ người duyệt.</p>
    </div>
  );
}

function Runs({ pid, onOpenRun }) {
  const [runs, setRuns] = useState([]);
  useEffect(() => { platform.projectRuns(pid).then(setRuns, () => setRuns([])); }, [pid]);
  if (!runs.length) return <p className="muted-empty">Chưa có tính năng nào chạy qua quy trình role.</p>;
  return (
    <table className="grid"><thead><tr><th>Tính năng</th><th>Bước</th><th>Trạng thái</th></tr></thead><tbody>
      {runs.map(r => (
        <tr key={r.id}><td><button className="linklike" onClick={() => onOpenRun(r.id)}>{r.title}</button></td>
          <td>{STEP_LABEL[r.currentStep] || '—'}</td><td><Badge>{r.status}</Badge></td></tr>))}
    </tbody></table>
  );
}

export default function ProjectsView({ onOpenRun }) {
  const [projects, setProjects] = useState([]);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('members');
  const [form, setForm] = useState({ name: '', slug: '', repoUrl: '' });
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { const ps = await platform.projects(); setProjects(ps); setSel(s => s || ps[0]?.id || null); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async e => {
    e.preventDefault();
    try { const p = await platform.createProject(form); setForm({ name: '', slug: '', repoUrl: '' }); await load(); setSel(p.id); }
    catch (e2) { setErr(e2.message); }
  };
  const project = projects.find(p => p.id === sel);
  const roles = project?.currentUserRoles || [];
  const canManage = roles.includes('OWNER') || roles.includes('MAINTAINER');
  return (
    <section className="rv-page" aria-labelledby="pj-title">
      <h1 id="pj-title" className="rv-h1">Dự án</h1>
      {err && <p className="m-err">{err}</p>}
      <div className="pj-grid">
        <div className="pj-list">
          {projects.map(p => (
            <Button key={p.id} variant={p.id === sel ? 'secondary' : 'ghost'} onClick={() => setSel(p.id)}>{p.name}</Button>
          ))}
          <form className="pj-form" onSubmit={create}>
            <strong>Tạo dự án</strong>
            <input required aria-label="Tên dự án" placeholder="Tên" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input required aria-label="Slug" placeholder="slug-khong-dau" pattern="[a-z0-9_-]+" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
            <input required aria-label="Repo URL" placeholder="https://github.com/…" value={form.repoUrl} onChange={e => setForm({ ...form, repoUrl: e.target.value })} />
            <Button type="submit" variant="primary" icon={Plus}>Tạo</Button>
          </form>
        </div>
        {project ? (
          <div className="rv-page">
            <div className="rv-head">
              <div><strong>{project.name}</strong> <span className="faint mono">{project.slug}</span></div>
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => navigator.clipboard?.writeText(project.id)}>
                Mã dự án: <span className="mono">{project.id}</span></Button>
            </div>
            <p className="rv-sub">Để lane chạy quy trình role cho dự án này, đặt <span className="mono">PLATFORM_PROJECT_ID="{project.id}"</span> trong integrations.env của profile.</p>
            <Tabs value={tab} onChange={setTab} items={[{ id: 'members', label: 'Thành viên' }, { id: 'gates', label: 'Cổng duyệt' },
              { id: 'runs', label: 'Tính năng' }, { id: 'memory', label: 'Bộ nhớ' }]} />
            {tab === 'members' && <Members key={project.id} pid={project.id} canManage={canManage} />}
            {tab === 'gates' && <GatePolicy key={project.id} pid={project.id} canManage={canManage} />}
            {tab === 'runs' && <Runs key={project.id} pid={project.id} onOpenRun={onOpenRun} />}
            {tab === 'memory' && <MemoryPanel key={project.id} projectId={project.id} canManage={canManage} />}
          </div>
        ) : <p className="muted-empty">Chọn hoặc tạo một dự án.</p>}
      </div>
    </section>
  );
}
