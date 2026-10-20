import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, Rocket, RotateCcw, Trash2, XCircle, StopCircle, AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';
import Badge from './ui/Badge.jsx';
import { scaffold, slugify, findStack, defaultOptions, wizardSteps, stepProblem, summary } from '../lib/scaffold.js';
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
        </p>
      )}
      {job.error && (
        <div className="wz-err" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div><b>{job.status === 'cancelled' ? 'Đã huỷ' : 'Lỗi'}:</b> {job.error}</div>
        </div>
      )}
      <pre ref={logRef} className="wz-log" aria-label="Nhật ký" tabIndex={0}>{job.log.join('\n')}</pre>
    </div>
  );
}

export default function NewProjectWizard({ onClose, onCreated }) {
  const [catalog, setCatalog] = useState(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false, description: '', language: '', stack: '', options: {} });
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
      const j = await scaffold.start({ name: form.name.trim(), slug: form.slug, description: form.description.trim(), stack: form.stack, options: form.options });
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
    if (job.status === 'failed' && job.stage === 'register') {
      buttons.push({ label: 'Thử lại đăng ký', icon: RotateCcw, cls: 'add', disabled: busy, fn: act(async () => setJob(await scaffold.retryRegister(job.id))) });
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
      {job && catalog && <JobView job={job} stages={catalog.stages} />}
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
              <fieldset className="wz-grid">
                <legend className="form-label">Nơi lưu repo</legend>
                <Choice name="git" value="local" current="local" title="Chỉ trên máy" desc="git init, commit đầu tiên, nhánh main + development" onPick={() => {}} />
                <Choice name="git" value="github" current="local" title="GitHub" desc="Sắp có (giai đoạn 2)" disabled onPick={() => {}} />
                <Choice name="git" value="gitlab" current="local" title="GitLab" desc="Sắp có (giai đoạn 2)" disabled onPick={() => {}} />
              </fieldset>
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
