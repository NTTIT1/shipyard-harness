import React, { useState } from 'react';
import { Link2, Plus, Wand2, Download } from 'lucide-react';
import Modal from '../Modal.jsx';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { platform } from '../../lib/platform.js';
import { slugify } from '../../lib/scaffold.js';

export default function LinkRepoModal({ canScaffold, onClose, onCreated, onOpenWizard, onOpenImport }) {
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false, repoUrl: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const p = await platform.createProject({
        name: form.name.trim(),
        slug: form.slug.trim(),
        repoUrl: form.repoUrl.trim(),
      });
      onCreated?.(p.id);
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Thêm hoặc liên kết dự án" onClose={onClose}>
      <div style={{ display: 'grid', gap: 16 }}>
        {canScaffold && (
          <div className="pj-modal-scaffold-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 13.5 }}>Khởi tạo dự án tự động từ khung</strong>
              <Badge tone="accent">Khuyên dùng</Badge>
            </div>
            <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Chọn ngôn ngữ (Java/Spring Boot, Python/FastAPI, TypeScript/NestJS/React), Database, tự tạo thư mục + kho Git và cấu hình Skill cho từng vai trò AI.
            </p>
            <Button
              variant="primary"
              icon={Wand2}
              onClick={() => {
                onClose();
                onOpenWizard?.();
              }}>
              Mở trình tạo dự án từ khung
            </Button>
          </div>
        )}

        {canScaffold && (
          <div className="pj-modal-scaffold-box">
            <strong style={{ fontSize: 13.5 }}>Nhập dự án có sẵn để AI làm việc</strong>
            <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Repo đã có code trên GitHub/GitLab/máy này: bạn khai báo cách cài, chạy, test của dự án; Shipyard clone về, sinh script cho lane,
              đăng ký quy trình và để AI Manager đọc code soạn luật.
            </p>
            <Button icon={Download} onClick={() => { onClose(); onOpenImport?.(); }}>Nhập dự án có sẵn từ Git</Button>
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Link2 size={15} style={{ color: 'var(--accent-text)' }} />
            <span>Hoặc chỉ liên kết (không clone, không lane)</span>
          </div>

          {err && <p className="m-err" role="alert" style={{ margin: 0 }}>{err}</p>}

          <div className="form-field">
            <label className="form-label">Tên dự án</label>
            <input
              required
              aria-label="Tên dự án"
              placeholder="Ví dụ: Hệ thống Quản lý Nhân sự"
              value={form.name}
              onChange={e => {
                const name = e.target.value;
                setForm(f => ({
                  ...f,
                  name,
                  ...(f.slugTouched ? {} : { slug: slugify(name) }),
                }));
              }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Mã định danh (Slug)</label>
            <input
              required
              aria-label="Slug"
              placeholder="hrm-system"
              pattern="[a-z0-9_-]+"
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase(), slugTouched: true })}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Kho mã nguồn (Repo URL hoặc đường dẫn máy chủ)</label>
            <input
              required
              aria-label="Repo URL"
              placeholder="https://github.com/org/repo.git"
              value={form.repoUrl}
              onChange={e => setForm({ ...form, repoUrl: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button type="submit" variant="primary" icon={Plus} disabled={busy}>
              {busy ? 'Đang tạo…' : 'Liên kết dự án'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
