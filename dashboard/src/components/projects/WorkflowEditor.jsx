import React, { useRef, useState, useEffect } from 'react';
import { GripVertical, Lock, ChevronUp, ChevronDown, Layers, ListOrdered, UserCheck } from 'lucide-react';
import { STEP_LABEL, GATE_MODES, MOVABLE, moveTo, moveStep, WORKFLOW_PRESETS, defaultApproverRole, APPROVER_ROLE_OPTIONS } from '../../lib/review.js';
import { platform } from '../../lib/platform.js';

export const ENTERPRISE_11_STEPS = [
  { id: 'step-1', phase: 'BA', stepNo: 1, label: 'Business Analyst', subLabel: 'Đặc tả và làm rõ', dep: 'Không · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Phân tích yêu cầu, bóc tách nghiệp vụ và viết tài liệu đặc tả User Stories (ba.md).' },
  { id: 'step-2', phase: 'BA', stepNo: 2, label: 'BA review đặc tả', subLabel: 'Con người phê duyệt', dep: '1 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', desc: 'BA Lead hoặc Product Owner kiểm tra, góp ý hoặc duyệt bản đặc tả nghiệp vụ.' },
  { id: 'step-3', phase: 'ARCH', stepNo: 3, label: 'Solution Architect', subLabel: 'Thiết kế giải pháp', dep: '2 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Thiết kế giải pháp hệ thống, lược đồ CSDL, chia task và API contract (plan.md).' },
  { id: 'step-4', phase: 'ARCH', stepNo: 4, label: 'Lead review thiết kế', subLabel: 'Con người phê duyệt', dep: '3 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', desc: 'Tech Lead thẩm định thiết kế kỹ thuật, đánh giá rủi ro và phê duyệt kiến trúc.' },
  { id: 'step-5', phase: 'DESIGN', stepNo: 5, label: 'UX Designer', subLabel: 'User flow và wireframe', dep: '4 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Thiết kế hành trình người dùng (User Journey), luồng tương tác và khung Wireframe (ux-flows.md).' },
  { id: 'step-6', phase: 'DESIGN', stepNo: 6, label: 'UI Designer', subLabel: 'UI responsive và component spec', dep: '5 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Thiết kế giao diện HTML mockup responsive theo chuẩn Design System, render ảnh desktop & mobile.' },
  { id: 'step-7', phase: 'DESIGN', stepNo: 7, label: 'Design QA', subLabel: 'Kiểm tra UI/UX độc lập', dep: '6 · bước bắt đầu từ 0', roleType: 'Kiểm tra độc lập', type: 'qa', desc: 'Kiểm tra độc lập chuẩn thiết kế: độ tương phản, khoảng cách lưới 8pt, kích thước chạm ≥44px.' },
  { id: 'step-8', phase: 'DESIGN', stepNo: 8, label: 'Review và phê duyệt UI/UX', subLabel: 'PM / Product Owner duyệt thiết kế', dep: '7 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', desc: 'PM hoặc Product Owner trực tiếp trải nghiệm mockup và phê duyệt thiết kế trước khi code.' },
  { id: 'step-9', phase: 'DEV', stepNo: 9, label: 'Backend Developer', subLabel: 'Triển khai theo đặc tả', dep: '8 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Lập trình CSDL, migration, service logic và REST APIs theo đúng kiến trúc đã duyệt.' },
  { id: 'step-10', phase: 'DEV', stepNo: 10, label: 'Frontend Developer', subLabel: 'Phát triển theo UI/UX đã duyệt', dep: '9 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', desc: 'Lập trình giao diện React/Vite, tích hợp API backend theo mockup đã được phê duyệt.' },
  { id: 'step-11', phase: 'TEST', stepNo: 11, label: 'Quality Gate', subLabel: 'CI và bộ quy trình test độc lập', dep: '10 · bước bắt đầu từ 0', roleType: 'Kiểm tra tự động', type: 'qa', desc: 'Chạy CI pipeline, kiểm thử đơn vị, kiểm thử tích hợp và E2E Playwright trên trình duyệt.' },
];

const STEP_DESCRIPTIONS = {
  BA: 'Business Analyst đặc tả nghiệp vụ & User Stories → BA Lead phê duyệt (ba.md).',
  ARCH: 'Solution Architect thiết kế giải pháp CSDL & API → Tech Lead phê duyệt (plan.md).',
  DESIGN: 'UX Flow/Wireframe → UI Mockup → Design QA độc lập → PM/PO phê duyệt (design.md).',
  PM: 'Xác định mục tiêu, phạm vi & tiêu chí nghiệm thu của tính năng → PM phê duyệt.',
  DEV: 'Backend Developer (DB/API) & Frontend Developer (UI) lập trình theo đặc tả đã duyệt.',
  TEST: 'Quality Gate: Chạy CI, kiểm thử đơn vị và bộ kiểm thử tự động Playwright độc lập.',
};

const same = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => x.step === b[i]?.step && x.mode === b[i]?.mode);
};

function ApproverConfig({ stepName, stepState, disabled, members, users, onChange }) {
  const curRole = stepState?.approverRole || defaultApproverRole(stepName);
  const curApproverId = stepState?.approverId || '';

  const eligibleMembers = members.filter(m =>
    m.roles?.includes(curRole) || m.roles?.includes('OWNER') || m.roles?.includes('MAINTAINER')
  );

  const who = curApproverId
    ? `Chỉ ${users[curApproverId]?.name || users[curApproverId]?.email || curApproverId} duyệt bước này.`
    : `Ai có vai trò ${curRole} trong dự án đều duyệt được (Owner duyệt thay khi chưa có ai giữ vai trò này).`;
  return (
    <div className="wf-approver-inline" title={who}>
      <span className="wf-approver-label" id={`appr-${stepName}`}><UserCheck size={13} aria-hidden="true" /> Người duyệt</span>
      <select className="wf-select" aria-labelledby={`appr-${stepName}`} aria-label={`Vai trò duyệt bước ${stepName}`}
        disabled={disabled} value={curRole} onChange={e => onChange(stepName, { approverRole: e.target.value })}>
        {APPROVER_ROLE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
      </select>
      {eligibleMembers.length > 0 && (
        <select className="wf-select" aria-label={`Người duyệt cụ thể cho bước ${stepName}`} disabled={disabled}
          value={curApproverId} onChange={e => onChange(stepName, { approverId: e.target.value || null })}>
          <option value="">Bất kỳ ai có vai trò này</option>
          {eligibleMembers.map(m => {
            const u = users[m.userId];
            return <option key={m.userId} value={m.userId}>{u?.name || u?.email || m.userId}</option>;
          })}
        </select>
      )}
    </div>
  );
}

/**
 * The project's feature workflow: presets, detailed 11-step view, and 6-phase order.
 */
export default function WorkflowEditor({ value, onChange, disabled = false, presets = true, pid = null }) {
  const isEnterprisePreset = same(value, WORKFLOW_PRESETS.find(p => p.id === 'enterprise')?.steps);
  const [viewMode, setViewMode] = useState(isEnterprisePreset ? 'detailed' : 'grouped'); // 'detailed' | 'grouped'
  const [drag, setDrag] = useState(null); // { step, startY, base, h, dy }
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState({});
  const listRef = useRef(null);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    platform.members(pid)
      .then(async m => {
        if (cancelled) return;
        setMembers(m);
        const us = await platform.users(m.map(x => x.userId));
        if (cancelled) return;
        setUsers(Object.fromEntries(us.map(u => [u.id, u])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pid]);

  const updateStep = (stepName, patch) => {
    onChange(value.map(x => (x.step === stepName ? { ...x, ...patch } : x)));
  };

  // Sync viewMode when preset changes
  useEffect(() => {
    if (isEnterprisePreset) setViewMode('detailed');
  }, [isEnterprisePreset]);

  const active = value.filter(w => w.mode !== 'SKIP');
  const lastMovable = value.findIndex(w => !MOVABLE.includes(w.step)) - 1;

  const onPointerDown = (e, step, index) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest('.gate-pipeline-card');
    setDrag({ step, startY: e.clientY, base: index, h: row ? row.offsetHeight : 64, dy: 0 });
  };
  const onPointerMove = e => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const target = Math.max(0, Math.min(lastMovable, drag.base + Math.round(dy / drag.h)));
    const cur = value.findIndex(w => w.step === drag.step);
    if (target !== cur) onChange(moveTo(value, drag.step, target));
    setDrag(d => ({ ...d, dy }));
  };
  const onPointerUp = () => setDrag(null);
  const onKeyDown = (e, step, index) => {
    if (disabled) return;
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(moveTo(value, step, index + dir));
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-grip="${step}"]`)?.focus());
  };

  return (
    <>
      {/* Top Pipeline Flow Bar */}
      <div className="wf-flow" aria-label="Quy trình đang chọn">
        {viewMode === 'detailed' ? (
          ENTERPRISE_11_STEPS.map((stepItem, i) => {
            const phaseState = value.find(w => w.step === stepItem.phase);
            const isSkipped = phaseState?.mode === 'SKIP';
            return (
              <React.Fragment key={stepItem.id}>
                {i > 0 && <span className="wf-arrow" aria-hidden="true">→</span>}
                <button
                  type="button"
                  className={`wf-chip${phaseState?.mode === 'AUTO' ? ' auto' : ''}${isSkipped ? ' skipped' : ''}`}
                  title={`Cuộn đến bước ${stepItem.stepNo}: ${stepItem.label}`}
                  onClick={() => {
                    const card = listRef.current?.querySelector(`[data-step="${stepItem.id}"]`);
                    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}>
                  <span className="wf-chip-num">{stepItem.stepNo}.</span>
                  <span>{stepItem.label}</span>
                  {stepItem.type === 'gate' && <span className="wf-chip-mode"> (duyệt)</span>}
                </button>
              </React.Fragment>
            );
          })
        ) : (
          active.map((w, i) => (
            <React.Fragment key={w.step}>
              {i > 0 && <span className="wf-arrow" aria-hidden="true">→</span>}
              <button
                type="button"
                className={`wf-chip${w.mode === 'AUTO' ? ' auto' : ''}`}
                title={`Bấm để cuộn đến bước ${STEP_LABEL[w.step]}`}
                onClick={() => {
                  const card = listRef.current?.querySelector(`[data-step="${w.step}"]`);
                  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}>
                <span>{STEP_LABEL[w.step]}</span>
                {w.mode === 'AUTO' && <span className="wf-chip-mode"> (tự duyệt)</span>}
              </button>
            </React.Fragment>
          ))
        )}
      </div>

      {/* Preset Toolbar & View Mode Switcher */}
      {presets && !disabled && (
        <div className="wf-presets">
          <div className="wf-presets-group">
            <span className="wf-presets-label">Mẫu nhanh</span>
            {WORKFLOW_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                title={p.desc}
                className={`wf-preset${same(value, p.steps) ? ' on' : ''}`}
                onClick={() => {
                  onChange(p.steps);
                  if (p.id === 'enterprise') setViewMode('detailed');
                }}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="wf-view-toggle">
            <button
              type="button"
              className={`wf-vt-btn${viewMode === 'detailed' ? ' on' : ''}`}
              onClick={() => setViewMode('detailed')}
              title="Xem danh sách chi tiết 11 bước">
              <ListOrdered size={13} />
              <span>11 bước chi tiết</span>
            </button>
            <button
              type="button"
              className={`wf-vt-btn${viewMode === 'grouped' ? ' on' : ''}`}
              onClick={() => setViewMode('grouped')}
              title="Xem 6 giai đoạn tổng quan">
              <Layers size={13} />
              <span>6 giai đoạn</span>
            </button>
          </div>
        </div>
      )}

      {/* Pipeline Cards List */}
      <div ref={listRef} className={`gate-pipeline-list${drag ? ' wf-dragging' : ''}`} style={{ border: 'none', borderRadius: 0 }}>
        {viewMode === 'detailed' ? (
          // Detailed 11-step View
          ENTERPRISE_11_STEPS.map(item => {
            const phaseState = value.find(w => w.step === item.phase);
            const isSkipped = phaseState?.mode === 'SKIP';
            return (
              <div
                key={item.id}
                data-step={item.id}
                className={`gate-pipeline-card${isSkipped ? ' wf-skipped' : ''}`}>
                <div className="gate-card-left">
                  <div className="gate-step-index">{item.stepNo}</div>
                  <div className="gate-card-texts">
                    <div className="gate-step-header">
                      <span className="gate-step-name">{item.label}</span>
                      <span className={`gate-role-tag tag-${item.type}`}>{item.roleType}</span>
                    </div>
                    <div className="gate-step-sub">{item.subLabel}</div>
                    <div className="gate-step-desc">{item.desc}</div>
                    {item.type === 'gate' && phaseState?.mode === 'REQUIRED' && (
                      <ApproverConfig stepName={item.phase} stepState={phaseState} disabled={disabled} members={members} users={users} onChange={updateStep} />
                    )}
                  </div>
                </div>
                <div className="gate-card-right">
                  {item.type === 'gate' ? (
                    <div className="wf-mode" role="radiogroup" aria-label={`Chế độ ${item.label}`}>
                      {GATE_MODES.map(g => (
                        <label key={g.id} className={phaseState?.mode === g.id ? 'on' : ''}>
                          <input
                            type="radio"
                            name={`wf-${item.id}`}
                            checked={phaseState?.mode === g.id}
                            disabled={disabled}
                            onChange={() => updateStep(item.phase, { mode: g.id })}
                          />
                          {g.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="gate-auto-badge">
                      {isSkipped ? 'Tạm tắt theo giai đoạn' : 'Tự động chạy theo pipeline'}
                    </span>
                  )}
                </div>

              </div>
            );
          })
        ) : (
          // Grouped 6-phase View
          value.map((w, idx) => {
            const movable = MOVABLE.includes(w.step);
            const dragging = drag?.step === w.step;
            const offset = dragging ? drag.dy - (idx - drag.base) * drag.h : 0;
            return (
              <div
                key={w.step}
                data-step={w.step}
                className={`gate-pipeline-card${w.mode === 'SKIP' ? ' wf-skipped' : ''}${dragging ? ' wf-lifted' : ''}`}
                style={dragging ? { transform: `translateY(${offset}px)` } : undefined}>
                <div className="gate-card-left">
                  {movable && !disabled ? (
                    <div className="wf-order-controls">
                      <button
                        type="button"
                        className="wf-grip"
                        data-grip={w.step}
                        disabled={disabled}
                        aria-label={`Kéo để đổi thứ tự bước ${STEP_LABEL[w.step]} (hoặc phím ↑ ↓)`}
                        title="Kéo thả hoặc dùng phím ↑ ↓ để đổi thứ tự"
                        onPointerDown={e => onPointerDown(e, w.step, idx)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onKeyDown={e => onKeyDown(e, w.step, idx)}>
                        <GripVertical size={16} aria-hidden="true" />
                      </button>
                      <div className="wf-order-arrows">
                        <button
                          type="button"
                          className="wf-arrow-btn"
                          disabled={idx === 0}
                          title={`Chuyển bước ${STEP_LABEL[w.step]} lên trước`}
                          aria-label={`Chuyển bước ${STEP_LABEL[w.step]} lên trước`}
                          onClick={() => onChange(moveStep(value, w.step, -1))}>
                          <ChevronUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="wf-arrow-btn"
                          disabled={idx >= lastMovable}
                          title={`Chuyển bước ${STEP_LABEL[w.step]} xuống sau`}
                          aria-label={`Chuyển bước ${STEP_LABEL[w.step]} xuống sau`}
                          onClick={() => onChange(moveStep(value, w.step, 1))}>
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="wf-grip wf-locked" title="Code và Test luôn ở cuối quy trình">
                      <Lock size={14} aria-hidden="true" />
                    </span>
                  )}
                  <div className="gate-step-index">{idx + 1}</div>
                  <div className="gate-card-texts">
                    <div className="gate-step-header">
                      <span className="gate-step-name">{STEP_LABEL[w.step]}</span>
                    </div>
                    <div className="gate-step-desc">{STEP_DESCRIPTIONS[w.step]}</div>
                    {w.mode === 'REQUIRED' && (
                      <ApproverConfig stepName={w.step} stepState={w} disabled={disabled} members={members} users={users} onChange={updateStep} />
                    )}
                  </div>
                </div>
                <div className="gate-card-right">
                  <div className="wf-mode" role="radiogroup" aria-label={`Chế độ bước ${STEP_LABEL[w.step]}`}>
                    {GATE_MODES.filter(g => !(w.step === 'DEV' && g.id === 'SKIP')).map(g => (
                      <label key={g.id} className={w.mode === g.id ? 'on' : ''}>
                        <input
                          type="radio"
                          name={`wf-${w.step}`}
                          checked={w.mode === g.id}
                          disabled={disabled}
                          onChange={() => updateStep(w.step, { mode: g.id })}
                        />
                        {g.label}
                      </label>
                    ))}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
    </>
  );
}

