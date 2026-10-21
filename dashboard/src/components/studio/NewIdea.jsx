import React, { useState } from 'react';
import { Sparkles, Send, ArrowRight } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { EXAMPLES } from '../../lib/studio.js';

export default function NewIdea({ onStart }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!text.trim() || text.trim().length < 5 || busy) return;
    setBusy(true);
    await onStart(text.trim());
    setBusy(false);
  };

  return (
    <div className="st-new">
      <div className="st-new-hero">
        <div className="st-new-sparkle-badge">
          <Sparkles size={18} />
        </div>
        <h1 className="st-new-title">Bạn muốn làm sản phẩm gì?</h1>
        <p className="st-new-sub">
          Gõ ý tưởng bằng lời thường. Đội AI sẽ hỗ trợ từ A-Z: AI PM phỏng vấn yêu cầu, AI kiến trúc sư thiết kế hệ thống, AI thiết kế tạo giao diện mẫu. Bạn duyệt từng bước ngay tại đây, sau đó Shipyard sẽ tạo dự án và điều phối lập trình.
        </p>
      </div>

      <div className="st-new-card">
        <textarea
          className="st-new-input"
          rows={4}
          value={text}
          maxLength={8000}
          aria-label="Ý tưởng sản phẩm"
          placeholder="Ví dụ: Tôi cần hệ thống bán hàng cho chuỗi 5 nhà hàng, phục vụ gọi món tại bàn bằng QR code, quản lý bếp và xuất hóa đơn…"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim().length >= 5) {
              e.preventDefault();
              go();
            }
          }}
        />

        <div className="st-new-bottom">
          <span className="st-new-hint">Mẹo: Nhấn <b>Ctrl + Enter</b> để bắt đầu trao đổi với AI PM</span>
          <Button
            variant="primary"
            icon={busy ? undefined : ArrowRight}
            disabled={busy || text.trim().length < 5}
            onClick={go}>
            {busy ? 'Đang khởi tạo…' : 'Bắt đầu với AI PM'}
          </Button>
        </div>
      </div>

      <div className="st-presets-block">
        <div className="st-presets-label">Gợi ý ý tưởng mẫu:</div>
        <div className="st-presets-grid">
          {EXAMPLES.map(x => (
            <button
              key={x}
              type="button"
              className="st-preset-card"
              onClick={() => setText(x)}>
              <span className="st-preset-text">{x}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
