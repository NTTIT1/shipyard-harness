import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, RotateCcw, Trash2, GitBranch, Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../Modal.jsx';
import WorkflowEditor from './WorkflowEditor.jsx';
import { JobView } from './WizardSteps.jsx';
import { scaffold, slugify, DEFAULT_WORKFLOW } from '../../lib/scaffold.js';
import { workflowProblem } from '../../lib/review.js';
import { importer, SOURCES, DB_OPTIONS, LANE_VARS, TEMPLATES, emptyForm, applyTemplate, IMPORT_STEPS, importStepProblem } from '../../lib/importer.js';
import '../../styles/wizard.css';
import { tr } from '../../lib/i18n.js';

const JOB_KEY = 'shipyard.importJob';
const remember = id => { try { id ? sessionStorage.setItem(JOB_KEY, id) : sessionStorage.removeItem(JOB_KEY); } catch { /* storage off */ } };
const recall = () => { try { return sessionStorage.getItem(JOB_KEY); } catch { return null; } };

/**
 * Bring an existing Git repo into Shipyard. The person describes how THIS repo is installed, run and
 * tested (templates only fill fields when clicked); Shipyard then clones it, writes the lane scripts
 * from those commands, registers the project with its workflow and, if asked, lets the AI Manager write
 * the AI team's rules from the code.
 */
// embedded: { initial, submit(form) } — the git project chat's last step: the repo and documents are known
// already, so only the setup steps show, and the form goes back to the chat instead of starting an import.
export default function ImportRepoWizard({ onClose, onCreated, embedded = null }) {
  const [form, setForm] = useState(() => ({ ...emptyForm(), workflow: DEFAULT_WORKFLOW, ...(embedded?.initial || {}) }));
  const STEPS = embedded ? IMPORT_STEPS.filter(x => x.id !== 'repo' && x.id !== 'docs') : IMPORT_STEPS;
  const [step, setStep] = useState(0);
  const [providers, setProviders] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    scaffold.catalog().then(c => setProviders(c.providers || {}), () => {});
    const id = embedded ? null : recall();
    if (id) importer.job(id).then(setJob, () => remember(null));
  }, []);
  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const t = setTimeout(() => importer.job(job.id).then(setJob, e => setErr(e.message)), 1500);
    return () => clearTimeout(t);
  }, [job]);
  useEffect(() => { if (job?.status === 'done') remember(null); }, [job?.status]);

  const cur = STEPS[step].id;
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const setApp = (role, patch) => setForm(f => ({ ...f, [role]: { ...f[role], ...patch } }));
  const problem = importStepProblem(cur, form) || (cur === 'workflow' ? workflowProblem(form.workflow) : '');

  const readBranches = async () => {
    setReading(true); setErr('');
    try {
      const r = await importer.branches({ provider: form.source.provider, url: form.source.url.trim() });
      const pick = form.branch && r.branches.includes(form.branch) ? form.branch
        : r.branches.includes('development') ? 'development' : r.defaultBranch || r.branches[0] || '';
      set({ branches: r.branches, branch: pick });
      if (!r.branches.length) setErr(tr('Repo chưa có nhánh nào'));
    } catch (e) { setErr(e.message); }
    setReading(false);
  };

  const next = async () => {
    setErr('');
    if (STEPS[step + 1]?.id === 'review') {
      try { setWarnings((await importer.check(form)).warnings); } catch (e) { setErr(e.message); return; }
    }
    setStep(s => s + 1);
  };
  const start = async () => {
    setBusy(true); setErr('');
    if (embedded) {
      try { await embedded.submit(form); onClose(); } catch (e) { setErr(e.message); }
      setBusy(false);
      return;
    }
    try { const j = await importer.start(form); remember(j.id); setJob(j); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const act = fn => async () => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } setBusy(false); };

  let buttons;
  if (job) {
    buttons = [];
    if (job.retryable) buttons.push({ label: tr('Thử lại'), icon: RotateCcw, cls: 'add', disabled: busy, fn: act(async () => setJob(await importer.retry(job.id))) });
    if ((job.status === 'failed' || job.status === 'cancelled') && !job.project) {
      buttons.push({ label: tr('Xoá bản clone & sửa thông tin'), icon: Trash2, cls: 'warn', disabled: busy,
        fn: act(async () => { await importer.discard(job.id); remember(null); setJob(null); setStep(0); }) });
    }
    if (job.status === 'done' || job.project) buttons.push({ label: tr('Mở dự án'), icon: ArrowRight, cls: 'add', fn: () => { onCreated?.(job.project?.id); onClose(); } });
    else buttons.push({ label: tr('Đóng'), fn: onClose });
  } else {
    buttons = [
      { label: tr('Quay lại'), icon: ArrowLeft, disabled: step === 0, fn: () => setStep(s => s - 1) },
      cur === 'review'
        ? { label: busy ? tr('Đang gửi…') : tr('Nhập dự án'), icon: Download, cls: 'add', disabled: busy, fn: start }
        : { label: tr('Tiếp'), icon: ArrowRight, cls: 'add', disabled: !!problem, fn: next },
    ];
  }

  return (
    <Modal title={job ? tr('Đang nhập {0}', [job.name]) : (embedded ? tr('Thiết lập để tạo dự án') : tr('Nhập dự án có sẵn từ Git'))} wide onClose={onClose} buttons={buttons}>
      {err && <p className="m-err" role="alert">{err}</p>}
      <div className="wz">
      {job ? (
        <>
          <JobView job={job} stages={job.stageList} />
          {job.status === 'done' && (
            <p className="wz-hint">{tr('Bước tiếp: vào dự án →')}{' '}<b>Lane</b>{' '}{tr('→ thêm lane cho dự án này. Lane sẽ chạy đúng các lệnh bạn đã nhập (cài → migrate → chạy → kiểm tra); lỗi ở đâu sẽ hiện ngay trên lane, sửa trong')}{' '}<code>profiles/{job.slug}/hooks/</code>{' '}{tr('hoặc nhập lại.')}</p>
          )}
        </>
      ) : (
        <>
          <ol className="wz-steps" aria-label={tr('Các bước')}>
            {STEPS.map((s, i) => (
              <li key={s.id} className={i === step ? 'on' : i < step ? 'past' : ''} aria-current={i === step ? 'step' : undefined}>
                {i < step
                  ? <button type="button" className="imp-step-back" onClick={() => setStep(i)}><span className="wz-num">✓</span><span className="wz-step-label">{s.label}</span></button>
                  : <><span className="wz-num">{i + 1}</span><span className="wz-step-label">{s.label}</span></>}
              </li>
            ))}
          </ol>
          {cur === 'repo' && <RepoStep form={form} set={set} providers={providers} reading={reading} onRead={readBranches} />}
          {cur === 'apps' && (
            <div className="wz-fields">
              <p className="wz-hint">{tr('Mỗi repo một kiểu: ghi đúng lệnh')}{' '}<b>{tr('dự án này')}</b>{' '}{tr('dùng. Mẫu bên dưới chỉ điền giúp khi bạn bấm — sửa lại cho khớp. Dùng')}{' '}<code>$PORT</code>{' '}{tr('trong lệnh chạy để mỗi lane chạy cổng riêng.')}</p>
              <AppCard role="backend" title="Backend / API" app={form.backend} onChange={p => setApp('backend', p)} onImage={image => set({ image: form.image || image || '' })} />
              <AppCard role="frontend" title={tr('Frontend (web riêng)')} app={form.frontend} onChange={p => setApp('frontend', p)} onImage={() => {}} />
            </div>
          )}
          {cur === 'docs' && <DocsStep docs={form.docs} onChange={patch => set({ docs: { ...form.docs, ...patch } })} />}
          {cur === 'env' && <EnvStep form={form} set={set} />}
          {cur === 'workflow' && (
            <div className="wz-fields">
              <p className="wz-hint">{tr('Quy trình làm tính năng của dự án: bước nào chạy, ai duyệt, model AI và giới hạn từng bước.')}</p>
              <div className="card-panel wz-wf"><WorkflowEditor value={form.workflow} onChange={workflow => set({ workflow })} /></div>
              <label className="wz-check">
                <input type="checkbox" checked={form.aiTeam} onChange={e => set({ aiTeam: e.target.checked })} />
                <span>{tr('Giao')}{' '}<b>AI Manager</b>{' '}{tr('đọc code và soạn luật đội AI cho dự án (bạn duyệt trước khi dùng)')}</span>
              </label>
              {form.aiTeam && (
                <div className="form-field">
                  <label className="form-label" htmlFor="imp-note">{tr('Lưu ý cho AI Manager (không bắt buộc)')}</label>
                  <textarea id="imp-note" rows={3} maxLength={2000} value={form.note} onChange={e => set({ note: e.target.value })}
                    placeholder={tr('vd: chuẩn PSR-12, không sửa thư mục legacy/, mọi API phải có test')} />
                </div>
              )}
            </div>
          )}
          {cur === 'review' && <Review form={form} warnings={warnings} />}
          {problem && cur !== 'review' && <p className="faint" role="status">{problem}</p>}
        </>
      )}
      </div>
    </Modal>
  );
}

export function RepoStep({ form, set, providers, reading, onRead }) {
  const src = form.source;
  const setSrc = patch => set({ source: { ...src, ...patch }, branches: null, branch: '' });
  const needsToken = (src.provider === 'github' || src.provider === 'gitlab') && !providers[src.provider]?.configured;
  return (
    <div className="wz-fields">
      <div className="form-field">
        <label className="form-label" htmlFor="imp-name">{tr('Tên dự án')}</label>
        <input id="imp-name" value={form.name} maxLength={100} placeholder={tr('vd Hệ thống bán hàng')}
          onChange={e => set({ name: e.target.value, ...(form.slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="imp-slug">{tr('Slug (tên thư mục, profile lane)')}</label>
        <input id="imp-slug" value={form.slug} maxLength={40} onChange={e => set({ slug: e.target.value.toLowerCase(), slugTouched: true })} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="imp-src">{tr('Lấy repo từ')}</label>
        <select id="imp-src" className="msel" value={src.provider} onChange={e => setSrc({ provider: e.target.value })}>
          {SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {needsToken && <p className="m-err">{tr('Chưa kết nối {0} — kết nối ở "Tạo dự án từ khung → Kho Git" trước.', [src.provider === 'github' ? 'GitHub' : 'GitLab'])}</p>}
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="imp-url">{src.provider === 'local' ? tr('Thư mục repo trên máy') : 'URL repo'}</label>
        <div className="wz-row">
          <input id="imp-url" value={src.url} maxLength={500}
            placeholder={src.provider === 'local' ? '/home/ban/du-an' : src.provider === 'url' ? tr('git@github.com:cong-ty/du-an.git hoặc https://…') : 'https://github.com/cong-ty/du-an.git'}
            onChange={e => setSrc({ url: e.target.value })} />
          <button type="button" className="btn btn-sm btn-secondary" disabled={!src.url.trim() || reading || needsToken} onClick={onRead}>
            {reading ? <Loader2 size={14} className="wz-spin" aria-hidden="true" /> : <GitBranch size={14} aria-hidden="true" />}<span>{tr('Đọc nhánh')}</span>
          </button>
        </div>
      </div>
      {form.branches && (
        <div className="form-field">
          <label className="form-label" htmlFor="imp-branch">{tr('Nhánh tích hợp (tính năng tách từ đây và PR vào đây)')}</label>
          <select id="imp-branch" className="msel" value={form.branch} onChange={e => set({ branch: e.target.value })}>
            {form.branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function AppCard({ role, title, app, onChange, onImage }) {
  const id = k => `imp-${role}-${k}`;
  const field = (k, label, placeholder, hint) => (
    <div className="form-field">
      <label className="form-label" htmlFor={id(k)}>{label}</label>
      <input id={id(k)} className="mono" value={app[k]} maxLength={500} placeholder={placeholder} onChange={e => onChange({ [k]: e.target.value })} />
      {hint && <p className="wz-hint">{hint}</p>}
    </div>
  );
  return (
    <section className="card-panel imp-app" aria-labelledby={id('h')}>
      <label className="wz-check imp-app-head">
        <input type="checkbox" checked={app.enabled} onChange={e => onChange({ enabled: e.target.checked })} />
        <span id={id('h')}><b>{title}</b></span>
      </label>
      {app.enabled && (
        <>
          <div className="imp-templates" role="group" aria-label={tr('Điền nhanh {0}', [title])}>
            <span className="faint">{tr('Điền giúp từ mẫu:')}</span>
            {TEMPLATES[role].map(t => (
              <button key={t.id} type="button" className="wf-preset" onClick={() => { onChange(applyTemplate(app, t)); onImage(t.image); }}>{t.label}</button>
            ))}
          </div>
          <div className="imp-grid">
            {field('dir', tr('Thư mục trong repo'), role === 'backend' ? tr('. hoặc backend') : 'frontend', tr('Để trống = gốc repo'))}
            {field('tech', tr('Công nghệ'), role === 'backend' ? 'vd Laravel 11 / PHP 8.3' : 'vd Vue 3 + Vite')}
          </div>
          {role === 'frontend' && (
            <label className="wz-check">
              <input type="checkbox" checked={!!app.mobile} onChange={e => onChange({ mobile: e.target.checked, ...(e.target.checked && !app.apiDefine ? { apiDefine: 'API_URL' } : {}) })} />
              <span>{tr('Đây là app Flutter (Android) — kiểm tra trên máy ảo Android')}</span>
            </label>
          )}
          {field('install', tr('Lệnh cài thư viện'), 'vd composer install')}
          {app.mobile ? (
            <div className="imp-grid">
              {field('packageId', tr('Package id của app'), 'com.congty.app', tr('applicationId trong android/app/build.gradle — dùng để cài, gỡ và xoá dữ liệu app trên máy ảo.'))}
              {field('apiDefine', tr('Biến địa chỉ backend (--dart-define)'), 'API_URL', tr('Lane build APK với biến này = backend của lane. Để trống nếu app dùng địa chỉ cố định.'))}
            </div>
          ) : field('run', tr('Lệnh chạy (dev)'), 'vd php artisan serve --port=$PORT', tr('Chạy nền trên lane; $PORT = cổng của lane cho ứng dụng này.'))}
          <div className="imp-grid">
            {field('build', tr('Lệnh build (không bắt buộc)'), 'vd npm run build')}
            {field('test', tr('Lệnh test'), 'vd php artisan test')}
          </div>
          {!app.mobile && field('healthPath', tr('Đường dẫn kiểm tra đang chạy'), '/health', tr('Lane coi ứng dụng đã lên khi đường dẫn này trả 2xx.'))}
        </>
      )}
    </section>
  );
}

function DocsStep({ docs, onChange }) {
  const field = (k, label, placeholder, hint) => (
    <div className="form-field">
      <label className="form-label" htmlFor={`imp-doc-${k}`}>{label}</label>
      <input id={`imp-doc-${k}`} className="mono" value={docs[k]} maxLength={200} placeholder={placeholder} onChange={e => onChange({ [k]: e.target.value })} />
      {hint && <p className="wz-hint">{hint}</p>}
    </div>
  );
  return (
    <div className="wz-fields">
      <p className="wz-hint">{tr('Tài liệu dự án đã có trong repo (đường dẫn trong repo). Mọi bước của lane — PM, BA, kiến trúc, thiết kế, code, test — sẽ đọc và')}{' '}<b>{tr('làm đúng theo')}</b>{' '}{tr('các tài liệu này: giao diện giống mockup, code theo kiến trúc, nghiệp vụ theo yêu cầu. Khi clone, Shipyard kiểm tra từng file có thật.')}</p>
      {field('brief', tr('Yêu cầu sản phẩm / nghiệp vụ'), tr('vd docs/yeu-cau.md hoặc README.md'))}
      {field('architecture', tr('Kiến trúc hệ thống'), 'vd docs/architecture.md')}
      {field('design', tr('Hướng dẫn thiết kế giao diện (màu, font, thành phần)'), 'vd docs/design/design.md')}
      {field('mockups', tr('Thư mục mockup / ảnh thiết kế đã duyệt'), 'vd docs/design/mockups', tr('File .html, .png, .jpg, .svg, .pdf trong thư mục này là các màn hình chuẩn.'))}
      <div className="form-field">
        <label className="form-label" htmlFor="imp-doc-other">{tr('Tài liệu khác (mỗi dòng một đường dẫn)')}</label>
        <textarea id="imp-doc-other" className="mono" rows={3} value={docs.other} onChange={e => onChange({ other: e.target.value })}
          placeholder={'vd docs/api.md\ndocs/quy-tac-nghiep-vu.md'} />
      </div>
      <p className="wz-hint">{tr('Chưa có tài liệu thì để trống — lane làm theo code hiện có và mô tả của từng tính năng. Sau này thêm tài liệu: ghi vị trí vào')}<code> .shipyard/docs.json</code>{' '}{tr('trong repo (các khoá brief, architecture, design, mockups, other).')}</p>
    </div>
  );
}

function EnvStep({ form, set }) {
  return (
    <div className="wz-fields">
      <fieldset className="form-field imp-db">
        <legend className="form-label">Database</legend>
        {DB_OPTIONS.map(o => (
          <label key={o.id} className={`imp-db-opt${form.db === o.id ? ' on' : ''}`}>
            <input type="radio" name="imp-db" checked={form.db === o.id} onChange={() => set({ db: o.id })} />
            <span><b>{o.label}</b>{o.desc && <small>{o.desc}</small>}</span>
          </label>
        ))}
      </fieldset>
      <div className="imp-grid">
        <div className="form-field">
          <label className="form-label" htmlFor="imp-migrate">{tr('Lệnh migrate (không bắt buộc)')}</label>
          <input id="imp-migrate" className="mono" value={form.migrate} maxLength={500} placeholder="vd php artisan migrate --force" onChange={e => set({ migrate: e.target.value })} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="imp-seed">{tr('Lệnh seed (không bắt buộc)')}</label>
          <input id="imp-seed" className="mono" value={form.seed} maxLength={500} placeholder="vd php artisan db:seed" onChange={e => set({ seed: e.target.value })} />
        </div>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="imp-env">{tr('Biến môi trường ứng dụng cần (mỗi dòng TEN=gia_tri)')}</label>
        <textarea id="imp-env" className="mono" rows={6} value={form.env} onChange={e => set({ env: e.target.value })}
          placeholder={'DB_CONNECTION=pgsql\nDB_HOST=$DB_HOST\nDB_PORT=$DB_PORT\nDB_DATABASE=$DB_NAME\nDB_USERNAME=$DB_USER\nDB_PASSWORD=$DB_PASSWORD'} />
        <details className="wz-hint">
          <summary>{tr('Biến lane cung cấp, dùng được trong giá trị và lệnh')}</summary>
          <ul>{LANE_VARS.map(([v, d]) => <li key={v}><code>{v}</code> — {d}</li>)}</ul>
        </details>
        <p className="wz-hint">{tr('Giá trị lưu trên máy này (config/imports/, chỉ chủ máy đọc được). Ký tự $ khác các biến trên được giữ nguyên.')}</p>
      </div>
      <div className="imp-grid">
        <div className="form-field">
          <label className="form-label" htmlFor="imp-tests">{tr('File test')}</label>
          <input id="imp-tests" className="mono" value={form.testPaths} maxLength={300} placeholder="vd tests/ *.test.ts" onChange={e => set({ testPaths: e.target.value })} />
          <p className="wz-hint">{tr('Để lane nhận ra lần sửa chỉ đụng tới test.')}</p>
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="imp-image">Image OpenHands</label>
          <input id="imp-image" className="mono" value={form.image} maxLength={200} placeholder="vd php:8.3-cli" onChange={e => set({ image: e.target.value })} />
          <p className="wz-hint">{tr('Chỉ cần khi code bằng OpenHands.')}</p>
        </div>
      </div>
    </div>
  );
}

function Review({ form, warnings }) {
  const app = (title, a) => a.enabled && (
    <div className="wz-advice-sec"><b>{title} — {a.tech}</b> <span className="faint">({a.dir || '.'})</span>
      <ul className="mono imp-cmds">
        {a.install && <li>{tr('cài: {0}', [a.install])}</li>}<li>{tr('chạy: {0}', [a.run])}</li>{a.build && <li>build: {a.build}</li>}{a.test && <li>test: {a.test}</li>}<li>{tr('kiểm tra: {0}', [a.healthPath || '/'])}</li>
      </ul>
    </div>
  );
  return (
    <div className="wz-fields">
      <div className="wz-review-pills">
        <span className="wz-pill">{form.name} ({form.slug})</span>
        <span className="wz-pill">{form.source.url}</span>
        <span className="wz-pill">{tr('nhánh {0}', [form.branch])}</span>
        <span className="wz-pill">DB: {DB_OPTIONS.find(o => o.id === form.db)?.label}</span>
        {form.aiTeam && <span className="wz-pill">{tr('AI Manager soạn luật')}</span>}
      </div>
      {app('Backend', form.backend)}
      {app('Frontend', form.frontend)}
      <div className="wz-advice-sec"><b>{tr('Tài liệu lane phải theo')}</b>
        {[form.docs.brief, form.docs.architecture, form.docs.design, form.docs.mockups && `${form.docs.mockups}/`, ...form.docs.other.split('\n')].map(x => x.trim()).filter(Boolean).length
          ? <ul className="mono imp-cmds">{[[tr('yêu cầu'), form.docs.brief], [tr('kiến trúc'), form.docs.architecture], [tr('thiết kế'), form.docs.design], ['mockup', form.docs.mockups && `${form.docs.mockups}/`],
              ...form.docs.other.split('\n').map(x => [tr('khác'), x.trim()])].filter(([, p]) => p).map(([k, p]) => <li key={k + p}>{k}: {p}</li>)}</ul>
          : <span className="faint">{' '}{tr('— chưa khai báo')}</span>}
      </div>
      {warnings.length > 0 && (
        <div className="imp-warn" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <p className="wz-hint">{tr('Shipyard sẽ clone repo vào máy này, sinh script cho lane từ đúng các lệnh trên, đăng ký dự án với quy trình đã chọn. Repo gốc không bị đổi')}{form.aiTeam ? tr(', trừ luật đội AI sau khi bạn duyệt') : ''}.</p>
    </div>
  );
}
