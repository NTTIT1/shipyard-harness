import React from 'react';
import { HeartPulse } from 'lucide-react';
import Badge from './ui/Badge.jsx';
import PipelineMap from './PipelineMap.jsx';
import StepsTable from './StepsTable.jsx';
import { fmtAge, fmtDur } from '../lib/format.js';
import { stageLabel } from '../lib/laneview.js';
import { fmtVnd, fmtUsd } from '../lib/costs.js';
import { getSimpleStepIndex } from './ProjectBoardView.jsx';

const CUSTOMER_STAGES = [
  { id: 'plan', label: '1. Kế hoạch & Spec', sub: 'Intake / Plan' },
  { id: 'code', label: '2. Lập trình', sub: 'Implement / Fix' },
  { id: 'check', label: '3. Kiểm tra tự động', sub: 'Gates / E2E' },
  { id: 'qc', label: '4. Review & QC', sub: 'Review / QC' },
  { id: 'pr', label: '5. Pull Request', sub: 'PR / Merge' },
  { id: 'done', label: '6. Hoàn tất', sub: 'Done' },
];

export default function LaneOverview({ lane, config, archived }) {
  const gd = (lane.gate_decision || '').toUpperCase();
  const [age] = fmtAge(lane.heartbeat_age_sec);
  const curIdx = getSimpleStepIndex(lane.stage, lane.status);

  return (
    <div className="ov">
      {!archived && lane.needs_action && (
        <div className="ov-callout warn">
          <strong>Cần bạn xử lý:</strong> {lane.needs_action}
        </div>
      )}

      {/* Clean 4-column Lane Telemetry Strip */}
      <div className="ov-telemetry-strip">
        <div className="ov-telemetry-cell">
          <span className="ov-telemetry-label">Tiến độ tính năng</span>
          <div className="ov-telemetry-row">
            <span className="ov-telemetry-val mono">{lane.progress != null ? `${lane.progress}%` : '—'}</span>
            {lane.progress != null && (
              <span className="ov-bar" style={{ flex: 1, maxWidth: 110 }}>
                <i style={{ width: `${Math.max(0, Math.min(100, Number(lane.progress) || 0))}%` }} />
              </span>
            )}
          </div>
          <span className="ov-telemetry-sub">
            Bước hiện tại: <b>{stageLabel(lane.stage)}</b>
            {!archived && lane.stage_age_sec != null ? ` · ${fmtDur(lane.stage_age_sec)}` : ''}
          </span>
        </div>

        <div className="ov-telemetry-cell">
          <span className="ov-telemetry-label">Cổng chất lượng & CI</span>
          <div className="ov-telemetry-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={gd === 'GO' ? 'ok' : gd === 'NO-GO' ? 'danger' : 'neutral'}>gate {gd || '—'}</Badge>
            <Badge>CI {lane.ci_status || '—'}</Badge>
          </div>
          <span className="ov-telemetry-sub">
            Môi trường: <Badge tone={lane.api_up ? 'ok' : 'neutral'} dot>api</Badge>{' '}
            <Badge tone={lane.fe_up ? 'ok' : 'neutral'} dot>fe</Badge>
          </span>
        </div>

        <div className="ov-telemetry-cell">
          <span className="ov-telemetry-label">Chi phí thực thi Lane</span>
          <div className="ov-telemetry-row">
            <span className="ov-telemetry-val mono">{fmtVnd(lane.cost_vnd || 0)}</span>
          </div>
          <span className="ov-telemetry-sub mono">
            Quy đổi API: {fmtUsd(lane.cost_usd || 0)}
          </span>
        </div>

        <div className="ov-telemetry-cell">
          <span className="ov-telemetry-label">Tín hiệu & Phiên bản</span>
          <div className="ov-telemetry-row" style={{ gap: 6 }}>
            {!archived && <Badge tone={lane.liveness === 'dead' ? 'danger' : 'neutral'} title="Tín hiệu sống gần nhất"><HeartPulse size={12} aria-hidden="true" /> {age}</Badge>}
            {lane.head && <span className="ov-head mono" title={lane.head}>{String(lane.head).slice(0, 8)}</span>}
          </div>
          <span className="ov-telemetry-sub">
            {lane.status === 'passed' || lane.stage === 'done' ? 'Đã hoàn thành quy trình' : 'Đang đồng bộ trực tiếp'}
          </span>
        </div>
      </div>

      {/* Customer-friendly 6-stage visual progress bar */}
      <section className="ov-section">
        <h2>Tiến trình thực hiện (6 giai đoạn)</h2>
        <ol className="ov-stage-track" aria-label="6 giai đoạn thực hiện">
          {CUSTOMER_STAGES.map((st, idx) => {
            const isFinished = lane.status === 'passed' || lane.stage === 'done';
            const state = (isFinished || idx < curIdx) ? 'done' : idx === curIdx ? 'current' : 'pending';
            return (
              <li key={st.id} className={`ov-stage-step ${state}`}>
                <span className="ov-stage-dot" />
                <div className="ov-stage-texts">
                  <span className="ov-stage-title">{st.label}</span>
                  <span className="ov-stage-sub">{st.sub}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Sub-steps Table */}
      <section className="ov-section">
        <h2>Lịch sử các bước AI (Bước con)</h2>
        <StepsTable steps={lane.steps} />
      </section>

      {/* Collapsible Technical Details (Pipeline SVG + Raw Notes) */}
      <details className="ov-tech-details">
        <summary className="ov-tech-summary">
          <span>Sơ đồ luồng kỹ thuật chi tiết (Pipeline State Machine & Nhật ký)</span>
          <span className="mono faint" style={{ fontSize: 11 }}>Nhấn để mở / đóng</span>
        </summary>
        <div className="ov-tech-body">
          {lane.notes && <div className="ov-callout mono" style={{ fontSize: 12 }}>{lane.notes}</div>}
          <section className="ov-section">
            <PipelineMap lane={lane} config={config} archived={archived} />
          </section>
        </div>
      </details>
    </div>
  );
}
