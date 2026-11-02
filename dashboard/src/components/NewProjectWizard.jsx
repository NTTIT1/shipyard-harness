import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Rocket, RotateCcw,
  Trash2, StopCircle, Terminal, GitBranch, Database, Sparkles, Loader2, Check
} from 'lucide-react';
import WorkflowEditor from './projects/WorkflowEditor.jsx';
import Modal from './Modal.jsx';
import Badge from './ui/Badge.jsx';
import { Choice, JobView, GitStep, RoleSkillsConfigurator } from './projects/WizardSteps.jsx';
import {
  scaffold, slugify, findStack, defaultOptions, defaultRoleSkills,
  wizardSteps, stepProblem, summary, PROVIDER_LABEL, KINDS, languagesFor, frontendStacks,
  applyAdvice, DEFAULT_WORKFLOW
} from '../lib/scaffold.js';
import { WORKFLOW_PRESETS } from '../lib/review.js';
import '../styles/wizard.css';
import { tr } from '../lib/i18n.js';

const JOB_KEY = 'shipyard.scaffoldJob';
const remember = id => { try { id ? sessionStorage.setItem(JOB_KEY, id) : sessionStorage.removeItem(JOB_KEY); } catch { /* storage off */ } };
const recall = () => { try { return sessionStorage.getItem(JOB_KEY); } catch { return null; } };

export default function NewProjectWizard({ onClose, onCreated }) {
  const [catalog, setCatalog] = useState(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', slug: '', slugTouched: false, description: '', kind: 'single', language: '', stack: '', options: {},
    frontend: { stack: '', options: {} },
    git: { provider: 'local', owner: '', ownerLabel: '', visibility: 'private' },
    aiTeam: true, brief: '', roleSkills: defaultRoleSkills(null, 'java-spring'),
    archFirst: false, requirements: '', workflow: DEFAULT_WORKFLOW,
  });
  const [advice, setAdvice] = useState(null);
  const [advising, setAdvising] = useState(false);
  const [adviceErr, setAdviceErr] = useState('');
  const [applied, setApplied] = useState(false);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    scaffold.catalog().then(setCatalog, e => setErr(e.message));
    const id = recall();
    if (id) scaffold.job(id).then(setJob, () => remember(null));
  }, []);

  useEffect(() => {
    // A job paused for the architecture review keeps being polled (slowly): approval resumes it.
    if (job?.status !== 'running' && job?.status !== 'waiting') return undefined;
    const t = setTimeout(() => scaffold.job(job.id).then(setJob, e => setErr(e.message)), job.status === 'waiting' ? 5000 : 1500);
    return () => clearTimeout(t);
  }, [job]);
  useEffect(() => { if (job?.status === 'done') remember(null); }, [job?.status]);

  const stack = findStack(catalog, form.stack);
  const fstack = form.kind === 'fullstack' ? findStack(catalog, form.frontend.stack) : null;
  const steps = wizardSteps(stack, form.kind);
  const cur = steps[Math.min(step, steps.length - 1)].id;
  const problem = stepProblem(cur, form, stack, fstack);
  const languages = languagesFor(catalog, form.kind);
  const setFeOpt = (k, v) => setForm(f => ({ ...f, frontend: { ...f.frontend, options: { ...f.frontend.options, [k]: v } } }));
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const setOpt = (k, v) => setForm(f => ({ ...f, options: { ...f.options, [k]: v } }));
  const lang = languages.find(l => l.id === form.language);

  const create = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const j = await scaffold.start({
        name: form.name.trim(), slug: form.slug, description: form.description.trim(), kind: form.kind, stack: form.stack,
        options: form.options, ...(form.kind === 'fullstack' ? { frontend: form.frontend } : {}), git: { provider: form.git.provider, owner: form.git.owner, visibility: form.git.visibility },
        aiTeam: form.aiTeam, brief: form.aiTeam ? form.brief : '',
        roleSkills: form.roleSkills,
        ...(form.archFirst ? { archFirst: true, requirements: form.requirements.trim() } : {}),
        workflow: form.workflow,
      });
      remember(j.id);
      setJob({ ...j, log: j.log || [] });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }, [form]);

  const askAdvice = async () => {
    setAdvising(true); setAdviceErr(''); setApplied(false);
    try { setAdvice(await scaffold.advise(form.requirements.trim())); } catch (e) { setAdviceErr(e.message); }
    setAdvising(false);
  };
  const stackName = id => { const st = findStack(catalog, id); return st ? `${st.languageLabel} · ${st.label}` : id; };

  const act = fn => async () => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  let buttons;
  if (job) {
    buttons = [];
    if (job.status === 'running') buttons.push({ label: tr('Huỷ'), icon: StopCircle, cls: 'warn', disabled: busy, fn: act(async () => setJob(await scaffold.cancel(job.id))) });
    if (job.retryable) {
      buttons.push({ label: job.archFirst && job.stages?.blueprint === 'done' ? tr('Thử dựng lại') : tr('Thử lại'), icon: RotateCcw, cls: 'add', disabled: busy, fn: act(async () => setJob(await scaffold.retry(job.id))) });
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      buttons.push({ label: tr('Xoá thư mục & sửa lựa chọn'), icon: Trash2, cls: 'warn', disabled: busy,
        fn: act(async () => { await scaffold.discard(job.id); remember(null); setJob(null); setStep(steps.length - 1); }) });
    }
    if (job.status === 'done' || job.status === 'waiting') buttons.push({ label: tr('Mở dự án'), icon: ArrowRight, cls: 'add', fn: () => { onCreated(job.project?.id); onClose(); } });
    else buttons.push({ label: tr('Đóng'), fn: onClose });
  } else {
    buttons = [
      { label: tr('Quay lại'), icon: ArrowLeft, disabled: step === 0, fn: () => setStep(s => s - 1) },
      cur === 'review'
        ? { label: busy ? tr('Đang gửi…') : tr('Tạo dự án'), icon: Rocket, cls: 'add', disabled: busy || !!problem, fn: create }
        : { label: tr('Tiếp'), icon: ArrowRight, cls: 'add', disabled: !!problem, fn: () => setStep(s => s + 1) },
    ];
  }

  return (
    <Modal title={job ? tr('Đang tạo {0}', [job.name]) : tr('Tạo dự án mới từ khung')} wide onClose={onClose} buttons={buttons}>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!catalog && !err && <p className="muted-empty">{tr('Đang tải danh mục…')}</p>}
      {job?.status === 'waiting' && (
        <div className="wz-waiting" role="status">
          <b>{tr('Đang chờ duyệt kiến trúc.')}</b>{' '}{tr('Kiến trúc sư AI đang soạn')}{' '}<code>architecture.md</code>{tr('; khi xong, bản kiến trúc nằm trong')}{' '}<b>{tr('Chờ duyệt')}</b>{' '}{tr('của dự án. Duyệt xong Shipyard tự tạo khung dự án theo kiến trúc đó — bạn có thể đóng cửa sổ này.')}</div>
      )}
      {job && catalog && <JobView job={job} stages={job.stageList || catalog.stages} />}
      {!job && catalog && (
        <div className="wz">
          <ol className="wz-steps" aria-label={tr('Các bước')}>
            {steps.map((s, i) => (
              <li
                key={s.id}
                className={i === step ? 'on' : i < step ? 'past' : ''}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => { if (i < step) setStep(i); }}
                style={{ cursor: i < step ? 'pointer' : 'default' }}>
                <span className="wz-num">{i < step ? '✓' : i + 1}</span><span className="wz-step-label">{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="wz-body">
            {cur === 'info' && (
              <div className="wz-fields">
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-name">{tr('Tên dự án')}</label>
                  <input id="wz-name" autoFocus value={form.name} maxLength={100} placeholder={tr('Ví dụ: Quản lý kho hàng')}
                    onChange={e => set({ name: e.target.value, ...(form.slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-slug">{tr('Slug (tên thư mục và repo)')}</label>
                  <input id="wz-slug" value={form.slug} maxLength={40} placeholder="quan-ly-kho-hang"
                    onChange={e => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} />
                  <span className="faint">{tr('Thư mục:')}{' '}<code>{catalog.root}/{form.slug || '…'}</code></span>
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-desc">{tr('Mô tả ngắn (không bắt buộc)')}</label>
                  <input id="wz-desc" value={form.description} maxLength={500} onChange={e => set({ description: e.target.value })} />
                </div>
              </div>
            )}

            {cur === 'need' && (
              <div className="wz-fields">
                <div className="form-field">
                  <label className="form-label" htmlFor="wz-need">{tr('Bạn cần xây hệ thống gì?')}</label>
                  <textarea id="wz-need" rows={5} maxLength={20000} value={form.requirements}
                    onChange={e => { set({ requirements: e.target.value }); setApplied(false); }}
                    placeholder={tr('Ví dụ: Hệ thống bán hàng cho chuỗi 5 cửa hàng, khoảng 1000 người dùng. Có quản lý sản phẩm, đơn hàng, kho, khách hàng, báo cáo doanh thu…')} />
                  <span className="faint">{tr('Không bắt buộc. Nhờ AI tư vấn để được gợi ý công nghệ, quy mô và quy trình — bạn vẫn tự chọn ở các bước sau.')}</span>
                </div>
                <div className="wz-advise-row">
                  <button type="button" className="btn btn-md btn-secondary" disabled={advising || form.requirements.trim().length < 10} onClick={askAdvice}>
                    {advising ? <Loader2 size={16} className="wz-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                    <span>{advising ? tr('AI đang tư vấn… (khoảng 1 phút)') : advice ? tr('Tư vấn lại') : tr('Nhờ AI tư vấn')}</span>
                  </button>
                  {adviceErr && <span className="m-err" role="alert" style={{ margin: 0 }}>{adviceErr}</span>}
                </div>
                {advice && (
                  <div className="wz-advice" aria-live="polite">
                    <p className="wz-advice-summary">{advice.summary}</p>
                    <div className="wz-review-pills">
                      <span className="wz-pill"><Terminal size={12} /> {advice.kind === 'fullstack' ? `backend/ ${stackName(advice.stack)}` : stackName(advice.stack)}</span>
                      {advice.frontend && <span className="wz-pill"><Terminal size={12} /> frontend/ {stackName(advice.frontend.stack)}</span>}
                      {advice.options.db && advice.options.db !== 'none' && <span className="wz-pill"><Database size={12} /> {advice.options.db}</span>}
                      <span className="wz-pill">{tr('Quy trình: {0}', [WORKFLOW_PRESETS.find(x => x.id === advice.workflow)?.label])}</span>
                      <span className="wz-pill">{advice.archFirst ? tr('Duyệt kiến trúc trước') : tr('Tạo khung ngay')}</span>
                    </div>
                    {[[tr('Vì sao'), advice.reasons], [tr('Với quy mô này'), advice.scale], [tr('Cần làm rõ'), advice.risks]].filter(([, l]) => l.length).map(([t, l]) => (
                      <div key={t} className="wz-advice-sec"><b>{t}</b><ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                    ))}
                    <div className="wz-advise-row">
                      <button type="button" className="btn btn-md btn-primary" disabled={applied}
                        onClick={() => { setForm(f => applyAdvice(f, advice, catalog)); setApplied(true); }}>
                        {applied ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                        <span>{applied ? tr('Đã áp dụng') : tr('Áp dụng gợi ý')}</span>
                      </button>
                      <span className="faint">{applied ? tr('Các bước sau đã được chọn sẵn theo gợi ý — bấm Tiếp để xem và chỉnh.') : tr('Áp dụng sẽ chọn sẵn kiểu dự án, framework, database, kiến trúc và quy trình.')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {cur === 'kind' && (
              <fieldset className="wz-grid">
                <legend className="form-label">{tr('Dự án gồm những gì?')}</legend>
                {KINDS.map(k => (
                  <Choice key={k.id} name="kind" value={k.id} current={form.kind} title={k.label} desc={k.desc}
                    onPick={v => {
                      if (v === form.kind) return;
                      const fe = v === 'fullstack' ? frontendStacks(catalog)[0] : null;
                      set({ kind: v, language: '', stack: '', options: {},
                        frontend: { stack: fe?.id || '', options: fe ? defaultOptions(fe) : {} } });
                    }} />
                ))}
              </fieldset>
            )}

            {cur === 'language' && (
              <fieldset className="wz-grid">
                <legend className="form-label">{form.kind === 'fullstack' ? tr('Ngôn ngữ cho backend') : tr('Chọn ngôn ngữ')}</legend>
                {languages.map(l => (
                  <Choice key={l.id} name="language" value={l.id} current={form.language} title={l.label}
                    badge={`${l.stacks.length} framework`}
                    desc={l.stacks.map(s => s.label).join(' · ')}
                    onPick={v => set({ language: v, ...(v !== form.language ? { stack: '', options: {} } : {}) })} />
                ))}
              </fieldset>
            )}

            {cur === 'stack' && lang && (
              <fieldset className="wz-grid">
                <legend className="form-label">{form.kind === 'fullstack' ? `Backend (${lang.label})` : `Framework cho ${lang.label}`}</legend>
                {lang.stacks.map(s => (
                  <Choice key={s.id} name="stack" value={s.id} current={form.stack} title={s.label} desc={tr(s.description)}
                    badge={s.available ? tr('Sẵn sàng') : tr('Thiếu công cụ')}
                    disabled={!s.available} onPick={v => {
                      const picked = findStack(catalog, v);
                      set({
                        stack: v,
                        options: defaultOptions(picked),
                        roleSkills: defaultRoleSkills(catalog, v),
                      });
                    }}>
                    {!s.available && (
                      <span className="wz-missing">
                        <Badge tone="warn">{tr('thiếu {0}', [s.missing.map(m => m.tool).join(', ')])}</Badge>
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
                  <Choice key={c.id} name="db" value={c.id} current={form.options.db} title={c.label}
                    desc={c.id === 'none' ? tr('Không cấu hình Database ban đầu') : tr('Tự cấu hình kết nối, driver & Docker Compose cho {0}', [c.label])}
                    onPick={v => setOpt('db', v)} />
                ))}
              </fieldset>
            )}

            {cur === 'options' && stack && (
              <div className="wz-fields">
                {stack.options.filter(o => o.id !== 'db').map(o => (
                  o.type === 'bool' ? (
                    <label key={o.id} className="wz-check">
                      <input type="checkbox" checked={!!form.options[o.id]} onChange={e => setOpt(o.id, e.target.checked)} />
                      <span>{tr(o.label)}</span>
                    </label>
                  ) : (
                    <div key={o.id} className="form-field">
                      <label className="form-label" htmlFor={`wz-o-${o.id}`}>{tr(o.label)}</label>
                      {o.type === 'choice' ? (
                        <select id={`wz-o-${o.id}`} value={form.options[o.id]} onChange={e => setOpt(o.id, e.target.value)}>
                          {o.choices.map(c => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
                        </select>
                      ) : (
                        <input id={`wz-o-${o.id}`} value={form.options[o.id] ?? ''} onChange={e => setOpt(o.id, e.target.value.trim())} />
                      )}
                      {o.help && <span className="faint">{tr(o.help)}</span>}
                    </div>
                  )
                ))}
              </div>
            )}

            {cur === 'frontend' && (
              <div className="wz-fields">
                <fieldset className="wz-grid">
                  <legend className="form-label">{tr('Frontend (thư mục frontend/, gọi backend qua /api)')}</legend>
                  {frontendStacks(catalog).map(s => (
                    <Choice key={s.id} name="frontend" value={s.id} current={form.frontend.stack} title={s.label} desc={tr(s.description)}
                      badge={s.available ? tr('Sẵn sàng') : tr('Thiếu công cụ')} disabled={!s.available}
                      onPick={v => set({ frontend: { stack: v, options: defaultOptions(findStack(catalog, v)) } })} />
                  ))}
                </fieldset>
                {fstack && fstack.options.filter(o => o.id !== 'db').map(o => (
                  o.type === 'bool' ? (
                    <label key={o.id} className="wz-check">
                      <input type="checkbox" checked={!!form.frontend.options[o.id]} onChange={e => setFeOpt(o.id, e.target.checked)} />
                      <span>{tr(o.label)}</span>
                    </label>
                  ) : (
                    <div key={o.id} className="form-field">
                      <label className="form-label" htmlFor={`wz-fe-${o.id}`}>{tr(o.label)}</label>
                      <select id={`wz-fe-${o.id}`} value={form.frontend.options[o.id]} onChange={e => setFeOpt(o.id, e.target.value)}>
                        {(o.choices || []).map(c => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
                      </select>
                    </div>
                  )
                ))}
                <p className="wz-hint">{tr('Shipyard nối sẵn frontend với backend: Vite chuyển')}{' '}<code>/api</code>{' '}{tr('sang backend, trang chủ hiện trạng thái backend;')}{' '}<code>./dev.sh</code>{' '}{tr('chạy cả hai.')}</p>
              </div>
            )}

            {cur === 'git' && (
              <GitStep git={form.git} slug={form.slug} providers={catalog.providers}
                onChange={g => set({ git: { ...form.git, ...g } })}
                onProviders={p => setCatalog(c => ({ ...c, providers: p }))} />
            )}

            {cur === 'arch' && (
              <div className="wz-fields">
                <fieldset className="wz-grid">
                  <legend className="form-label">{tr('Khi nào tạo khung dự án?')}</legend>
                  <Choice name="archFirst" value="now" current={form.archFirst ? 'first' : 'now'} title={tr('Tạo khung ngay')}
                    desc={tr('Sinh code khung, build, test, đăng ký dự án ngay bây giờ. Kiến trúc của từng tính năng được duyệt sau.')}
                    onPick={() => set({ archFirst: false })} />
                  <Choice name="archFirst" value="first" current={form.archFirst ? 'first' : 'now'} title={tr('Duyệt kiến trúc trước')}
                    desc={tr('AI soạn kiến trúc tổng thể từ yêu cầu của bạn; Tech Lead / Owner duyệt xong Shipyard mới tạo khung và bắt đầu code.')}
                    onPick={() => set({ archFirst: true })} />
                </fieldset>
                {form.archFirst && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="wz-req">{tr('Hệ thống cần xây (cho kiến trúc sư AI — lấy từ bước Yêu cầu, sửa thêm được)')}</label>
                    <textarea id="wz-req" rows={6} maxLength={20000} value={form.requirements} onChange={e => set({ requirements: e.target.value })}
                      placeholder={tr('Ví dụ: Hệ thống quản lý kho cho 3 chi nhánh. Người dùng: thủ kho, kế toán, quản lý. Nhập/xuất kho, kiểm kê, cảnh báo tồn thấp, báo cáo tháng. Đăng nhập bằng tài khoản công ty…')} />
                    <span className="faint">{tr('Công nghệ đã chọn ở các bước trước được giữ nguyên. Bản kiến trúc được duyệt sẽ nằm ở')}{' '}<code>docs/architecture.md</code>
                      {' '}{tr('và là khung cho mọi tính năng sau. {0}/20.000 ký tự.', [form.requirements.length.toLocaleString('vi-VN')])}</span>
                  </div>
                )}
              </div>
            )}

            {cur === 'workflow' && (
              <div className="wz-fields">
                <p className="faint" style={{ margin: 0 }}>{tr('Mọi lane của dự án chạy theo quy trình này (đổi sau ở')}{' '}<b>{tr('Quy trình & duyệt')}</b>{tr('). Ví dụ dự án chỉ cần')}{' '}<b>Plan → Code → Test</b>{tr(': test xanh là xong, đỏ thì dừng chờ người.')}</p>
                <div className="wz-wf card-panel">
                  <WorkflowEditor value={form.workflow} onChange={w => set({ workflow: w })} />
                </div>
              </div>
            )}

            {cur === 'team' && (
              <div className="wz-fields wz-git">
                <RoleSkillsConfigurator
                  catalog={catalog}
                  stackId={form.stack || 'java-spring'}
                  roleSkills={form.roleSkills}
                  onChange={rs => set({ roleSkills: rs })}
                />

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="wz-check">
                    <input type="checkbox" checked={form.aiTeam} onChange={e => set({ aiTeam: e.target.checked })} />
                    <span>{tr('Giao')}{' '}<b>AI Manager</b>{' '}{tr('soạn thêm bộ luật chi tiết từ tài liệu dự án ngay sau khi tạo (bạn duyệt trước khi dùng)')}</span>
                  </label>
                  {form.aiTeam && (
                    <div className="form-field">
                      <label className="form-label" htmlFor="wz-brief">{tr('Tài liệu tổng quan cho AI Manager (không bắt buộc)')}</label>
                      <textarea id="wz-brief" rows={4} maxLength={20000} value={form.brief} onChange={e => set({ brief: e.target.value })}
                        placeholder={tr('Ví dụ: nghiệp vụ chính, chuẩn code của công ty, quy tắc đặt tên bảng, cách đặt tên nhánh, thư viện bắt buộc…')} />
                      <span className="faint">{tr('Lưu vào')}{' '}<code>.shipyard/human/brief.md</code>{tr('. AI Manager đọc như tài liệu tham khảo để soạn luật; {0}/20.000 ký tự.', [form.brief.length.toLocaleString('vi-VN')])}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {cur === 'review' && stack && (
              <div className="wz-review-box">
                <div className="wz-review-pills">
                  <span className="wz-pill"><Terminal size={12} /> {fstack ? 'backend/ ' : ''}{stack.languageLabel} · {stack.label}</span>
                  {fstack && <span className="wz-pill"><Terminal size={12} /> frontend/ {fstack.languageLabel} · {fstack.label}</span>}
                  {form.options.db && form.options.db !== 'none' && (
                    <span className="wz-pill"><Database size={12} /> {form.options.db}</span>
                  )}
                  <span className="wz-pill"><GitBranch size={12} /> {PROVIDER_LABEL[form.git.provider]}</span>
                </div>
                <table className="wz-summary">
                  <tbody>{summary(form, stack, catalog, fstack).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
                </table>
                {form.archFirst ? (
                  <p className="faint">{tr('Shipyard đăng ký dự án')}{form.git.provider !== 'local' ? tr(', tạo repo trống') : ''}{' '}{tr('rồi giao kiến trúc sư AI soạn kiến trúc.')}{' '}{tr('Sau khi bản kiến trúc được duyệt trong')}{' '}<b>{tr('Chờ duyệt')}</b>{tr(', Shipyard mới sinh khung tại')}{' '}<code>{catalog.root}/{form.slug}</code>{tr(', build + test, khởi tạo Git và kèm')}{' '}<code>docs/architecture.md</code>.</p>
                ) : (
                <p className="faint">{tr('Shipyard sẽ sinh khung dự án tại')}{' '}<code>{catalog.root}/{form.slug}</code>{tr(', nạp các Skill AI vào')}{' '}<code>.shipyard/</code> & <code>.claude/skills/</code>{tr(', chạy thử lệnh build + test, khởi tạo kho Git và đăng ký dự án tự động.')}</p>
                )}
              </div>
            )}
          </div>
          {problem && cur !== 'review' && <p className="wz-hint warn">{problem}</p>}
        </div>
      )}
    </Modal>
  );
}
