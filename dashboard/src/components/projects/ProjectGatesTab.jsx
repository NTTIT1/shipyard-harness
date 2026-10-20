import React, { useEffect, useState } from 'react';
import { AlertCircle, SlidersHorizontal } from 'lucide-react';
import Badge from '../ui/Badge.jsx';
import { platform } from '../../lib/platform.js';
import { STEPS, STEP_LABEL } from '../../lib/review.js';

const STEP_DESCRIPTIONS = {
  PM: 'Xác định mục tiêu, phạm vi và tiêu chí nghiệm thu của tính năng.',
  BA: 'Phân tích quy trình nghiệp vụ và các ca sử dụng chi tiết.',
  ARCH: 'Thiết kế kiến trúc hệ thống, mô hình dữ liệu và sơ đồ luồng.',
  DESIGN: 'Thiết kế giao diện UI/UX và các tương tác người dùng.',
  DEV: 'Viết mã nguồn, tích hợp tính năng và giải quyết các phụ thuộc.',
  TEST: 'Kiểm thử chức năng, hiệu năng và xác thực kịch bản lỗi.',
};

export default function ProjectGatesTab({ pid, canManage }) {
  const [policy, setPolicy] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    platform.gatePolicy(pid).then(setPolicy, e => setErr(e.message));
  }, [pid]);

  const toggle = async (step, auto) => {
    try {
      setPolicy(await platform.setGatePolicy(pid, { [step]: auto ? 'AUTO' : 'REQUIRED' }));
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!policy) {
    return err ? (
      <div className="alert-banner err" role="alert">
        <AlertCircle size={16} />
        <div className="alert-banner-content">{err}</div>
      </div>
    ) : (
      <p className="muted-empty">Đang tải cấu hình cổng duyệt…</p>
    );
  }

  return (
    <div className="pj-tab-stack">
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <SlidersHorizontal size={17} style={{ color: 'var(--accent-text)' }} />
            <span>Chính sách phê duyệt quy trình (Gates)</span>
          </div>
        </div>
        <div className="gate-pipeline-list" style={{ border: 'none', borderRadius: 0 }}>
          {STEPS.map((s, idx) => {
            const isAuto = policy[s] === 'AUTO';
            return (
              <div key={s} className="gate-pipeline-card">
                <div className="gate-card-left">
                  <div className="gate-step-index">{idx + 1}</div>
                  <div className="gate-card-texts">
                    <div className="gate-step-name">{STEP_LABEL[s]}</div>
                    <div className="gate-step-desc">
                      {STEP_DESCRIPTIONS[s] || 'Bước trong quy trình triển khai tính năng.'}
                    </div>
                  </div>
                </div>
                <div className="gate-card-right">
                  <label className="gate-switch-btn rv-sub">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={isAuto}
                      onChange={e => toggle(s, e.target.checked)}
                    />
                    <span>Tự động duyệt</span>
                  </label>
                  <Badge tone={isAuto ? 'ok' : 'warn'} dot={true}>
                    {isAuto ? 'Tự động' : 'Cần người duyệt'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
        <div className="pj-card-footnote">
          Các bước đặt <b>Tự động duyệt</b> vẫn được ghi lại đầy đủ trong lịch sử và lưu vào bộ nhớ dự án, nhưng hệ thống sẽ tự động thông qua mà không phải chờ phê duyệt thủ công.
        </div>
      </div>
    </div>
  );
}
