import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Plus, Sparkles, Loader2, Check, RotateCcw, SkipForward, Rocket, Trash2, MessageSquare } from 'lucide-react';
import Button from './ui/Button.jsx';
import Markdown from './Markdown.jsx';
import WorkflowEditor from './projects/WorkflowEditor.jsx';
import { JobView, GitStep } from './projects/WizardSteps.jsx';
import { studio, APPROVE_LABEL, EXAMPLES, speaker, isLive } from '../lib/studio.js';
import { scaffold, slugify, findStack, SLUG_RE } from '../lib/scaffold.js';
import { WORKFLOW_PRESETS, workflowProblem } from '../lib/review.js';
import '../styles/wizard.css';
import '../styles/studio.css';

/**
 * Product studio: type an idea, the AI PM clarifies it into a brief, the AI architect recommends the
 * technology and designs the system, the AI designer mocks the main screens — each approved right in
 * the chat — then the project is generated with those documents and its roadmap is ready to code.
 */
export default function StudioView({ onOpenProject }) {
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null); // session view
  const [err, setErr] = useState('');

  const refreshList = useCallback(() => studio.list().then(setList, e => setErr(e.message)), []);
  useEffect(() => { refreshList(); }, [refreshList]);

  const open = useCallback(id => studio.get(id).then(setCurrent, e => setErr(e.message)), []);

  // Poll while an AI answers or the project is being generated.
  useEffect(() => {
    if (!isLive(current)) return undefined;
    const t = setTimeout(() => studio.get(current.id).then(s => { setCurrent(s); if (!isLive(s)) refreshList(); }, () => {}), 2500);
    return () => clearTimeout(t);
  }, [current, refreshList]);

  const act = fn => async (...a) => {
    setErr('');
    try { const s = await fn(...a); if (s?.id) setCurrent(s); refreshList(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="st">
      <aside className="st-list" aria-label="Các ý tưởng">
        <Button variant="primary" icon={Plus} onClick={() => { setCurrent(null); setErr(''); }}>Ý tưởng mới</Button>
        <ul>
          {list.map(s => (
            <li key={s.id}>
              <button type="button" className={`st-item${current?.id === s.id ? ' on' : ''}`} onClick={() => open(s.id)}>
                <MessageSquare size={14} aria-hidden="true" />
                <span className="st-item-title">{s.title}</span>
                {s.busy && <Loader2 size={13} className="wz-spin" aria-label="AI đang trả lời" />}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="st-main">
        {err && <p className="m-err" role="alert">{err}</p>}
        {current ? (
          <Session s={current} act={act} onOpenProject={onOpenProject}
            onDeleted={() => { setCurrent(null); refreshList(); }} />
        ) : (
          <NewIdea onStart={act(text => studio.start(text))} />
        )}
      </section>
    </div>
  );
}

function NewIdea({ onStart }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onStart(text.trim()); setBusy(false); };
  return (
    <div className="st-new">
      <h1 className="st-new-title"><Sparkles size={22} aria-hidden="true" /> Bạn muốn làm sản phẩm gì?</h1>
      <p className="st-new-sub">Gõ ý tưởng bằng lời thường. AI PM hỏi lại cho rõ và viết bản yêu cầu; AI kiến trúc sư tư vấn công nghệ và thiết kế hệ thống;
        AI thiết kế làm giao diện mẫu. Bạn duyệt từng bước ngay trong khung chat, rồi Shipyard tạo dự án và bắt đầu Plan → Code.</p>
      <textarea className="st-composer-input" rows={5} value={text} maxLength={8000} aria-label="Ý tưởng sản phẩm"
        placeholder="Ví dụ: Tôi cần hệ thống bán hàng cho chuỗi 5 cửa hàng, khoảng 1000 người dùng…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim().length >= 5) go(); }} />
      <div className="st-new-row">
        <div className="st-examples">
          {EXAMPLES.map(x => <button key={x} type="button" className="wf-preset" onClick={() => setText(x)}>{x}</button>)}
        </div>
        <Button variant="primary" icon={busy ? undefined : Send} disabled={busy || text.trim().length < 5} onClick={go}>
          {busy ? 'Đang gửi…' : 'Gửi cho AI PM'}
        </Button>
      </div>
    </div>
  );
}

function Session({ s, act, onOpenProject, onDeleted }) {
  const [tab, setTab] = useState(s.stage);
  useEffect(() => { setTab(s.stage); }, [s.id, s.stage]);
  const stageIdx = s.stages.findIndex(x => x.id === s.stage);
  const chatStage = ['pm', 'system', 'ui'].includes(s.stage);
  const currentRole = s.stages[stageIdx]?.role;

  return (
    <div className="st-session">
      <header className="st-head">
        <h1 className="st-title">{s.title}</h1>
        <ol className="st-steps" aria-label="Các bước">
          {s.stages.map((x, i) => {
            const state = i < stageIdx ? (x.id === 'ui' && s.skippedUi ? 'skipped' : 'done') : i === stageIdx ? 'on' : '';
            return (
              <li key={x.id} className={state} aria-current={i === stageIdx ? 'step' : undefined}>
                <span className="st-step-num">{state === 'done' ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
                <span>{x.label}</span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="st-body">
        <Chat s={s} act={act} enabled={chatStage} role={currentRole} />
        <DocPanel s={s} tab={tab} setTab={setTab} act={act} onOpenProject={onOpenProject} />
      </div>

      {!s.project && (
        <div className="st-foot">
          <button type="button" className="linklike st-delete" onClick={act(async () => {
            if (!window.confirm(`Xoá cuộc trò chuyện "${s.title}"? Tài liệu nháp sẽ mất.`)) return null;
            await studio.remove(s.id); onDeleted(); return null;
          })}><Trash2 size={13} aria-hidden="true" /> Xoá cuộc trò chuyện</button>
        </div>
      )}
    </div>
  );
}

function Chat({ s, act, enabled, role }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [s.messages.length, s.busy]);
  const send = async () => {
    if (!text.trim() || s.busy) return;
    setSending(true);
    await act(() => studio.send(s.id, text.trim()))();
    setText(''); setSending(false);
  };
  let lastStage = null;
  return (
    <div className="st-chat">
      <div className="st-msgs" role="log" aria-live="polite">
        {s.messages.map(m => {
          const divider = m.stage !== lastStage ? s.stages.find(x => x.id === m.stage)?.label : null;
          lastStage = m.stage;
          return (
            <React.Fragment key={m.id}>
              {divider && <div className="st-divider"><span>{divider}</span></div>}
              <div className={`st-msg ${m.role}`}>
                {m.role !== 'shipyard' && <div className="st-msg-who">{speaker(m, s.stages)}</div>}
                <div className="st-msg-text">{m.role === 'ai' ? <Markdown text={m.text} /> : m.text}</div>
              </div>
            </React.Fragment>
          );
        })}
        {s.busy && (
          <div className="st-msg ai st-typing" role="status">
            <div className="st-msg-who">{role}</div>
            <div className="st-msg-text"><Loader2 size={14} className="wz-spin" aria-hidden="true" /> đang làm việc… (thường 30 giây – vài phút)</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="st-composer">
        <textarea className="st-composer-input" rows={2} value={text} maxLength={8000} disabled={!enabled}
          aria-label="Nhắn cho AI"
          placeholder={enabled ? `Nhắn cho ${role}… (Ctrl+Enter để gửi)` : 'Bước này không trò chuyện với AI'}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <Button variant="primary" icon={Send} disabled={!enabled || s.busy || sending || !text.trim()} onClick={send}
          aria-label="Gửi">Gửi</Button>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'pm', label: 'Yêu cầu' }, { id: 'system', label: 'Hệ thống' }, { id: 'ui', label: 'Giao diện' },
  { id: 'create', label: 'Tạo dự án' }, { id: 'build', label: 'Plan → Code' },
];

function DocPanel({ s, tab, setTab, act, onOpenProject }) {
  const idx = id => s.stages.findIndex(x => x.id === id);
  const reachable = id => idx(id) <= idx(s.stage);
  return (
    <div className="st-doc">
      <div className="st-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} disabled={!reachable(t.id)}
            className={`st-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="st-doc-body">
        {tab === 'pm' && <DocStage s={s} stage="pm" act={act} empty="AI PM sẽ viết bản yêu cầu sản phẩm sau khi đủ thông tin.">
          {s.docs.brief && <Markdown text={s.docs.brief} />}
        </DocStage>}
        {tab === 'system' && <DocStage s={s} stage="system" act={act} empty="AI kiến trúc sư đang chuẩn bị gợi ý công nghệ và bản kiến trúc.">
          {s.docs.advice && <AdviceCard advice={s.docs.advice} />}
          {s.docs.adviceError && <p className="m-err">{s.docs.adviceError}</p>}
          {s.docs.architecture && <Markdown text={s.docs.architecture} />}
        </DocStage>}
        {tab === 'ui' && <DocStage s={s} stage="ui" act={act} empty={s.skippedUi ? 'Đã bỏ qua thiết kế giao diện.' : 'AI thiết kế đang vẽ các màn hình chính.'}>
          {s.docs.mockups.length > 0 && <Mockups mockups={s.docs.mockups} />}
          {s.docs.design && <Markdown text={s.docs.design} />}
        </DocStage>}
        {tab === 'create' && <CreateProject s={s} act={act} />}
        {tab === 'build' && <Build s={s} onOpenProject={onOpenProject} />}
      </div>
    </div>
  );
}

/** A document stage: its content, then approve / skip (current stage) or reopen (an earlier one). */
function DocStage({ s, stage, act, empty, children }) {
  const has = stage === 'pm' ? !!s.docs.brief : stage === 'system' ? !!(s.docs.advice && s.docs.architecture) : !!s.docs.design;
  const content = React.Children.toArray(children).filter(Boolean);
  const isCurrent = s.stage === stage;
  return (
    <>
      {content.length ? content : <p className="muted-empty">{empty}</p>}
      <div className="st-approve">
        {isCurrent && (
          <>
            <Button variant="primary" icon={Check} disabled={!has || s.busy} onClick={act(() => studio.approve(s.id, stage))}>{APPROVE_LABEL[stage]}</Button>
            {stage === 'ui' && <Button icon={SkipForward} disabled={s.busy} onClick={act(() => studio.skipUi(s.id))}>Bỏ qua thiết kế giao diện</Button>}
            <span className="faint">{has ? 'Muốn sửa gì thì nhắn trong khung chat.' : 'Chưa có bản để duyệt.'}</span>
          </>
        )}
        {!isCurrent && s.approved?.[stage] && !s.project && (
          <>
            <span className="st-ok"><Check size={14} aria-hidden="true" /> Đã duyệt</span>
            <Button size="sm" icon={RotateCcw} disabled={s.busy} onClick={act(() => {
              if (!window.confirm('Mở lại bước này? Các bước sau phải duyệt lại.')) return null;
              return studio.reopen(s.id, stage);
            })}>Sửa lại bước này</Button>
          </>
        )}
      </div>
    </>
  );
}

function AdviceCard({ advice }) {
  const preset = WORKFLOW_PRESETS.find(p => p.id === advice.workflow);
  return (
    <div className="wz-advice st-advice">
      <p className="wz-advice-summary">{advice.summary}</p>
      <div className="wz-review-pills">
        <span className="wz-pill">{advice.kind === 'fullstack' ? `backend/ ${advice.stack}` : advice.stack}</span>
        {advice.frontend && <span className="wz-pill">frontend/ {advice.frontend.stack}</span>}
        {advice.options?.db && advice.options.db !== 'none' && <span className="wz-pill">{advice.options.db}</span>}
        {preset && <span className="wz-pill">Quy trình: {preset.label}</span>}
        <span className="wz-pill">{advice.hasUi ? 'Có thiết kế giao diện' : 'Không cần thiết kế giao diện'}</span>
      </div>
      {[['Vì sao', advice.reasons], ['Với quy mô này', advice.scale], ['Cần làm rõ', advice.risks]].filter(([, l]) => l?.length).map(([t, l]) => (
        <div key={t} className="wz-advice-sec"><b>{t}</b><ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}

function Mockups({ mockups }) {
  const [i, setI] = useState(0);
  const m = mockups[Math.min(i, mockups.length - 1)];
  return (
    <div className="st-mockups">
      <div className="st-mock-tabs">
        {mockups.map((x, k) => (
          <button key={x.name} type="button" className={`wf-preset${k === i ? ' on' : ''}`} onClick={() => setI(k)}>
            {x.name.replace(/^\d+-/, '').replace(/\.html$/, '')}
          </button>
        ))}
      </div>
      {/* sandbox="" — no scripts, no same-origin: the mockup is only looked at */}
      <iframe className="st-mock" title={`Giao diện mẫu ${m.name}`} sandbox="" srcDoc={m.html} />
    </div>
  );
}

function CreateProject({ s, act }) {
  const advice = s.docs.advice;
  const [catalog, setCatalog] = useState(null);
  const [name, setName] = useState(s.title);
  const [slug, setSlug] = useState(slugify(s.title));
  const [git, setGit] = useState({ provider: 'local', owner: '', ownerLabel: '', visibility: 'private' });
  const [workflow, setWorkflow] = useState((WORKFLOW_PRESETS.find(p => p.id === advice?.workflow) || WORKFLOW_PRESETS[0]).steps);
  const [aiTeam, setAiTeam] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { scaffold.catalog().then(setCatalog, () => {}); }, []);
  if (s.project) return <p className="muted-empty">Dự án đã được tạo — xem tab Plan → Code.</p>;
  if (s.stage !== 'create') return <p className="muted-empty">Duyệt các bước trước để tới bước tạo dự án.</p>;
  const stackName = id => { const st = findStack(catalog, id); return st ? `${st.languageLabel} · ${st.label}` : id; };
  const problem = !name.trim() ? 'Nhập tên dự án' : !SLUG_RE.test(slug) ? 'Slug: 3–40 ký tự chữ thường, số, gạch ngang' : workflowProblem(workflow)
    || (git.provider !== 'local' && !git.owner ? 'Chọn tài khoản / group cho repo' : '');
  const create = async () => {
    setBusy(true);
    await act(() => studio.create(s.id, { name: name.trim(), slug, git: { provider: git.provider, owner: git.owner, visibility: git.visibility }, workflow, aiTeam }))();
    setBusy(false);
  };
  return (
    <div className="wz-fields st-create">
      <div className="wz-review-pills">
        <span className="wz-pill">{advice.kind === 'fullstack' ? `backend/ ${stackName(advice.stack)}` : stackName(advice.stack)}</span>
        {advice.frontend && <span className="wz-pill">frontend/ {stackName(advice.frontend.stack)}</span>}
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
      <div className="form-label">Quy trình làm tính năng</div>
      <div className="card-panel wz-wf"><WorkflowEditor value={workflow} onChange={setWorkflow} /></div>
      <label className="wz-check">
        <input type="checkbox" checked={aiTeam} onChange={e => setAiTeam(e.target.checked)} />
        <span>Giao <b>AI Manager</b> soạn luật đội AI từ các tài liệu đã duyệt (bạn duyệt trước khi dùng)</span>
      </label>
      <div className="st-approve">
        <Button variant="primary" icon={Rocket} disabled={busy || !!problem} onClick={create}>{busy ? 'Đang gửi…' : 'Tạo dự án'}</Button>
        {problem && <span className="faint">{problem}</span>}
      </div>
    </div>
  );
}

function Build({ s, onOpenProject }) {
  if (!s.project) return <p className="muted-empty">Chưa tạo dự án.</p>;
  const job = s.job;
  const pid = s.project.projectId || job?.project?.id;
  return (
    <div className="st-build">
      {job ? <JobView job={{ ...job, log: [], name: s.project.name }} stages={job.stageList} showLog={false} />
        : <p className="faint">Dự án {s.project.name} ({s.project.slug}) đã được tạo.</p>}
      {pid && <Button icon={Rocket} onClick={() => onOpenProject?.(pid)}>Mở dự án</Button>}
      <h2 className="st-h2">Lộ trình tính năng</h2>
      {s.roadmap.length ? (
        <ol className="st-roadmap">
          {s.roadmap.map((f, i) => <li key={i}><b>{f.title}</b><span className="faint"> — {f.text.replace(f.title, '').replace(/^\s*[—–-]\s*/, '')}</span></li>)}
        </ol>
      ) : <p className="muted-empty">Bản kiến trúc chưa có mục “Lộ trình tính năng”.</p>}
    </div>
  );
}
