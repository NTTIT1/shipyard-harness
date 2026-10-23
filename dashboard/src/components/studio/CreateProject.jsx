import React, { useState, useEffect, useRef } from 'react';
import { Rocket } from 'lucide-react';
import Button from '../ui/Button.jsx';
import WorkflowEditor from '../projects/WorkflowEditor.jsx';
import { GitStep } from '../projects/WizardSteps.jsx';
import { scaffold, slugify, findStack, SLUG_RE } from '../../lib/scaffold.js';
import { WORKFLOW_PRESETS, workflowProblem } from '../../lib/review.js';
import { studio } from '../../lib/studio.js';
import { localDemoPipeline } from '../../lib/pipeline.js';

export default function CreateProject({ s, act }) {
  const advice = s.docs.advice;
  const [catalog, setCatalog] = useState(null);
  const [name, setName] = useState(s.title);
  const [slug, setSlug] = useState(slugify(s.title));
  const [git, setGit] = useState({ provider: 'local', owner: '', ownerLabel: '', visibility: 'private' });
  const fromServer = s.docs.workflow || (WORKFLOW_PRESETS.find(p => p.id === advice?.workflow) || WORKFLOW_PRESETS[0]).steps;
  const [workflow, setWorkflowState] = useState(fromServer);
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'saved' | error text
  const pending = useRef(null);
  const lastSent = useRef(JSON.stringify(fromServer));
  const [aiTeam, setAiTeam] = useState(true);
  const [demo, setDemo] = useState(true);   // local demo: lanes merge on this machine and run the app
  const [busy, setBusy] = useState(false);

  useEffect(() => { scaffold.catalog().then(setCatalog, () => {}); }, []);

  // The AI edits the same workflow in the chat: take its version unless the person has an unsaved edit.
  const serverKey = JSON.stringify(s.docs.workflow || null);
  useEffect(() => {
    if (!s.docs.workflow || pending.current || serverKey === lastSent.current) return;
    lastSent.current = serverKey;
    setWorkflowState(s.docs.workflow);
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand edits are saved to the idea (shortly after the last change) so the AI and a reload see them.
  const setWorkflow = w => {
    setWorkflowState(w);
    if (workflowProblem(w)) return;
    clearTimeout(pending.current);
    setSaveState('saving');
    pending.current = setTimeout(async () => {
      try {
        const key = JSON.stringify(w);
        lastSent.current = key;
        await studio.setWorkflow(s.id, w);
        setSaveState('saved');
      } catch (e) {
        setSaveState(e.message);
      } finally {
        pending.current = null;
      }
    }, 700);
  };
  useEffect(() => () => clearTimeout(pending.current), []);

  if (s.project) return <p className="muted-empty">Dự án đã được tạo — xem tab Plan → Code.</p>;
  if (s.stage !== 'create') return <p className="muted-empty">Duyệt các bước trước để tới bước tạo dự án.</p>;

  const stackName = id => { const st = findStack(catalog, id); return st ? `${st.languageLabel} · ${st.label}` : id; };
  const problem = !name.trim() ? 'Nhập tên dự án' : !SLUG_RE.test(slug) ? 'Slug: 3–40 ký tự chữ thường, số, gạch ngang' : workflowProblem(workflow)
    || (git.provider !== 'local' && !git.owner ? 'Chọn tài khoản / group cho repo' : '');

  const create = async () => {
    setBusy(true);
    await act(() => studio.create(s.id, { name: name.trim(), slug, git: { provider: git.provider, owner: git.owner, visibility: git.visibility }, workflow, aiTeam,
      ...(demo && git.provider === 'local' ? { delivery: localDemoPipeline() } : {}) }))();
    setBusy(false);
  };

  return (
    <div className="wz-fields st-create">
      <div className="wz-review-pills">
        <span className="wz-pill">{advice?.kind === 'fullstack' ? `backend/ ${stackName(advice?.stack)}` : stackName(advice?.stack)}</span>
        {advice?.frontend && <span className="wz-pill">frontend/ {stackName(advice.frontend.stack)}</span>}
        <span className="wz-pill">Tài liệu: yêu cầu, kiến trúc{s.skippedUi ? '' : ', giao diện'} → docs/</span>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="st-name">Tên dự án</label>
        <input id="st-name" value={name} maxLength={100} onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)); }} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="st-slug">Slug (tên thư mục và repo)</label>
        <input id="st-slug" value={slug} maxLength={40} onChange={e => setSlug(e.target.value.toLowerCase())} />
      </div>
      {catalog && <GitStep git={git} slug={slug} providers={catalog.providers} onChange={g => setGit(x => ({ ...x, ...g }))}
        onProviders={p => setCatalog(c => ({ ...c, providers: p }))} />}
      <div className="st-wf-head">
        <span className="form-label">Quy trình làm tính năng</span>
        <span className="faint" role="status">
          {s.busy ? 'AI đang sửa quy trình…' : saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState}
        </span>
      </div>
      <p className="st-wf-hint">Nhắn trong khung chat để AI chỉnh (vd “bước Test dùng Haiku, tối đa 30 phút”), hoặc bấm vào từng bước để tự sửa.</p>
      {s.docs.workflowError && <p className="m-err">{s.docs.workflowError}</p>}
      <div className="card-panel wz-wf"><WorkflowEditor value={workflow} onChange={setWorkflow} disabled={s.busy} /></div>
      {git.provider === 'local' && (
        <label className="wz-check">
          <input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />
          <span><b>Demo trên máy</b>: lane code xong tự gộp vào nhánh <code>development</code> trên máy và chạy app (<code>http://localhost:300N</code>) — không PR, không đẩy lên Git. Đổi sau ở Quy trình &amp; duyệt → Sau khi code xong.</span>
        </label>
      )}
      <label className="wz-check">
        <input type="checkbox" checked={aiTeam} onChange={e => setAiTeam(e.target.checked)} />
        <span>Giao <b>AI Manager</b> soạn luật đội AI từ các tài liệu đã duyệt (bạn duyệt trước khi dùng)</span>
      </label>
      <div className="st-approve">
        <Button variant="primary" icon={Rocket} disabled={busy || s.busy || !!problem} onClick={create}>{busy ? 'Đang gửi…' : 'Tạo dự án'}</Button>
        {problem && <span className="faint">{problem}</span>}
      </div>
    </div>
  );
}
