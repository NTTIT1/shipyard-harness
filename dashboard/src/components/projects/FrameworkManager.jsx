import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { scaffold } from '../../lib/scaffold.js';
import { tr } from '../../lib/i18n.js';

const LANGS = [['java', 'Java'], ['kotlin', 'Kotlin'], ['python', 'Python'], ['typescript', 'TypeScript'], ['go', 'Go'], ['csharp', 'C#'], ['php', 'PHP'], ['other', tr('Khác')]];
const TO = [['package', tr('package của dự án (vd: com.congty.kho_hang)')], ['slug', tr('slug (kho-hang)')], ['pascal', tr('tên lớp (KhoHang)')],
  ['snake', tr('snake (kho_hang)')], ['name', tr('tên hiển thị (Kho hàng)')]];
const blank = () => ({ id: '', label: '', description: '', language: 'java', repoUrl: '', branch: 'main', packageBase: '',
  replace: [{ from: '', to: 'slug' }], samples: '', remove: '', port: 8080, commands: { dev: '', test: '', build: '' }, verify: '' });
const toForm = f => ({ ...f, samples: (f.samples || []).join('\n'), remove: (f.remove || []).join('\n'), replace: f.replace?.length ? f.replace : [{ from: '', to: 'slug' }] });
const toBody = f => ({ ...f, replace: f.replace.filter(r => r.from.trim()) });

/**
 * "Framework của công ty" (administrators): the company's starter repos offered in "Từ khung" — where
 * the repo is, which names to replace with the new project's, which folders are sample code.
 */
export default function FrameworkManager({ onSaved }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { scaffold.frameworks().then(d => setList(d.frameworks), e => setMsg({ err: true, text: e.message })); }, []);
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const setRep = (i, k, v) => setForm(f => ({ ...f, replace: f.replace.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  const save = async next => {
    setBusy(true); setMsg(null);
    try {
      const d = await scaffold.saveFrameworks(next);
      setList(d.frameworks); setForm(null); onSaved?.();
      setMsg({ text: tr('Đã lưu. Framework có trong danh sách "Ngôn ngữ & framework".') });
    } catch (e) { setMsg({ err: true, text: e.message }); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setMsg(null);
    try { const r = await scaffold.checkFramework(toBody(form)); setMsg({ text: tr('Đọc được repo — nhánh {0} ở commit {1}.', [form.branch, r.sha]) }); }
    catch (e) { setMsg({ err: true, text: e.message }); } finally { setBusy(false); }
  };

  if (!list) return <div className="fw-box">{msg ? <p className="m-err">{msg.text}</p> : <p className="faint">{tr('Đang tải…')}</p>}</div>;
  const editingIdx = form ? list.findIndex(f => f.id === form._orig) : -1;

  return (
    <div className="fw-box" aria-labelledby="fw-h">
      <h3 id="fw-h" className="form-label">{tr('Framework của công ty')}</h3>
      <p className="faint">{tr('Repo khung của công ty (thư viện, phân quyền, cấu trúc thư mục, code mẫu). Dự án mới là bản sao của repo đó với tên đã đổi; Shipyard chỉ thêm phần còn thiếu.')}</p>
      {list.length > 0 && (
        <ul className="fw-list">
          {list.map(f => (
            <li key={f.id}>
              <span className="fw-name">{f.label}</span>
              <span className="faint">{f.repoUrl} · {f.branch}</span>
              <Button size="sm" variant="ghost" onClick={() => setForm({ ...toForm(f), _orig: f.id })}>{tr('Sửa')}</Button>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={tr('Xoá {0}', [f.label])} disabled={busy}
                onClick={() => save(list.filter(x => x.id !== f.id))} />
            </li>
          ))}
        </ul>
      )}
      {!form && <Button size="sm" icon={Plus} onClick={() => setForm(blank())}>{tr('Thêm framework')}</Button>}

      {form && (
        <form className="fw-form" onSubmit={e => {
          e.preventDefault();
          const { _orig, ...body } = toBody(form);
          save(editingIdx >= 0 ? list.map((f, i) => (i === editingIdx ? body : f)) : [...list, body]);
        }}>
          <div className="fw-grid">
            <label className="form-field"><span className="form-label">{tr('Tên')}</span>
              <input className="msel" value={form.label} onChange={e => set({ label: e.target.value })} required placeholder="ACME Spring Boot" /></label>
            <label className="form-field"><span className="form-label">{tr('Mã')}</span>
              <input className="msel" value={form.id} onChange={e => set({ id: e.target.value })} required placeholder="acme-spring" /></label>
            <label className="form-field"><span className="form-label">{tr('Ngôn ngữ')}</span>
              <select className="msel" value={form.language} onChange={e => set({ language: e.target.value })}>
                {LANGS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select></label>
            <label className="form-field fw-wide"><span className="form-label">{tr('Repo')}</span>
              <input className="msel" value={form.repoUrl} onChange={e => set({ repoUrl: e.target.value })} required placeholder="https://github.com/congty/spring-starter.git" /></label>
            <label className="form-field"><span className="form-label">{tr('Nhánh')}</span>
              <input className="msel" value={form.branch} onChange={e => set({ branch: e.target.value })} required /></label>
            <label className="form-field fw-wide"><span className="form-label">{tr('Mô tả')}</span>
              <input className="msel" value={form.description} onChange={e => set({ description: e.target.value })} /></label>
          </div>

          <fieldset className="fw-set">
            <legend className="form-label">{tr('Đổi tên theo dự án mới')}</legend>
            {form.replace.map((r, i) => (
              <div key={i} className="fw-rep">
                <input className="msel" aria-label={tr('Chuỗi trong framework')} value={r.from} onChange={e => setRep(i, 'from', e.target.value)} placeholder="com.congty.starter" />
                <span aria-hidden="true">→</span>
                <select className="msel" aria-label={tr('Đổi thành')} value={r.to} onChange={e => setRep(i, 'to', e.target.value)}>
                  {TO.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                </select>
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={tr('Bỏ dòng')} onClick={() => set({ replace: form.replace.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ replace: [...form.replace, { from: '', to: 'slug' }] })}>{tr('Thêm chuỗi')}</Button>
            <label className="form-field"><span className="form-label">{tr('Gốc package (khi đổi thành package)')}</span>
              <input className="msel" value={form.packageBase} onChange={e => set({ packageBase: e.target.value })} placeholder="com.congty" /></label>
            <span className="faint">{tr('Tên có dấu chấm cũng được đổi trong đường dẫn: com/congty/starter → com/congty/kho_hang.')}</span>
          </fieldset>

          <div className="fw-grid">
            <label className="form-field"><span className="form-label">{tr('Thư mục / file code mẫu (mỗi dòng một mục)')}</span>
              <textarea className="msel" rows={3} value={form.samples} onChange={e => set({ samples: e.target.value })} placeholder="src/main/java/com/congty/starter/sample" />
              <span className="faint">{tr('Bỏ đi khi người tạo không chọn "Kèm code mẫu".')}</span></label>
            <label className="form-field"><span className="form-label">{tr('Luôn bỏ (chỉ dùng cho framework)')}</span>
              <textarea className="msel" rows={3} value={form.remove} onChange={e => set({ remove: e.target.value })} placeholder=".github/workflows/publish-starter.yml" /></label>
            <label className="form-field"><span className="form-label">{tr('Lệnh chạy')}</span>
              <input className="msel" value={form.commands.dev} onChange={e => set({ commands: { ...form.commands, dev: e.target.value } })} placeholder="./mvnw spring-boot:run" /></label>
            <label className="form-field"><span className="form-label">{tr('Lệnh test')}</span>
              <input className="msel" value={form.commands.test} onChange={e => set({ commands: { ...form.commands, test: e.target.value } })} placeholder="./mvnw test" /></label>
            <label className="form-field"><span className="form-label">{tr('Lệnh kiểm tra sau khi tạo (tuỳ chọn)')}</span>
              <input className="msel" value={form.verify} onChange={e => set({ verify: e.target.value })} placeholder="./mvnw -B -q verify" /></label>
            <label className="form-field"><span className="form-label">{tr('Cổng ứng dụng')}</span>
              <input className="msel" type="number" min="1" max="65535" value={form.port} onChange={e => set({ port: e.target.value })} /></label>
          </div>

          <div className="fw-actions">
            <Button type="submit" variant="primary" icon={Check} disabled={busy}>{tr('Lưu framework')}</Button>
            <Button type="button" disabled={busy || !form.repoUrl} onClick={check}>{tr('Kiểm tra repo')}</Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>{tr('Huỷ')}</Button>
          </div>
        </form>
      )}
      {msg && <p className={msg.err ? 'm-err' : 'prov-ok'} role="status">{msg.text}</p>}
    </div>
  );
}
