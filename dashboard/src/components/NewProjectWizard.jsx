import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Rocket, RotateCcw,
  Trash2, StopCircle, Terminal, GitBranch, Database
} from 'lucide-react';
import Modal from './Modal.jsx';
import Badge from './ui/Badge.jsx';
import { Choice, JobView, GitStep, RoleSkillsConfigurator } from './projects/WizardSteps.jsx';
import {
  scaffold, slugify, findStack, defaultOptions, defaultRoleSkills,
  wizardSteps, stepProblem, summary, PROVIDER_LABEL, KINDS, languagesFor, frontendStacks
} from '../lib/scaffold.js';
import '../styles/wizard.css';

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
    archFirst: false, requirements: '',
  });
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
      });
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
      buttons.push({ label: job.archFirst && job.stages?.blueprint === 'done' ? 'Thử dựng lại' : 'Thử lại', icon: RotateCcw, cls: 'add', disabled: busy, fn: act(async () => setJob(await scaffold.retry(job.id))) });
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      buttons.push({ label: 'Xoá thư mục & sửa lựa chọn', icon: Trash2, cls: 'warn', disabled: busy,
        fn: act(async () => { await scaffold.discard(job.id); remember(null); setJob(null); setStep(steps.length - 1); }) });
    }
    if (job.status === 'done' || job.status === 'waiting') buttons.push({ label: 'Mở dự án', icon: ArrowRight, cls: 'add', fn: () => { onCreated(job.project?.id); onClose(); } });
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
      {job?.status === 'waiting' && (
        <div className="wz-waiting" role="status">
          <b>Đang chờ duyệt kiến trúc.</b> Kiến trúc sư AI đang soạn <code>architecture.md</code>; khi xong, bản kiến trúc nằm trong
          {' '}<b>Chờ duyệt</b> của dự án. Duyệt xong Shipyard tự tạo khung dự án theo kiến trúc đó — bạn có thể đóng cửa sổ này.
        </div>
      )}
      {job && catalog && <JobView job={job} stages={job.stageList || catalog.stages} />}
      {!job && catalog && (
        <div className="wz">
          <ol className="wz-steps" aria-label="Các bước">
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

            {cur === 'kind' && (
              <fieldset className="wz-grid">
                <legend className="form-label">Dự án gồm những gì?</legend>
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
                <legend className="form-label">{form.kind === 'fullstack' ? 'Ngôn ngữ cho backend' : 'Chọn ngôn ngữ'}</legend>
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
                  <Choice key={s.id} name="stack" value={s.id} current={form.stack} title={s.label} desc={s.description}
                    badge={s.available ? 'Sẵn sàng' : 'Thiếu công cụ'}
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
                  <Choice key={c.id} name="db" value={c.id} current={form.options.db} title={c.label}
                    desc={c.id === 'none' ? 'Không cấu hình Database ban đầu' : `Tự cấu hình kết nối, driver & Docker Compose cho ${c.label}`}
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

            {cur === 'frontend' && (
              <div className="wz-fields">
                <fieldset className="wz-grid">
                  <legend className="form-label">Frontend (thư mục frontend/, gọi backend qua /api)</legend>
                  {frontendStacks(catalog).map(s => (
                    <Choice key={s.id} name="frontend" value={s.id} current={form.frontend.stack} title={s.label} desc={s.description}
                      badge={s.available ? 'Sẵn sàng' : 'Thiếu công cụ'} disabled={!s.available}
                      onPick={v => set({ frontend: { stack: v, options: defaultOptions(findStack(catalog, v)) } })} />
                  ))}
                </fieldset>
                {fstack && fstack.options.filter(o => o.id !== 'db').map(o => (
                  o.type === 'bool' ? (
                    <label key={o.id} className="wz-check">
                      <input type="checkbox" checked={!!form.frontend.options[o.id]} onChange={e => setFeOpt(o.id, e.target.checked)} />
                      <span>{o.label}</span>
                    </label>
                  ) : (
                    <div key={o.id} className="form-field">
                      <label className="form-label" htmlFor={`wz-fe-${o.id}`}>{o.label}</label>
                      <select id={`wz-fe-${o.id}`} value={form.frontend.options[o.id]} onChange={e => setFeOpt(o.id, e.target.value)}>
                        {(o.choices || []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  )
                ))}
                <p className="wz-hint">Shipyard nối sẵn frontend với backend: Vite chuyển <code>/api</code> sang backend, trang chủ hiện trạng thái backend; <code>./dev.sh</code> chạy cả hai.</p>
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
                  <legend className="form-label">Khi nào tạo khung dự án?</legend>
                  <Choice name="archFirst" value="now" current={form.archFirst ? 'first' : 'now'} title="Tạo khung ngay"
                    desc="Sinh code khung, build, test, đăng ký dự án ngay bây giờ. Kiến trúc của từng tính năng được duyệt sau."
                    onPick={() => set({ archFirst: false })} />
                  <Choice name="archFirst" value="first" current={form.archFirst ? 'first' : 'now'} title="Duyệt kiến trúc trước"
                    desc="AI soạn kiến trúc tổng thể từ yêu cầu của bạn; Tech Lead / Owner duyệt xong Shipyard mới tạo khung và bắt đầu code."
                    onPick={() => set({ archFirst: true })} />
                </fieldset>
                {form.archFirst && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="wz-req">Hệ thống cần xây (cho kiến trúc sư AI)</label>
                    <textarea id="wz-req" rows={6} maxLength={20000} value={form.requirements} onChange={e => set({ requirements: e.target.value })}
                      placeholder={'Ví dụ: Hệ thống quản lý kho cho 3 chi nhánh. Người dùng: thủ kho, kế toán, quản lý. Nhập/xuất kho, kiểm kê, cảnh báo tồn thấp, báo cáo tháng. Đăng nhập bằng tài khoản công ty…'} />
                    <span className="faint">
                      Công nghệ đã chọn ở các bước trước được giữ nguyên. Bản kiến trúc được duyệt sẽ nằm ở <code>docs/architecture.md</code>
                      {' '}và là khung cho mọi tính năng sau. {form.requirements.length.toLocaleString('vi-VN')}/20.000 ký tự.
                    </span>
                  </div>
                )}
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
                    <span>Giao <b>AI Manager</b> soạn thêm bộ luật chi tiết từ tài liệu dự án ngay sau khi tạo (bạn duyệt trước khi dùng)</span>
                  </label>
                  {form.aiTeam && (
                    <div className="form-field">
                      <label className="form-label" htmlFor="wz-brief">Tài liệu tổng quan cho AI Manager (không bắt buộc)</label>
                      <textarea id="wz-brief" rows={4} maxLength={20000} value={form.brief} onChange={e => set({ brief: e.target.value })}
                        placeholder={'Ví dụ: nghiệp vụ chính, chuẩn code của công ty, quy tắc đặt tên bảng, cách đặt tên nhánh, thư viện bắt buộc…'} />
                      <span className="faint">Lưu vào <code>.shipyard/human/brief.md</code>. AI Manager đọc như tài liệu tham khảo để soạn luật; {form.brief.length.toLocaleString('vi-VN')}/20.000 ký tự.</span>
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
                  <p className="faint">Shipyard đăng ký dự án{form.git.provider !== 'local' ? ', tạo repo trống' : ''} rồi giao kiến trúc sư AI soạn kiến trúc.
                    {' '}Sau khi bản kiến trúc được duyệt trong <b>Chờ duyệt</b>, Shipyard mới sinh khung tại <code>{catalog.root}/{form.slug}</code>, build + test, khởi tạo Git và kèm <code>docs/architecture.md</code>.</p>
                ) : (
                <p className="faint">Shipyard sẽ sinh khung dự án tại <code>{catalog.root}/{form.slug}</code>, nạp các Skill AI vào <code>.shipyard/</code> & <code>.claude/skills/</code>, chạy thử lệnh build + test, khởi tạo kho Git và đăng ký dự án tự động.</p>
                )}
              </div>
            )}
          </div>
          {problem && cur !== 'review' && <p className="wz-hint">{problem}</p>}
        </div>
      )}
    </Modal>
  );
}
