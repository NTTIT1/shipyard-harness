import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, Rocket, RotateCcw, Trash2, XCircle, StopCircle, AlertTriangle, ExternalLink, KeyRound } from 'lucide-react';
import Modal from './Modal.jsx';
import Badge from './ui/Badge.jsx';
import { scaffold, slugify, findStack, defaultOptions, wizardSteps, stepProblem, summary, PROVIDER_LABEL, SETUP_STATUS } from '../lib/scaffold.js';
import '../styles/wizard.css';

const JOB_KEY = 'shipyard.scaffoldJob';
const remember = id => { try { id ? sessionStorage.setItem(JOB_KEY, id) : sessionStorage.removeItem(JOB_KEY); } catch { /* storage off */ } };
const recall = () => { try { return sessionStorage.getItem(JOB_KEY); } catch { return null; } };

function Choice({ name, value, current, onPick, title, desc, disabled, children }) {
  return (
    <label className={`wz-choice${current === value ? ' on' : ''}${disabled ? ' off' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onPick(value)} />
      <span className="wz-choice-title">{title}</span>
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

function JobView({ job, stages }) {
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

function GitStep({ git, slug, providers, onChange, onProviders }) {
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

export default function NewProjectWizard({ onClose, onCreated }) {
  const [catalog, setCatalog] = useState(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false, description: '', language: '', stack: '', options: {},
    git: { provider: 'local', owner: '', ownerLabel: '', visibility: 'private' }, aiTeam: true, brief: '' });
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    scaffold.catalog().then(setCatalog, e => setErr(e.message));
    const id = recall();
    if (id) scaffold.job(id).then(setJob, () => remember(null));
  }, []);

  // Poll while the job runs (polling also hands the server a fresh session token for registration).
  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const t = setTimeout(() => scaffold.job(job.id).then(setJob, e => setErr(e.message)), 1500);
    return () => clearTimeout(t);
  }, [job]);
  useEffect(() => { if (job?.status === 'done') remember(null); }, [job?.status]);

  const stack = findStack(catalog, form.stack);
  const steps = wizardSteps(stack);
  const cur = steps[Math.min(step, steps.length - 1)].id;
  const problem = stepProblem(cur, form, stack);
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const setOpt = (k, v) => setForm(f => ({ ...f, options: { ...f.options, [k]: v } }));
  const lang = catalog?.languages.find(l => l.id === form.language);

  const create = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const j = await scaffold.start({ name: form.name.trim(), slug: form.slug, description: form.description.trim(), stack: form.stack,
        options: form.options, git: { provider: form.git.provider, owner: form.git.owner, visibility: form.git.visibility },
        aiTeam: form.aiTeam, brief: form.aiTeam ? form.brief : '' });
      remember(j.id);
      setJob({ ...j, log: j.log || [] });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }, [form]);

  const act = fn => async () => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  let buttons;
  if (job) {
    buttons = [];
    if (job.status === 'running') buttons.push({ label: 'Huỷ', icon: StopCircle, cls: 'warn', disabled: busy, fn: act(async () => setJob(await scaffold.cancel(job.id))) });
    if (job.retryable) {
      buttons.push({ label: 'Thử lại', icon: RotateCcw, cls: 'add', disabled: busy, fn: act(async () => setJob(await scaffold.retry(job.id))) });
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      buttons.push({ label: 'Xoá thư mục & sửa lựa chọn', icon: Trash2, cls: 'warn', disabled: busy,
        fn: act(async () => { await scaffold.discard(job.id); remember(null); setJob(null); setStep(steps.length - 1); }) });
    }
    if (job.status === 'done') buttons.push({ label: 'Mở dự án', icon: ArrowRight, cls: 'add', fn: () => { onCreated(job.project?.id); onClose(); } });
    else buttons.push({ label: 'Đóng', fn: onClose });
  } else {
    buttons = [
      { label: 'Quay lại', icon: ArrowLeft, disabled: step === 0, fn: () => setStep(s => s - 1) },
      cur === 'review'
        ? { label: busy ? 'Đang gửi…' : 'Tạo dự án', icon: Rocket, cls: 'add', disabled: busy || !!problem, fn: create }
        : { label: 'Tiếp', icon: ArrowRight, cls: 'add', disabled: !!problem, fn: () => setStep(s => s + 1) },
    ];
  }

  return (
    <Modal title={job ? `Đang tạo ${job.name}` : 'Tạo dự án mới từ khung'} wide onClose={onClose} buttons={buttons}>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!catalog && !err && <p className="muted-empty">Đang tải danh mục…</p>}
      {job && catalog && <JobView job={job} stages={job.stageList || catalog.stages} />}
      {!job && catalog && (
        <div className="wz">
          <ol className="wz-steps" aria-label="Các bước">
            {steps.map((s, i) => (
              <li key={s.id} className={i === step ? 'on' : i < step ? 'past' : ''} aria-current={i === step ? 'step' : undefined}>
                <span className="wz-num">{i + 1}</span><span className="wz-step-label">{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="wz-body">
            {cur === 'info' && (
              <div className="wz-fields">
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-name">Tên dự án</label>
                  <input id="wz-name" autoFocus value={form.name} maxLength={100} placeholder="Ví dụ: Quản lý kho hàng"
                    onChange={e => set({ name: e.target.value, ...(form.slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-slug">Slug (tên thư mục và repo)</label>
                  <input id="wz-slug" value={form.slug} maxLength={40} placeholder="quan-ly-kho-hang"
                    onChange={e => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} />
                  <span className="faint">Thư mục: <code>{catalog.root}/{form.slug || '…'}</code></span>
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-desc">Mô tả ngắn (không bắt buộc)</label>
                  <input id="wz-desc" value={form.description} maxLength={500} onChange={e => set({ description: e.target.value })} />
                </div>
              </div>
            )}

            {cur === 'language' && (
              <fieldset className="wz-grid">
                <legend className="form-label">Chọn ngôn ngữ</legend>
                {catalog.languages.map(l => (
                  <Choice key={l.id} name="language" value={l.id} current={form.language} title={l.label}
                    desc={l.stacks.map(s => s.label).join(' · ')}
                    onPick={v => set({ language: v, ...(v !== form.language ? { stack: '', options: {} } : {}) })} />
                ))}
              </fieldset>
            )}

            {cur === 'stack' && lang && (
              <fieldset className="wz-grid">
                <legend className="form-label">Framework cho {lang.label}</legend>
                {lang.stacks.map(s => (
                  <Choice key={s.id} name="stack" value={s.id} current={form.stack} title={s.label} desc={s.description}
                    disabled={!s.available} onPick={v => set({ stack: v, options: defaultOptions(findStack(catalog, v)) })}>
                    {!s.available && (
                      <span className="wz-missing">
                        <Badge tone="warn">thiếu {s.missing.map(m => m.tool).join(', ')}</Badge>
                        {s.missing.map(m => <span key={m.tool} className="faint">{m.hint}</span>)}
                      </span>
                    )}
                  </Choice>
                ))}
              </fieldset>
            )}

            {cur === 'db' && stack && (
              <fieldset className="wz-grid">
                <legend className="form-label">Database</legend>
                {stack.options.find(o => o.id === 'db').choices.map(c => (
                  <Choice key={c.id} name="db" value={c.id} current={form.options.db} title={c.label} onPick={v => setOpt('db', v)} />
                ))}
              </fieldset>
            )}

            {cur === 'options' && stack && (
              <div className="wz-fields">
                {stack.options.filter(o => o.id !== 'db').map(o => (
                  o.type === 'bool' ? (
                    <label key={o.id} className="wz-check">
                      <input type="checkbox" checked={!!form.options[o.id]} onChange={e => setOpt(o.id, e.target.checked)} />
                      <span>{o.label}</span>
                    </label>
                  ) : (
                    <div key={o.id} className="form-field">
                      <label className="form-label" htmlFor={`wz-o-${o.id}`}>{o.label}</label>
                      {o.type === 'choice' ? (
                        <select id={`wz-o-${o.id}`} value={form.options[o.id]} onChange={e => setOpt(o.id, e.target.value)}>
                          {o.choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      ) : (
                        <input id={`wz-o-${o.id}`} value={form.options[o.id] ?? ''} onChange={e => setOpt(o.id, e.target.value.trim())} />
                      )}
                      {o.help && <span className="faint">{o.help}</span>}
                    </div>
                  )
                ))}
              </div>
            )}

            {cur === 'git' && (
              <GitStep git={form.git} slug={form.slug} providers={catalog.providers}
                onChange={g => set({ git: { ...form.git, ...g } })}
                onProviders={p => setCatalog(c => ({ ...c, providers: p }))} />
            )}

            {cur === 'team' && (
              <div className="wz-fields wz-git">
                <label className="wz-check">
                  <input type="checkbox" checked={form.aiTeam} onChange={e => set({ aiTeam: e.target.checked })} />
                  <span>Giao <b>AI Manager</b> soạn bộ luật cho đội AI ngay sau khi tạo (bạn duyệt trước khi dùng)</span>
                </label>
                {form.aiTeam && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="wz-brief">Tài liệu cho AI hiểu dự án (không bắt buộc)</label>
                    <textarea id="wz-brief" rows={9} maxLength={20000} value={form.brief} onChange={e => set({ brief: e.target.value })}
                      placeholder={'Ví dụ: nghiệp vụ chính, chuẩn code của công ty, quy tắc đặt tên bảng, cách đặt tên nhánh, thư viện bắt buộc…'} />
                    <span className="faint">Lưu vào <code>.shipyard/human/brief.md</code>. AI Manager đọc như tài liệu tham khảo để soạn luật; {form.brief.length.toLocaleString('vi-VN')}/20.000 ký tự.</span>
                  </div>
                )}
                <p className="faint">Mỗi AI (Dev, Tester, Review…) chỉ nhận đúng luật của vai trò mình. Luật được đọc từ nhánh development, nên AI không tự sửa được.</p>
              </div>
            )}

            {cur === 'review' && stack && (
              <div>
                <table className="wz-summary">
                  <tbody>{summary(form, stack).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
                </table>
                <p className="faint">Shipyard sẽ sinh khung, build và chạy test. Chỉ khi build qua mới commit và tạo dự án. Có thể mất vài phút.</p>
              </div>
            )}
          </div>
          {problem && cur !== 'review' && <p className="wz-hint">{problem}</p>}
        </div>
      )}
    </Modal>
  );
}
