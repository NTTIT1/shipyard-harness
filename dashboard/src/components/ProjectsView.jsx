import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Plus, Trash2, Copy, Check, UserPlus, FolderKanban,
  GitBranch, ExternalLink, Search, CheckCircle2,
  AlertCircle, Shield, Info, ArrowRight, Layers, SlidersHorizontal,
  Cpu, RotateCcw, Save, Wand2
} from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import MemoryPanel from './MemoryPanel.jsx';
import DeleteProjectButton from './DeleteProjectButton.jsx';
import NewProjectWizard from './NewProjectWizard.jsx';
import StepModels from './StepModels.jsx';
import { platform } from '../lib/platform.js';
import { fetchProviders, saveFeatureModels } from '../lib/api.js';
import { STEPS, STEP_LABEL, ROLE_LABEL, isMember } from '../lib/review.js';

const ROLES = ['OWNER', 'MAINTAINER', 'PM', 'BA', 'TECH_LEAD', 'DESIGNER', 'DEVELOPER', 'TESTER', 'VIEWER'];

const STEP_DESCRIPTIONS = {
  PM: 'Xác định mục tiêu, phạm vi và tiêu chí nghiệm thu của tính năng.',
  BA: 'Phân tích quy trình nghiệp vụ và các ca sử dụng chi tiết.',
  ARCH: 'Thiết kế kiến trúc hệ thống, mô hình dữ liệu và sơ đồ luồng.',
  DESIGN: 'Thiết kế giao diện UI/UX và các tương tác người dùng.',
  DEV: 'Viết mã nguồn, tích hợp tính năng và giải quyết các phụ thuộc.',
  TEST: 'Kiểm thử chức năng, hiệu năng và xác thực kịch bản lỗi.',
};

const AVATAR_COLORS = [
  '#2563eb', '#059669', '#7c3aed', '#d97706', '#db2777', '#0891b2', '#4f46e5'
];

function getAvatarColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getInitials(name = '', email = '') {
  const clean = name.trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'P';
}

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
        setErr(`${email.trim()} đã là thành viên — đổi vai trò trong bảng.`);
        return;
      }
      await platform.setMemberRoles(pid, u.id, ['VIEWER']);
      setEmail('');
      await load();
    } catch (e2) {
      setErr(e2.status === 404
        ? `Không tìm thấy người dùng ${email.trim()} — quản trị viên cần tạo tài khoản cho họ ở mục Người dùng trước.`
        : e2.message);
    }
  };

  return (
    <div className="rv-page" style={{ gap: 14 }}>
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      {canManage && (
        <div className="card-panel" style={{ background: 'var(--bg-subtle)' }}>
          <div className="card-body" style={{ padding: '14px 16px' }}>
            <form className="mem-bar" onSubmit={add} style={{ alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                <UserPlus size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Thêm thành viên:</span>
              </div>
              <input
                type="email"
                required
                aria-label="Email thành viên mới"
                placeholder="email@công-ty.vn"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ minWidth: 260 }}
              />
              <Button type="submit" variant="primary" icon={UserPlus}>Thêm thành viên</Button>
            </form>
          </div>
        </div>
      )}

      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <span>Danh sách thành viên dự án</span>
            <span className="bdg bdg-neutral" style={{ marginLeft: 4 }}>{rows.length}</span>
          </div>
        </div>
        <div className="modern-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="grid modern-table">
            <thead>
              <tr>
                <th style={{ width: 260 }}>Thành viên</th>
                <th>Vai trò trong dự án</th>
                {canManage && <th style={{ width: 60, textAlign: 'right' }} />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 3 : 2} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-faint)' }}>
                    Chưa có thành viên nào trong dự án này.
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const u = users[r.userId];
                  const name = u?.fullName || r.userId;
                  const emailStr = u?.email || '';
                  const initials = getInitials(name, emailStr);
                  const avatarBg = getAvatarColor(r.userId || emailStr);

                  return (
                    <tr key={r.userId}>
                      <td>
                        <div className="user-info-cell">
                          <div className="user-avatar" style={{ backgroundColor: avatarBg }}>
                            {initials}
                          </div>
                          <div>
                            <div className="user-name-row">{name}</div>
                            {emailStr && <div className="user-email-row">{emailStr}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {canManage ? (
                          <div className="role-checks role-chips-group">
                            {ROLES.map(role => {
                              const active = r.roles.includes(role);
                              return (
                                <label key={role} className={`role-chip-pill${active ? ' active' : ''}`}>
                                  <input
                                    type="checkbox"
                                    disabled={saving}
                                    checked={active}
                                    onChange={e => {
                                      const next = e.target.checked
                                        ? [...r.roles, role]
                                        : r.roles.filter(x => x !== role);
                                      if (next.length) setRoles(r.userId, next);
                                    }}
                                  />
                                  <span>{ROLE_LABEL[role]}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {r.roles.map(role => (
                              <Badge key={role} tone="accent">{ROLE_LABEL[role]}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      {canManage && (
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            aria-label="Xoá thành viên"
                            title="Xoá thành viên khỏi dự án"
                            onClick={() => window.confirm(`Xoá thành viên ${name} khỏi dự án?`)
                              && platform.removeMember(pid, r.userId).then(load, e => setErr(e.message))}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="alert-banner info">
        <Info size={16} style={{ color: 'var(--accent)' }} />
        <div className="alert-banner-content rv-sub" style={{ margin: 0 }}>
          Một người có thể giữ nhiều vai trò (PM, BA, Developer, Tester...). Đối với các bước chưa có người giữ vai trò phụ trách, thành viên có vai trò <b>Owner</b> sẽ duyệt thay.
        </div>
      </div>
    </div>
  );
}

function GatePolicy({ pid, canManage }) {
  const [policy, setPolicy] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    platform.gatePolicy(pid).then(setPolicy, e => setErr(e.message));
  }, [pid]);

  const toggle = async (step, auto) => {
    try {
      setPolicy(await platform.setGatePolicy(pid, { [step]: auto ? 'AUTO' : 'REQUIRED' }));
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!policy) {
    return err ? (
      <div className="alert-banner err" role="alert">
        <AlertCircle size={16} />
        <div className="alert-banner-content">{err}</div>
      </div>
    ) : (
      <p className="muted-empty">Đang tải cấu hình cổng duyệt…</p>
    );
  }

  return (
    <div className="rv-page" style={{ gap: 14 }}>
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <SlidersHorizontal size={17} style={{ color: 'var(--accent)' }} />
            <span>Chính sách phê duyệt quy trình (Gates)</span>
          </div>
        </div>
        <div className="card-body" style={{ padding: 12 }}>
          <div className="gate-pipeline-list">
            {STEPS.map((s, idx) => {
              const isAuto = policy[s] === 'AUTO';
              return (
                <div key={s} className="gate-pipeline-card">
                  <div className="gate-card-left">
                    <div className="gate-step-index">{idx + 1}</div>
                    <div className="gate-card-texts">
                      <div className="gate-step-name">{STEP_LABEL[s]}</div>
                      <div className="gate-step-desc">
                        {STEP_DESCRIPTIONS[s] || 'Bước trong quy trình triển khai tính năng.'}
                      </div>
                    </div>
                  </div>
                  <div className="gate-card-right">
                    <label className="gate-switch-btn rv-sub">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={isAuto}
                        onChange={e => toggle(s, e.target.checked)}
                      />
                      <span>Tự động duyệt</span>
                    </label>
                    <Badge tone={isAuto ? 'ok' : 'warn'} dot={true}>
                      {isAuto ? 'Tự động' : 'Cần người duyệt'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="alert-banner info">
        <Info size={16} style={{ color: 'var(--accent)' }} />
        <div className="alert-banner-content rv-sub" style={{ margin: 0 }}>
          Các bước được đặt <b>Tự động duyệt</b> vẫn được ghi lại đầy đủ trong lịch sử và lưu vào bộ nhớ dự án, nhưng hệ thống sẽ tự động thông qua mà không phải chờ con người phê duyệt thủ công.
        </div>
      </div>
    </div>
  );
}

function Runs({ pid, onOpenRun }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providersData, setProvidersData] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [featForm, setFeatForm] = useState({ models: {}, impl_agents: 2, effort: {} });
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const r = await platform.projectRuns(pid);
      setRuns(r || []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
    fetchProviders().then(setProvidersData).catch(() => {});
  }, [pid]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const featureModels = providersData?.feature_models || {};
  const globalDefaults = providersData?.defaults || {};

  const openEditor = (key, titleFallback = '') => {
    if (editingKey === key) {
      setEditingKey(null);
      return;
    }
    const existing = featureModels[key] || (titleFallback && featureModels[titleFallback]) || null;
    setEditingKey(key);
    setFeatForm(existing || globalDefaults);
    setMsg('');
  };

  const handleSave = async (key, titleAlias = '') => {
    setSaving(true);
    setMsg('');
    try {
      const { impl_agents, effort, ...stepModels } = featForm || {};
      await saveFeatureModels({
        key,
        models: stepModels,
        impl_agents,
        effort,
      });
      if (titleAlias && titleAlias !== key) {
        await saveFeatureModels({
          key: titleAlias,
          models: stepModels,
          impl_agents,
          effort,
        });
      }
      await loadAll();
      setMsg(`Đã lưu cấu hình model cho tính năng "${titleAlias || key}"`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(`Lỗi: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key, titleAlias = '') => {
    setSaving(true);
    try {
      await saveFeatureModels({ key, reset: true });
      if (titleAlias && titleAlias !== key) {
        await saveFeatureModels({ key: titleAlias, reset: true });
      }
      await loadAll();
      setEditingKey(null);
    } catch {} finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="muted-empty">Đang tải danh sách tính năng…</p>;

  return (
    <div className="rv-page" style={{ gap: 14 }}>
      {msg && (
        <div className="alert-banner ok">
          <CheckCircle2 size={16} />
          <div className="alert-banner-content" style={{ margin: 0 }}>{msg}</div>
        </div>
      )}

      {/* Pre-configure Feature Model Rule */}
      <div className="card-panel" style={{ background: 'var(--bg-subtle)' }}>
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cấu hình trước Model cho tính năng mới:</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 460 }}>
            <input
              type="text"
              placeholder="Nhập tên tính năng hoặc spec slug (vd: auth-sso)…"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={Cpu}
              disabled={!newKey.trim()}
              onClick={() => {
                const k = newKey.trim();
                if (!k) return;
                openEditor(k, k);
                setNewKey('');
              }}>
              Chọn Model
            </Button>
          </div>
        </div>
        {editingKey && !runs.some(r => r.id === editingKey) && (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>Cấu hình Model cho tính năng: <span className="mono">{editingKey}</span></strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>Đóng</Button>
                <Button size="sm" variant="primary" icon={Save} disabled={saving} onClick={() => handleSave(editingKey, editingKey)}>
                  {saving ? 'Đang lưu…' : 'Lưu Model cho tính năng'}
                </Button>
              </div>
            </div>
            {providersData && featForm && (
              <StepModels
                info={providersData}
                value={featForm}
                onChange={setFeatForm}
              />
            )}
          </div>
        )}
      </div>

      {!runs.length ? (
        <div className="modern-empty-state">
          <div className="modern-empty-icon">
            <Layers size={22} />
          </div>
          <div className="modern-empty-title">Chưa có tính năng nào chạy qua quy trình role.</div>
          <div className="modern-empty-desc">
            Khi một lane được gán tính năng và cấu hình PLATFORM_PROJECT_ID của dự án này, tiến trình sẽ hiển thị tại đây.
          </div>
        </div>
      ) : (
        <div className="card-panel">
          <div className="card-header">
            <div className="card-header-title">
              <Layers size={17} style={{ color: 'var(--accent)' }} />
              <span>Danh sách tính năng & cấu hình Model riêng</span>
              <span className="bdg bdg-neutral" style={{ marginLeft: 4 }}>{runs.length}</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: 12 }}>
            <div className="runs-card-list">
              {runs.map(r => {
                const customCfg = featureModels[r.id] || featureModels[r.title];
                const isOpen = editingKey === r.id;
                return (
                  <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="run-item-card">
                      <div>
                        <button className="linklike run-title-link" onClick={() => onOpenRun(r.id)}>
                          <span>{r.title}</span>
                          <ArrowRight size={14} style={{ opacity: 0.6 }} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Bước hiện tại:</span>
                          <Badge tone="accent">{STEP_LABEL[r.currentStep] || '—'}</Badge>
                          {customCfg && (
                            <Badge tone="ok">Đã gắn Model riêng</Badge>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Button
                          size="sm"
                          variant={isOpen ? 'primary' : 'secondary'}
                          icon={Cpu}
                          onClick={() => openEditor(r.id, r.title)}>
                          {isOpen ? 'Đóng Model' : 'Model AI'}
                        </Button>
                        <Badge tone={r.status === 'APPROVED' || r.status === 'DONE' ? 'ok' : 'neutral'}>
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                    {isOpen && providersData && featForm && (
                      <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <strong style={{ fontSize: 13 }}>Model AI riêng cho tính năng: {r.title}</strong>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                              Ghi đè model của từng bước (PM, BA, Arch, Dev, Review, QC...) khi chạy tính năng này.
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {customCfg && (
                              <Button size="sm" variant="ghost" icon={RotateCcw} disabled={saving} onClick={() => handleReset(r.id, r.title)}>
                                Xoá cấu hình riêng
                              </Button>
                            )}
                            <Button size="sm" variant="primary" icon={Save} disabled={saving} onClick={() => handleSave(r.id, r.title)}>
                              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                            </Button>
                          </div>
                        </div>
                        <StepModels
                          info={providersData}
                          value={featForm}
                          onChange={setFeatForm}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsView({ user, onOpenRun }) {
  const [projects, setProjects] = useState([]);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('members');
  const [form, setForm] = useState({ name: '', slug: '', repoUrl: '' });
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchPj, setSearchPj] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [wizard, setWizard] = useState(false);

  const load = useCallback(async () => {
    try {
      const ps = await platform.projects();
      setProjects(ps);
      setSel(s => s || ps[0]?.id || null);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async e => {
    e.preventDefault();
    try {
      const p = await platform.createProject(form);
      setForm({ name: '', slug: '', repoUrl: '' });
      await load();
      setSel(p.id);
      setShowCreate(false);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const project = projects.find(p => p.id === sel);
  const roles = project?.currentUserRoles || [];
  const canManage = roles.includes('OWNER') || roles.includes('MAINTAINER');

  const filteredProjects = useMemo(() => {
    if (!searchPj.trim()) return projects;
    const q = searchPj.toLowerCase();
    return projects.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.slug || '').toLowerCase().includes(q)
    );
  }, [projects, searchPj]);

  const copyProjectId = () => {
    if (!project) return;
    navigator.clipboard?.writeText(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rv-page" aria-labelledby="pj-title">
      <div className="rv-page-header">
        <div className="rv-page-title-wrap">
          <h1 id="pj-title" className="rv-h1">
            <FolderKanban size={22} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
            <span>Quản lý dự án</span>
          </h1>
          <p className="rv-page-desc">
            Cấu hình thành viên, vai trò quy trình và chính sách cổng duyệt cho từng dự án.
          </p>
        </div>
      </div>

      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={18} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
          <button className="linklike" onClick={() => setErr('')} style={{ color: 'inherit', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <div className="pj-grid pj-modern-grid">
        {/* Left: Project Directory & Creation */}
        <div className="pj-sidebar">
          <div className="pj-nav-card">
            <div className="pj-nav-header">
              <span className="pj-nav-title">
                <FolderKanban size={14} />
                <span>Dự án ({projects.length})</span>
              </span>
              <Button
                size="sm"
                variant={showCreate ? 'secondary' : 'primary'}
                icon={Plus}
                onClick={() => setShowCreate(!showCreate)}>
                {showCreate ? 'Đóng' : 'Tạo'}
              </Button>
            </div>

            {/* Quick Search */}
            {projects.length > 3 && (
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                <div className="search-input-wrap">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Lọc dự án…"
                    value={searchPj}
                    onChange={e => setSearchPj(e.target.value)}
                    style={{ padding: '5px 8px 5px 28px', fontSize: 12.5 }}
                  />
                </div>
              </div>
            )}

            {/* Project List */}
            <div className="pj-list pj-nav-list">
              {filteredProjects.map(p => (
                <button
                  key={p.id}
                  className={`pj-item-btn${p.id === sel ? ' active' : ''}`}
                  onClick={() => setSel(p.id)}>
                  <div className="pj-item-icon">
                    <FolderKanban size={15} />
                  </div>
                  <div className="pj-item-meta">
                    <span className="pj-item-name">{p.name}</span>
                    <span className="pj-item-slug">{p.slug}</span>
                  </div>
                </button>
              ))}

              {filteredProjects.length === 0 && (
                <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
                  Không tìm thấy dự án nào.
                </div>
              )}
            </div>
          </div>

          {/* Create Project Form (Expandable) */}
          {showCreate && (
            <div className="card-panel">
              <div className="card-header" style={{ padding: '10px 14px' }}>
                <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} style={{ color: 'var(--accent)' }} />
                  <span>Tạo dự án mới</span>
                </strong>
              </div>
              <div className="card-body" style={{ padding: '12px 14px' }}>
                {user?.role === 'SYS_ADMIN' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    <Button variant="primary" icon={Wand2} onClick={() => setWizard(true)}>Tạo từ khung (chọn ngôn ngữ, framework…)</Button>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Hoặc khai báo một repo đã có:</span>
                  </div>
                )}
                <form className="pj-form" onSubmit={create} style={{ border: 'none', padding: 0 }}>
                  <div className="form-field">
                    <label className="form-label">Tên dự án</label>
                    <input
                      required
                      aria-label="Tên dự án"
                      placeholder="Ví dụ: App Giao Hàng"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Mã định danh (Slug)</label>
                    <input
                      required
                      aria-label="Slug"
                      placeholder="slug-khong-dau"
                      pattern="[a-z0-9_-]+"
                      value={form.slug}
                      onChange={e => setForm({ ...form, slug: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Kho mã nguồn (Repo URL)</label>
                    <input
                      required
                      aria-label="Repo URL"
                      placeholder="https://github.com/org/repo.git"
                      value={form.repoUrl}
                      onChange={e => setForm({ ...form, repoUrl: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Button type="submit" variant="primary" icon={Plus}>Tạo</Button>
                    <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Huỷ</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Right: Selected Project Workspace */}
        {project ? (
          <div className="rv-page" style={{ gap: 16 }}>
            {/* Project Hero Card */}
            <div className="pj-hero-card">
              <div className="pj-hero-top">
                <div className="pj-hero-identity">
                  <div className="pj-avatar-badge">
                    <FolderKanban size={22} />
                  </div>
                  <div className="pj-hero-names">
                    <h2 className="pj-hero-title">
                      <span>{project.name}</span>
                      <span className="pj-hero-slug">{project.slug}</span>
                    </h2>
                    {project.repoUrl && (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="user-email-row"
                        style={{ color: 'var(--accent)' }}>
                        <GitBranch size={12} />
                        <span>{project.repoUrl}</span>
                        <ExternalLink size={11} style={{ opacity: 0.7 }} />
                      </a>
                    )}
                  </div>
                </div>

                <div className="pj-hero-actions">
                  {roles.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {roles.map(r => (
                        <Badge key={r} tone={r === 'OWNER' ? 'accent' : 'neutral'}>
                          {ROLE_LABEL[r] || r}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={copied ? 'secondary' : 'ghost'}
                    icon={copied ? Check : Copy}
                    onClick={copyProjectId}>
                    {copied ? 'Đã sao chép ID!' : 'Sao chép ID dự án'}
                  </Button>
                  {roles.includes('OWNER') && <DeleteProjectButton project={project} onDeleted={() => { setSel(null); load(); }} />}
                </div>
              </div>

              {/* Integration Snippet Banner */}
              <div className="pj-code-banner">
                <div className="pj-code-content">
                  <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>Cấu hình Lane:</span>
                  <code className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    PLATFORM_PROJECT_ID="{project.id}"
                  </code>
                </div>
                <button
                  className="linklike"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(`PLATFORM_PROJECT_ID="${project.id}"`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}>
                  <Copy size={12} /> Sao chép cấu hình
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { id: 'members', label: 'Thành viên' },
                { id: 'gates', label: 'Cổng duyệt' },
                { id: 'runs', label: 'Tính năng' },
                { id: 'memory', label: 'Bộ nhớ' }
              ]}
            />

            {/* Sub-tab Panels */}
            {tab === 'members' && <Members key={project.id} pid={project.id} canManage={canManage} />}
            {tab === 'gates' && <GatePolicy key={project.id} pid={project.id} canManage={canManage} />}
            {tab === 'runs' && <Runs key={project.id} pid={project.id} onOpenRun={onOpenRun} />}
            {tab === 'memory' && <MemoryPanel key={project.id} projectId={project.id} canManage={canManage} />}
          </div>
        ) : (
          <div className="modern-empty-state" style={{ minHeight: 280 }}>
            <div className="modern-empty-icon">
              <FolderKanban size={24} />
            </div>
            <div className="modern-empty-title">Chưa chọn dự án nào</div>
            <div className="modern-empty-desc">
              Hãy chọn một dự án ở danh sách bên trái hoặc tạo dự án mới để bắt đầu.
            </div>
          </div>
        )}
      </div>
      {wizard && (
        <NewProjectWizard
          onClose={() => setWizard(false)}
          onCreated={async id => { setShowCreate(false); await load(); if (id) setSel(id); }} />
      )}
    </section>
  );
}
