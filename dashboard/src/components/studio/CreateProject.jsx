import React, { useState, useEffect, useRef } from 'react';
import { Rocket } from 'lucide-react';
import Button from '../ui/Button.jsx';
import WorkflowEditor from '../projects/WorkflowEditor.jsx';
import { GitStep } from '../projects/WizardSteps.jsx';
import ImportRepoWizard from '../projects/ImportRepoWizard.jsx';
import { scaffold, slugify, findStack, SLUG_RE } from '../../lib/scaffold.js';
import { WORKFLOW_PRESETS, workflowProblem } from '../../lib/review.js';
import { studio } from '../../lib/studio.js';
import { localDemoPipeline } from '../../lib/pipeline.js';
import { tr } from '../../lib/i18n.js';

// A git project ends with the import setup (apps, database & env, workflow); the others generate a project.
export default function CreateProject({ s, act }) {
  return s.kind === 'git' ? <GitCreate s={s} act={act} /> : <GenerateProject s={s} act={act} />;
}

function GitCreate({ s, act }) {
  const [open, setOpen] = useState(false);
  const d = s.importDraft || {};
  const initial = { name: d.name || s.title, slug: d.slug || slugify(d.name || s.title), source: s.source || { provider: 'url', url: '' },
    branch: d.branch || '', branches: d.branch ? [d.branch] : null, ...(s.docs.workflow ? { workflow: s.docs.workflow } : {}) };
  return (
    <div className="st-doc-content">
      <p className="wz-hint">{tr('Tài liệu dự án đã duyệt xong. Bước cuối: khai báo cách cài, chạy và kiểm thử repo này để mỗi lane chạy được, rồi Shipyard nhập dự án.')}</p>
      <p className="faint">{s.source?.url}{d.branch ? ` · ${d.branch}` : ''}</p>
      <div className="st-approve">
        <Button variant="primary" icon={Rocket} onClick={() => setOpen(true)}>{tr('Thiết lập & tạo dự án')}</Button>
      </div>
      {open && (
        <ImportRepoWizard onClose={() => setOpen(false)}
          embedded={{ initial, submit: act(form => studio.create(s.id, { import: form })) }} />
      )}
    </div>
  );
}

function GenerateProject({ s, act }) {
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

  const note = text => <div className="st-doc-content st-create-scroll"><p className="muted-empty">{text}</p></div>;
  if (s.project) return note(tr('Dự án đã được tạo — xem tab Plan → Code.'));
  if (s.stage !== 'create') return note(tr('Duyệt các bước trước để tới bước tạo dự án.'));

  const stackName = id => { const st = findStack(catalog, id); return st ? `${st.languageLabel} · ${st.label}` : id; };
  const problem = !name.trim() ? tr('Nhập tên dự án') : !SLUG_RE.test(slug) ? tr('Slug: 3–40 ký tự chữ thường, số, gạch ngang') : workflowProblem(workflow)
    || (git.provider !== 'local' && !git.owner ? tr('Chọn tài khoản / group cho repo') : '');

  const create = async () => {
    setBusy(true);
    await act(() => studio.create(s.id, { name: name.trim(), slug, git: { provider: git.provider, owner: git.owner, visibility: git.visibility }, workflow, aiTeam,
      ...(demo && git.provider === 'local' ? { delivery: localDemoPipeline() } : {}) }))();
    setBusy(false);
  };

  return (
    <>
    <div className="st-doc-content st-create-scroll">
    <div className="wz-fields st-create">
      <div className="wz-review-pills">
        <span className="wz-pill">{advice?.kind === 'fullstack' ? `backend/ ${stackName(advice?.stack)}` : stackName(advice?.stack)}</span>
        {advice?.frontend && <span className="wz-pill">frontend/ {stackName(advice.frontend.stack)}</span>}
        <span className="wz-pill">{tr('Tài liệu: yêu cầu, kiến trúc')}{s.skippedUi ? '' : tr(', giao diện')} → docs/</span>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="st-name">{tr('Tên dự án')}</label>
        <input id="st-name" value={name} maxLength={100} onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)); }} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="st-slug">{tr('Slug (tên thư mục và repo)')}</label>
        <input id="st-slug" value={slug} maxLength={40} onChange={e => setSlug(e.target.value.toLowerCase())} />
      </div>
      {catalog && <GitStep git={git} slug={slug} providers={catalog.providers} onChange={g => setGit(x => ({ ...x, ...g }))}
        onProviders={p => setCatalog(c => ({ ...c, providers: p }))} />}
      {git.provider === 'local' && (
        <label className="wz-check">
          <input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />
          <span><b>{tr('Demo trên máy')}</b>{tr(': lane code xong tự gộp vào nhánh')}{' '}<code>development</code>{' '}{tr('trên máy và chạy app (')}<code>http://localhost:300N</code>{tr(') — không PR, không đẩy lên Git. Đổi sau ở Quy trình & duyệt → Sau khi code xong.')}</span>
        </label>
      )}
      <label className="wz-check">
        <input type="checkbox" checked={aiTeam} onChange={e => setAiTeam(e.target.checked)} />
        <span>{tr('Giao')}{' '}<b>AI Manager</b>{' '}{tr('soạn luật đội AI từ các tài liệu đã duyệt (bạn duyệt trước khi dùng)')}</span>
      </label>
      <div className="st-wf-head">
        <span className="form-label">{tr('Quy trình làm tính năng')}</span>
        <span className="faint" role="status">
          {s.busy ? tr('AI đang sửa quy trình…') : saveState === 'saving' ? tr('Đang lưu…') : saveState === 'saved' ? tr('Đã lưu') : saveState}
        </span>
      </div>
      <p className="st-wf-hint">{tr('Nhắn trong khung chat để AI chỉnh (vd “bước Test dùng Haiku, tối đa 30 phút”), hoặc bấm vào từng bước để tự sửa.')}</p>
      {s.docs.workflowError && <p className="m-err">{s.docs.workflowError}</p>}
      <div className="card-panel wz-wf"><WorkflowEditor value={workflow} onChange={setWorkflow} disabled={s.busy} /></div>
    </div>
    </div>
    {/* Always in reach, like the approval bar of the earlier steps (the workflow above is long). */}
    <div className="st-approve-bar st-create-bar">
        <Button variant="primary" icon={Rocket} disabled={busy || s.busy || !!problem} onClick={create}>{busy ? tr('Đang gửi…') : tr('Tạo dự án')}</Button>
        <span className="faint" role="status">{problem || (demo && git.provider === 'local' ? tr('Demo trên máy · ') : '') + (aiTeam ? tr('AI Manager soạn luật sau khi tạo') : tr('Không giao AI Manager'))}</span>
    </div>
    </>
  );
}
