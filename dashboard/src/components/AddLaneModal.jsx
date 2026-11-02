import React, { useState, useEffect } from 'react';
import { KeyRound, Check, FolderGit2, Home, GitBranch, Package, Database, Bot, CircleCheck, ChevronRight, AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';
import { postAction, fetchLaneProjects, fetchLanes } from '../lib/api.js';
import { platform } from '../lib/platform.js';
import { laneProjectOptions } from '../lib/laneview.js';
import '../styles/addlane.css';
import { tr } from '../lib/i18n.js';

const STEPS = [
  { icon: GitBranch, label: 'Clone dự án' },
  { icon: Package, label: 'Cài thư viện' },
  { icon: Database, label: 'Database' },
  { icon: Bot, label: 'Đội AI' },
  { icon: CircleCheck, label: 'Sẵn sàng' },
];

/**
 * Add a lane — a workspace of its own where the AI team builds one feature at a time — for one of the
 * projects the platform has (the machine's main project, or one Shipyard created or imported). The
 * project open in the dashboard is picked already; the dev-QC account is optional, one level deeper.
 */
export default function AddLaneModal({ onClose, onDone, initialProject = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState(null);
  const [project, setProject] = useState(initialProject);
  const [qcOpen, setQcOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchLaneProjects(), platform.projects().catch(() => []), fetchLanes().catch(() => ({}))]).then(([local, reg, lanes]) => {
      const opts = laneProjectOptions(local, reg, lanes?.config?.platform_project_id || '');
      setProjects(opts);
      // The open project: its folder slug, or the main project when it is the one open.
      setProject(p => (opts.some(o => o.slug === p) ? p : ''));
    }, () => setProjects(laneProjectOptions([], [], '')));
  }, []);
  const chosen = (projects || []).find(p => p.slug === project) || null;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = (email.trim() || password) ? { email: email.trim(), password } : {};
      if (chosen && !chosen.main) body.project = { slug: chosen.slug, projectId: chosen.projectId, name: chosen.name };
      await postAction(null, 'add', body);
      onClose();
      onDone();
    } catch (e) {
      setError(e.message || tr('Không thêm được lane'));
      setBusy(false);
    }
  };

  return (
    <Modal title={tr('Thêm lane')} onClose={onClose}
      buttons={[
        { label: tr('Huỷ'), fn: onClose, disabled: busy },
        { label: busy ? tr('Đang thêm…') : chosen ? tr('Thêm lane cho {0}', [chosen.name]) : tr('Thêm lane'), cls: 'add', fn: submit,
          disabled: busy || !chosen || !chosen.supported },
      ]}>
      <div className="al">
        <p className="al-lead">{tr('Lane là một chỗ làm việc riêng của đội AI: nó làm lần lượt từng tính năng của dự án, tự nhận tính năng tiếp theo trong hàng chờ khi xong.')}</p>

        <fieldset className="al-projects">
          <legend className="al-h">{tr('Cho dự án nào?')}</legend>
          {projects === null && <p className="faint">{tr('Đang tải dự án…')}</p>}
          {(projects || []).map(p => {
            const on = p.slug === project;
            return (
              <label key={p.slug || 'main'} className={`al-proj${on ? ' on' : ''}${p.supported ? '' : ' off'}`}>
                <input type="radio" name="al-project" value={p.slug} checked={on} disabled={!p.supported} onChange={() => setProject(p.slug)} />
                <span className="al-proj-icon" aria-hidden="true">{p.main ? <Home size={16} /> : <FolderGit2 size={16} />}</span>
                <span className="al-proj-text">
                  <span className="al-proj-name">{p.name}{p.main && <span className="al-badge">{tr('Dự án chính của máy')}</span>}</span>
                  <span className="al-proj-meta">{p.supported ? (p.stack || (p.main ? tr('Cài đặt sẵn của Shipyard trên máy này') : '')) : <><AlertTriangle size={12} aria-hidden="true" /> {p.reason}</>}</span>
                </span>
                <span className="al-check" aria-hidden="true">{on && <Check size={14} strokeWidth={2.5} />}</span>
              </label>
            );
          })}
        </fieldset>

        <div>
          <div className="al-h">{tr('Lane sẽ làm gì')}</div>
          <ol className="al-steps">
            {STEPS.map(s => (
              <li key={s.label}><span className="al-step-icon"><s.icon size={15} aria-hidden="true" /></span><span>{tr(s.label)}</span></li>
            ))}
          </ol>
          <p className="al-hint">{tr('Mất vài phút. Trong lúc đó lane hiện "đang chuẩn bị" kèm tiến độ, chỉ chuyển sang sẵn sàng khi xong hết.')}</p>
        </div>

        <div className={`al-more${qcOpen ? ' open' : ''}`}>
          <button type="button" className="al-more-head" aria-expanded={qcOpen} onClick={() => setQcOpen(o => !o)}>
            <ChevronRight size={14} className="al-chev" aria-hidden="true" />
            <KeyRound size={14} aria-hidden="true" />
            <span>{tr('Tài khoản kiểm thử (dev-QC)')}</span>
            <span className="al-opt">{tr('tuỳ chọn')}</span>
          </button>
          {qcOpen && (
            <div className="al-more-body">
              <label className="m-l">{tr('Email')}
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={tr('email tài khoản QA')} autoComplete="off" autoFocus />
              </label>
              <label className="m-l">{tr('Mật khẩu')}
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" />
              </label>
              <p className="al-hint">{tr('Dùng để AI đăng nhập kiểm tra trên trang dev. Để trống cũng được — đặt sau ở nút khoá của lane.')}</p>
            </div>
          )}
        </div>
        {error && <p className="m-err" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
