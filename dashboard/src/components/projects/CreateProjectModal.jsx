import React, { useEffect, useState } from 'react';
import { Lightbulb, LayoutTemplate, GitBranch, Rocket, FileText, X, ArrowLeft, ArrowRight } from 'lucide-react';
import Modal from '../Modal.jsx';
import { RepoStep } from './ImportRepoWizard.jsx';
import TemplatePicker from './TemplatePicker.jsx';
import { studio, startBody, startProblem } from '../../lib/studio.js';
import { scaffold } from '../../lib/scaffold.js';
import { importer } from '../../lib/importer.js';
import '../../styles/wizard.css';
import { tr } from '../../lib/i18n.js';

const KINDS = [
  { id: 'idea', icon: Lightbulb, title: tr('Từ ý tưởng'), desc: tr('Mô tả sản phẩm bằng lời thường; AI PM, kiến trúc sư và thiết kế cùng bạn làm rõ rồi mới tạo.') },
  { id: 'template', icon: LayoutTemplate, title: tr('Từ khung'), desc: tr('Chọn sẵn công nghệ (khung); các AI thiết kế sản phẩm trong khung đó.') },
  { id: 'git', icon: GitBranch, title: tr('Từ git có sẵn'), desc: tr('AI đọc toàn bộ code và tài liệu dự án bạn đưa vào, viết lại thành tài liệu dự án để bạn duyệt.') },
];
const DOC_ACCEPT = '.md,.txt,.csv,.json,.html,.htm,.yaml,.yml';
const MAX_FILE = 2 * 1024 * 1024;

/**
 * "Tạo dự án", in two steps: how to start (an idea, a template, an existing git repo), then what the AIs
 * need for it — the stack picked for a template, the repo and its documents for git — and a description.
 * Then the project chat opens (AI PM → architect → designer → workflow). Drafts are in the project list.
 */
export default function CreateProjectModal({ onClose, onStarted }) {
  const [kind, setKind] = useState('template');
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ text: '', template: { kind: 'single', stack: '', options: {}, frontend: { stack: '', options: {} } }, name: '', slug: '', slugTouched: false, source: { provider: 'url', url: '' }, branch: '', branches: null, files: [], paths: '' });
  const [catalog, setCatalog] = useState(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = patch => setF(x => ({ ...x, ...patch }));

  useEffect(() => {
    scaffold.catalog().then(setCatalog, e => setErr(e.message));
  }, []);

  const readBranches = async () => {
    setReading(true); setErr('');
    try {
      const r = await importer.branches({ provider: f.source.provider, url: f.source.url.trim() });
      const pick = r.branches.includes('development') ? 'development' : r.defaultBranch || r.branches[0] || '';
      set({ branches: r.branches, branch: pick });
      if (!r.branches.length) setErr(tr('Repo chưa có nhánh nào'));
    } catch (e) { setErr(e.message); }
    setReading(false);
  };
  const addFiles = async list => {
    setErr('');
    const read = [];
    for (const file of list) {
      if (file.size > MAX_FILE) { setErr(tr('{0}: tối đa 2 MB', [file.name])); continue; }
      read.push({ name: file.name, content: await file.text() });
    }
    set({ files: [...f.files.filter(x => !read.some(r => r.name === x.name)), ...read].slice(0, 20) });
  };
  const problem = startProblem(kind, f);
  const go = async () => {
    setBusy(true); setErr('');
    try { const s = await studio.start(startBody(kind, f)); onStarted(s.id); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal title={step === 0 ? tr('Tạo dự án') : `${tr('Tạo dự án')} · ${KINDS.find(k => k.id === kind).title}`} wide onClose={onClose}
      buttons={step === 0
        ? [{ label: tr('Đóng'), fn: onClose }, { label: tr('Tiếp'), icon: ArrowRight, cls: 'add', fn: () => setStep(1) }]
        // "Từ ý tưởng" has nothing to fill in here: picking it opens the chat with the AI PM.
        : [{ label: tr('Quay lại'), icon: ArrowLeft, fn: () => setStep(0) },
          { label: busy ? tr('Đang gửi…') : tr('Bắt đầu với AI PM'), icon: Rocket, cls: 'add', disabled: busy || !!problem, fn: go }]}>
      {err && <p className="m-err" role="alert">{err}</p>}
      <div className="wz">
        {step === 0 && <fieldset className="wz-grid">
          <legend className="form-label">{tr('Tạo dự án từ đâu?')}</legend>
          {KINDS.map(k => (
            <label key={k.id} className={`wz-choice${kind === k.id ? ' on' : ''}`}>
              <input type="radio" name="cp-kind" value={k.id} checked={kind === k.id} onChange={() => (k.id === 'idea' ? onStarted(null) : setKind(k.id))} />
              <span className="wz-choice-head"><span className="wz-choice-title"><k.icon size={14} aria-hidden="true" /> {k.title}</span></span>
              <span className="wz-choice-desc">{k.desc}</span>
            </label>
          ))}
        </fieldset>}

        {step === 1 && <div className="wz-fields">
          {kind === 'template' && <TemplatePicker catalog={catalog} value={f.template} onChange={template => set({ template })}
            onFrameworksChanged={() => scaffold.catalog().then(setCatalog, e => setErr(e.message))} />}

          {kind === 'git' && (
            <>
              <RepoStep form={f} set={set} providers={catalog?.providers || {}} reading={reading} onRead={readBranches} />
              <div className="form-field">
                <label className="form-label" htmlFor="cp-files"><FileText size={13} aria-hidden="true" /> {tr('Tài liệu của dự án')}</label>
                <p className="wz-hint">{tr('Đưa vào toàn bộ tài liệu bạn có (yêu cầu, nghiệp vụ, thiết kế, dữ liệu mẫu…). AI đọc hết cùng với code và lấy làm tài liệu dự án; mọi tính năng thêm sau này đều dựa vào đó.')}</p>
                <input id="cp-files" type="file" multiple accept={DOC_ACCEPT} onChange={e => { addFiles([...e.target.files]); e.target.value = ''; }} />
                {f.files.length > 0 && (
                  <ul className="cp-files">
                    {f.files.map(x => (
                      <li key={x.name}>
                        <span>{x.name}</span>
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Bỏ {0}', [x.name])} onClick={() => set({ files: f.files.filter(y => y.name !== x.name) })}><X size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="cp-paths">{tr('Tài liệu đã có trong repo (mỗi dòng một đường dẫn)')}</label>
                <textarea id="cp-paths" rows={3} value={f.paths} placeholder="docs/yeu-cau.md" onChange={e => set({ paths: e.target.value })} />
              </div>
            </>
          )}

          <div className="form-field">
            <label className="form-label" htmlFor="cp-text">{kind === 'git' ? tr('Dự án này là gì, bạn muốn AI chú ý điều gì?') : tr('Bạn muốn làm sản phẩm gì?')}</label>
            <textarea id="cp-text" rows={4} maxLength={8000} value={f.text} onChange={e => set({ text: e.target.value })}
              placeholder={kind === 'git' ? tr('Ví dụ: Hệ thống bán hàng đang chạy cho 5 cửa hàng; sắp tới cần thêm quản lý kho.') : tr('Ví dụ: Tôi cần hệ thống bán hàng cho chuỗi 5 nhà hàng, phục vụ gọi món tại bàn bằng QR code, quản lý bếp và xuất hóa đơn…')} />
          </div>
          {problem && <p className="wz-hint">{problem}</p>}
        </div>}
      </div>
    </Modal>
  );
}
