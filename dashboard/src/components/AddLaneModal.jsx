import React, { useState, useRef, useEffect } from 'react';
import { Hourglass, KeyRound } from 'lucide-react';
import Modal from './Modal.jsx';
import { postAction, fetchLaneProjects } from '../lib/api.js';
import { platform } from '../lib/platform.js';

/**
 * Provision a new lane — for the install's main project, or (multi-project lanes) for a project
 * Shipyard generated: the lane then clones that project and runs its own stack.
 */
export default function AddLaneModal({ onClose, onDone, initialProject = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(initialProject);
  const focusRef = useRef(null);

  useEffect(() => {
    setTimeout(() => { if (focusRef.current) focusRef.current.focus(); }, 40);
    // Generated projects on this machine, with their platform ids (matched by slug).
    Promise.all([fetchLaneProjects(), platform.projects().catch(() => [])]).then(([local, reg]) => {
      setProjects(local.map(p => ({ ...p, projectId: (reg || []).find(r => r.slug === p.slug)?.id || '' })));
    }, () => setProjects([]));
  }, []);
  const chosen = projects.find(p => p.slug === project);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = (email.trim() || password) ? { email: email.trim(), password } : {};
      if (chosen) body.project = { slug: chosen.slug, projectId: chosen.projectId, name: chosen.name };
      await postAction(null, 'add', body);
      onClose();
      onDone();
    } catch (e) {
      setError(e.message || 'Provisioning failed');
      setBusy(false);
    }
  };

  return (
    <Modal title="Provision a new lane" onClose={onClose}
      buttons={[
        { label: 'Cancel', fn: onClose, disabled: busy },
        { label: busy ? 'Provisioning…' : 'Provision lane', cls: 'add', fn: submit, disabled: busy || (chosen && !chosen.supported) },
      ]}>
      <p className="m-text">
        Sets up the next free lane: clone → deps → DB → MCPs → agents → sessions.
        It shows <b><Hourglass size={13} strokeWidth={1.75} aria-hidden="true" /> provisioning</b> with live progress and only turns ready when fully done.
      </p>
      <label className="m-l">Dự án của lane
        <select className="msel" value={project} onChange={e => setProject(e.target.value)}>
          <option value="">Dự án chính của máy này</option>
          {projects.map(p => (
            <option key={p.slug} value={p.slug} disabled={!p.supported}>{p.name} ({p.stack}){p.supported ? '' : ` — ${p.reason}`}</option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="m-hint">Lane sẽ clone <code>{chosen.slug}</code>, cài thư viện và chạy stack của dự án này (script lane được tạo tự động theo công nghệ).
          {!chosen.projectId && ' Dự án chưa đăng ký trên Platform — lane sẽ chạy kiểu cổ điển, không qua các bước duyệt.'}</p>
      )}
      <label className="m-l">dev-QC email <span className="m-opt">(optional)</span>
        <input ref={focusRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="qa account email" autoComplete="off" />
      </label>
      <label className="m-l">dev-QC password <span className="m-opt">(optional)</span>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" />
      </label>
      <p className="m-hint">
        Set the dev-QC account now so it's embedded in the lane's agents — or leave blank and set it later with <KeyRound size={12} strokeWidth={1.75} aria-hidden="true" /> creds.
      </p>
      {error && <p className="m-err">{error}</p>}
    </Modal>
  );
}
