import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, Circle, Loader2, XCircle,
  AlertTriangle, ExternalLink, KeyRound, Sparkles, Bot
} from 'lucide-react';
import {
  scaffold, PROVIDER_LABEL, SETUP_STATUS,
  FALLBACK_ROLES, FALLBACK_SKILL_CATALOG
} from '../../lib/scaffold.js';

const AI_ROLES_ORDER = ['DEV', 'ARCH', 'BA', 'PM', 'DESIGN', 'TEST', 'REVIEW', 'DEVOPS'];

export function Choice({ name, value, current, onPick, title, desc, badge, disabled, children }) {
  return (
    <label className={`wz-choice${current === value ? ' on' : ''}${disabled ? ' off' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onPick(value)} />
      <div className="wz-choice-head">
        <span className="wz-choice-title">{title}</span>
        {badge && <span className="wz-choice-badge">{badge}</span>}
      </div>
      {desc && <span className="wz-choice-desc">{desc}</span>}
      {children}
    </label>
  );
}

const STAGE_ICON = {
  pending: <Circle size={16} className="faint" aria-hidden="true" />,
  running: <Loader2 size={16} className="wz-spin" aria-hidden="true" />,
  done: <CheckCircle2 size={16} className="wz-ok" aria-hidden="true" />,
  failed: <XCircle size={16} className="wz-bad" aria-hidden="true" />,
};
const STAGE_STATE = { pending: 'chưa chạy', running: 'đang chạy', done: 'xong', failed: 'lỗi' };

export function JobView({ job, stages }) {
  const logRef = useRef(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [job.log.length]);
  return (
    <div className="wz-job">
      <ol className="wz-stages">
        {stages.map(s => (
          <li key={s.id} className={`wz-stage ${job.stages[s.id]}`}>
            {STAGE_ICON[job.stages[s.id]]}
            <span>{s.label}</span>
            <span className="sr-only">: {STAGE_STATE[job.stages[s.id]]}</span>
          </li>
        ))}
      </ol>
      {job.status === 'done' && (
        <p className="wz-done" role="status">
          <CheckCircle2 size={16} aria-hidden="true" /> Đã tạo dự án <b>{job.name}</b> tại <code>{job.dir}</code>
          {job.remote && <a href={job.remote.webUrl} target="_blank" rel="noreferrer" className="wz-link">{job.remote.webUrl} <ExternalLink size={13} aria-hidden="true" /></a>}
        </p>
      )}
      {job.error && (
        <div className="wz-err" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div><b>{job.status === 'cancelled' ? 'Đã huỷ' : 'Lỗi'}:</b> {job.error}</div>
        </div>
      )}
      {job.setupRunId && <SetupStatus runId={job.setupRunId} />}
      <pre ref={logRef} className="wz-log" aria-label="Nhật ký" tabIndex={0}>{job.log.join('\n')}</pre>
    </div>
  );
}

function SetupStatus({ runId }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let stop = false, t;
    const tick = () => scaffold.setup(runId).then(v => { if (stop) return; setS(v); if (!['done', 'cancelled', 'awaiting-review', 'error'].includes(v.status)) t = setTimeout(tick, 3000); }, () => {});
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [runId]);
  if (!s) return null;
  const busy = s.status === 'queued' || s.status === 'drafting' || s.status === 'publishing';
  return (
    <div className={`wz-setup ${s.status}`} role="status">
      {busy ? <Loader2 size={16} className="wz-spin" aria-hidden="true" /> : s.status === 'error' ? <AlertTriangle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
      <span><b>Đội AI:</b> {SETUP_STATUS[s.status] || s.status}{s.error ? ` — ${s.error}` : ''}</span>
      {s.status === 'error' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => scaffold.retrySetup(runId).then(() => setS({ ...s, status: 'drafting', error: null }))}>Thử lại</button>}
    </div>
  );
}

function TokenForm({ provider, current, onSaved, onCancel }) {
  const [token, setToken] = useState('');
  const [url, setUrl] = useState(current?.url || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { onSaved(await scaffold.saveProvider(provider, { token, url })); } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  const help = provider === 'github'
    ? 'Fine-grained token: quyền Administration (read & write) + Contents (read & write) trên các repo; hoặc classic token có quyền repo (và read:org để thấy tổ chức).'
    : 'Personal/Group access token có quyền api và write_repository.';
  return (
    <form className="wz-token" onSubmit={save}>
      <div className="form-field">
        <label className="form-label" htmlFor={`wz-tok-${provider}`}>Token {PROVIDER_LABEL[provider]} (dùng chung cho cả hệ thống)</label>
        <input id={`wz-tok-${provider}`} type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
          placeholder={current?.configured ? `Để trống để giữ token ${current.tokenHint}` : ''} />
        <span className="faint">{help}</span>
      </div>
      {provider === 'gitlab' && (
        <div className="form-field">
          <label className="form-label" htmlFor="wz-gl-url">Địa chỉ GitLab</label>
          <input id="wz-gl-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://gitlab.com" />
          <span className="faint">Đổi nếu dùng GitLab tự host.</span>
        </div>
      )}
      {err && <p className="m-err" role="alert">{err}</p>}
      <div className="wz-row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || (!token && !current?.configured)}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra & lưu'}</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>}
      </div>
    </form>
  );
}

export function GitStep({ git, slug, providers, onChange, onProviders }) {
  const [owners, setOwners] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const p = git.provider;
  const conn = providers?.[p];
  useEffect(() => {
    setOwners(null); setErr('');
    if (p === 'local' || !conn?.configured) return;
    scaffold.owners(p).then(list => {
      setOwners(list);
      if (!list.some(o => o.id === git.owner) && list[0]) onChange({ owner: list[0].id, ownerLabel: list[0].label });
    }, e => setErr(e.message));
  }, [p, conn?.configured, conn?.login]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = c => { onProviders({ ...providers, [p]: c }); setEditing(false); };
  return (
    <div className="wz-fields wz-git">
      <fieldset className="wz-grid">
        <legend className="form-label">Nơi lưu repo</legend>
        {['local', 'github', 'gitlab'].map(id => (
          <Choice key={id} name="git" value={id} current={p} title={PROVIDER_LABEL[id]}
            desc={id === 'local' ? 'Chỉ git init trên máy chủ' : providers?.[id]?.configured ? `Đã kết nối: ${providers[id].login}` : 'Chưa kết nối — nhập token ở bước này'}
            onPick={v => onChange({ provider: v, owner: '', ownerLabel: '' })} />
        ))}
      </fieldset>
      {p !== 'local' && (!conn?.configured || editing) && <TokenForm provider={p} current={conn} onSaved={saved} onCancel={conn?.configured ? () => setEditing(false) : null} />}
      {p !== 'local' && conn?.configured && !editing && (
        <>
          <div className="form-field">
            <label className="form-label" htmlFor="wz-owner">{p === 'github' ? 'Tài khoản / tổ chức' : 'Group / namespace'}</label>
            {owners ? (
              <select id="wz-owner" value={git.owner} onChange={e => onChange({ owner: e.target.value, ownerLabel: owners.find(o => o.id === e.target.value)?.label })}>
                {owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : !err && <span className="faint">Đang tải danh sách…</span>}
            {err && <p className="m-err" role="alert">{err}</p>}
          </div>
          <fieldset className="wz-row wz-vis">
            <legend className="form-label">Quyền xem</legend>
            <label className="wz-check"><input type="radio" name="vis" checked={git.visibility !== 'public'} onChange={() => onChange({ visibility: 'private' })} /> Riêng tư</label>
            <label className="wz-check"><input type="radio" name="vis" checked={git.visibility === 'public'} onChange={() => onChange({ visibility: 'public' })} /> Công khai</label>
          </fieldset>
          <p className="faint">Repo mới: <b>{(owners?.find(o => o.id === git.owner)?.label || '…').replace(/ \(cá nhân\)$/, '')}/{slug}</b>. Shipyard push nhánh main + development và thêm file CI {p === 'github' ? '(GitHub Actions)' : '(.gitlab-ci.yml)'}.
            {' '}<button type="button" className="linklike" onClick={() => setEditing(true)}><KeyRound size={12} aria-hidden="true" /> Đổi token</button></p>
        </>
      )}
    </div>
  );
}

export function RoleSkillsConfigurator({ catalog, stackId, roleSkills, onChange }) {
  const [activeRole, setActiveRole] = useState('DEV');
  const rolesMeta = (catalog?.roles && Object.keys(catalog.roles).length) ? catalog.roles : FALLBACK_ROLES;
  const skillCatalog = (catalog?.skillCatalog && catalog.skillCatalog.length) ? catalog.skillCatalog : FALLBACK_SKILL_CATALOG;
  const curRoleCfg = roleSkills?.[activeRole] || { skills: [], customRule: '' };
  const roleInfo = rolesMeta[activeRole] || FALLBACK_ROLES[activeRole] || { label: `AI ${activeRole}`, desc: '' };

  const availableSkills = skillCatalog.filter(
    sk => sk.roles.includes(activeRole) && (!stackId || sk.stacks.includes(stackId) || sk.stacks.length >= 3)
  );

  const toggleSkill = skillId => {
    const cur = curRoleCfg.skills || [];
    const next = cur.includes(skillId) ? cur.filter(x => x !== skillId) : [...cur, skillId];
    onChange({
      ...roleSkills,
      [activeRole]: { ...curRoleCfg, skills: next },
    });
  };

  const setCustomRule = text => {
    onChange({
      ...roleSkills,
      [activeRole]: { ...curRoleCfg, customRule: text },
    });
  };

  return (
    <div className="wz-skills-step">
      <div className="wz-skills-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={16} style={{ color: 'var(--accent-text)' }} />
          <strong>Kỹ năng & Chỉ dẫn riêng cho từng vai trò AI (PM, BA, Arch, Design, Dev, Tester)</strong>
        </div>
        <span className="faint">
          Chọn các Skill chuyên môn và nhập quy tắc tính năng bắt buộc mà mỗi AI Role phải đọc trước khi làm việc.
        </span>
      </div>

      <div className="wz-role-tabs" role="tablist" aria-label="Vai trò AI">
        {AI_ROLES_ORDER.map(r => {
          const cfg = roleSkills?.[r];
          const count = (cfg?.skills?.length || 0) + (cfg?.customRule?.trim() ? 1 : 0);
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={activeRole === r}
              className={`wz-role-tab${activeRole === r ? ' on' : ''}`}
              onClick={() => setActiveRole(r)}>
              <span>{rolesMeta[r]?.label || r}</span>
              {count > 0 && <span className="wz-role-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="wz-role-panel">
        <div className="wz-role-banner">
          <div>
            <strong>{roleInfo.label}</strong>
            {roleInfo.desc && <span className="faint" style={{ marginLeft: 8 }}>— {roleInfo.desc}</span>}
          </div>
          <span className="mono faint" style={{ fontSize: 11 }}>
            .shipyard/rules/{activeRole.toLowerCase()}.md
          </span>
        </div>

        {availableSkills.length > 0 && (
          <div className="wz-skill-list">
            <span className="form-label" style={{ fontSize: 12 }}>Skill chuyên môn tự động nạp cho {roleInfo.label}:</span>
            <div className="wz-skill-grid">
              {availableSkills.map(sk => {
                const checked = (curRoleCfg.skills || []).includes(sk.id);
                return (
                  <label key={sk.id} className={`wz-skill-card${checked ? ' on' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSkill(sk.id)} />
                    <div className="wz-skill-card-body">
                      <div className="wz-skill-card-title">
                        <Sparkles size={13} style={{ color: checked ? 'var(--accent)' : 'var(--text-faint)' }} />
                        <span>{sk.label}</span>
                      </div>
                      <span className="wz-skill-card-desc">{sk.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="form-field" style={{ marginTop: 6 }}>
          <label className="form-label" htmlFor={`wz-rule-${activeRole}`}>
            Chỉ dẫn / Tính năng bắt buộc người tạo dự án cài cho {roleInfo.label}:
          </label>
          <textarea
            id={`wz-rule-${activeRole}`}
            rows={3}
            value={curRoleCfg.customRule || ''}
            onChange={e => setCustomRule(e.target.value)}
            placeholder={
              activeRole === 'DEV'
                ? 'Ví dụ: AI Dev cần đọc thêm: Mọi API trả về chuẩn ApiResponse<T>, bắt buộc dùng Constructor Injection, kiểm tra quyền @PreAuthorize và viết test cho mọi Service…'
                : `Nhập yêu cầu tính năng hoặc chuẩn riêng mà ${roleInfo.label} bắt buộc phải đọc trước khi thực hiện…`
            }
          />
          <span className="faint">
            Sẽ được đóng gói vào <code>.shipyard/rules/{activeRole.toLowerCase()}.md</code> và <code>.claude/skills/</code> của dự án để {roleInfo.label} tự động tuân thủ.
          </span>
        </div>
      </div>
    </div>
  );
}
