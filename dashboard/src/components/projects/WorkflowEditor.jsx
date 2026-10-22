import React, { useRef, useState, useEffect } from 'react';
import { GripVertical, Lock, ChevronUp, ChevronDown, Layers, ListOrdered, UserCheck, SlidersHorizontal, Plus } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { STEP_LABEL, GATE_MODES, MOVABLE, moveTo, moveStep, WORKFLOW_PRESETS, defaultApproverRole, APPROVER_ROLE_OPTIONS } from '../../lib/review.js';
import { platform } from '../../lib/platform.js';
import WorkflowCanvas from './WorkflowCanvas.jsx';
import WorkflowStepInspector from './WorkflowStepInspector.jsx';

export const ENTERPRISE_11_STEPS = [
  { id: 'step-1', phase: 'BA', stepNo: 1, label: 'Business Analyst', subLabel: 'Đặc tả và làm rõ', dep: 'Không · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-3-5-sonnet', profile: 'Business Analyst', maxRetries: 2, timeoutMinutes: 30, budgetVnd: 500000, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['Yêu cầu tính năng', 'Mục tiêu kinh doanh'], desc: 'Phân tích yêu cầu, bóc tách nghiệp vụ và viết tài liệu đặc tả User Stories (ba.md).' },
  { id: 'step-2', phase: 'BA', stepNo: 2, label: 'BA review đặc tả', subLabel: 'Con người phê duyệt', dep: '1 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', approverRole: 'BA', maxRetries: 1, timeoutMinutes: 60, budgetVnd: 0, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['ba.md'], desc: 'BA Lead hoặc Product Owner kiểm tra, góp ý hoặc duyệt bản đặc tả nghiệp vụ.' },
  { id: 'step-3', phase: 'ARCH', stepNo: 3, label: 'Solution Architect', subLabel: 'Thiết kế giải pháp', dep: '2 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-opus-5-5', profile: 'Solution Architect', maxRetries: 2, timeoutMinutes: 45, budgetVnd: 800000, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['Đặc tả được duyệt', 'Context manifest'], desc: 'Thiết kế giải pháp hệ thống, lược đồ CSDL, chia task và API contract (plan.md).' },
  { id: 'step-4', phase: 'ARCH', stepNo: 4, label: 'Lead review thiết kế', subLabel: 'Con người phê duyệt', dep: '3 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', approverRole: 'TECH_LEAD', maxRetries: 1, timeoutMinutes: 60, budgetVnd: 0, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['plan.md', 'tasks.md'], desc: 'Tech Lead thẩm định thiết kế kỹ thuật, đánh giá rủi ro và phê duyệt kiến trúc.' },
  { id: 'step-5', phase: 'DESIGN', stepNo: 5, label: 'UX Designer', subLabel: 'User flow và wireframe', dep: '4 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-3-5-sonnet', profile: 'UX Designer', maxRetries: 2, timeoutMinutes: 30, budgetVnd: 400000, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['ba.md', 'plan.md'], desc: 'Thiết kế hành trình người dùng (User Journey), luồng tương tác và khung Wireframe (ux-flows.md).' },
  { id: 'step-6', phase: 'DESIGN', stepNo: 6, label: 'UI Designer', subLabel: 'UI responsive và component spec', dep: '5 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-3-5-sonnet', profile: 'UI Designer', maxRetries: 2, timeoutMinutes: 30, budgetVnd: 500000, condition: 'HAS_UI', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['Wireframe flow', 'Design System tokens'], desc: 'Thiết kế giao diện HTML mockup responsive theo chuẩn Design System, render ảnh desktop & mobile.' },
  { id: 'step-7', phase: 'DESIGN', stepNo: 7, label: 'Design QA', subLabel: 'Kiểm tra UI/UX độc lập', dep: '6 · bước bắt đầu từ 0', roleType: 'Kiểm tra độc lập', type: 'qa', model: 'claude:claude-3-5-haiku', profile: 'Design QA', maxRetries: 3, timeoutMinutes: 20, budgetVnd: 200000, condition: 'HAS_UI', onFailure: 'RETRY', requiredInputs: ['Mockup spec', 'HTML mockups'], desc: 'Kiểm tra độc lập chuẩn thiết kế: độ tương phản, khoảng cách lưới 8pt, kích thước chạm ≥44px.' },
  { id: 'step-8', phase: 'DESIGN', stepNo: 8, label: 'Review và phê duyệt UI/UX', subLabel: 'PM / Product Owner duyệt thiết kế', dep: '7 · bước bắt đầu từ 0', roleType: 'Con người phê duyệt', type: 'gate', approverRole: 'PM', maxRetries: 1, timeoutMinutes: 60, budgetVnd: 0, condition: 'HAS_UI', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['Mockup spec', 'Design QA report'], desc: 'PM hoặc Product Owner trực tiếp trải nghiệm mockup và phê duyệt thiết kế trước khi code.' },
  { id: 'step-9', phase: 'DEV', stepNo: 9, label: 'Backend Developer', subLabel: 'Triển khai theo đặc tả', dep: '8 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-3-5-sonnet', profile: 'Backend Developer', maxRetries: 3, timeoutMinutes: 60, budgetVnd: 1000000, condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['API Contract', 'DB Migration spec'], desc: 'Lập trình CSDL, migration, service logic và REST APIs theo đúng kiến trúc đã duyệt.' },
  { id: 'step-10', phase: 'DEV', stepNo: 10, label: 'Frontend Developer', subLabel: 'Phát triển theo UI/UX đã duyệt', dep: '9 · bước bắt đầu từ 0', roleType: 'AI Agent', type: 'agent', model: 'claude:claude-3-5-sonnet', profile: 'Frontend Developer', maxRetries: 3, timeoutMinutes: 60, budgetVnd: 1000000, condition: 'HAS_UI', onFailure: 'ESCALATE_HUMAN', requiredInputs: ['Mockup spec', 'API endpoints'], desc: 'Lập trình giao diện React/Vite, tích hợp API backend theo mockup đã được phê duyệt.' },
  { id: 'step-11', phase: 'TEST', stepNo: 11, label: 'Quality Gate', subLabel: 'CI và bộ quy trình test độc lập', dep: '10 · bước bắt đầu từ 0', roleType: 'Kiểm tra tự động', type: 'qa', model: 'claude:claude-3-5-haiku', profile: 'Quality Gate', maxRetries: 2, timeoutMinutes: 30, budgetVnd: 300000, condition: 'ALWAYS', onFailure: 'FAIL_RUN', requiredInputs: ['Unit tests', 'E2E Playwright tests', 'CI Pipeline'], desc: 'Chạy CI pipeline, kiểm thử đơn vị, kiểm thử tích hợp và E2E Playwright trên trình duyệt.' },
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
 * The project's feature workflow: visual interactive canvas + step inspector, detailed list, and 6-phase order.
 */
export default function WorkflowEditor({ value, onChange, disabled = false, presets = true, pid = null }) {
  const [viewMode, setViewMode] = useState('canvas'); // 'canvas' | 'detailed' | 'grouped'
  const [detailedSteps, setDetailedSteps] = useState(ENTERPRISE_11_STEPS);
  const [activeStepId, setActiveStepId] = useState('step-1');
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

  const phaseStateMap = Object.fromEntries(value.map(w => [w.step, w]));

  const handleUpdateStep = (stepId, form) => {
    setDetailedSteps(prev =>
      prev.map(s => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          ...form,
          roleType: form.type === 'gate' ? 'Con người phê duyệt' : form.type === 'qa' ? 'Kiểm tra độc lập' : 'AI Agent',
        };
      })
    );
    const target = detailedSteps.find(s => s.id === stepId);
    if (target && form.approverRole) {
      updateStep(target.phase, { approverRole: form.approverRole, approverId: form.approverId || null });
    }
  };

  const handleMoveStep = (stepId, direction) => {
    const idx = detailedSteps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= detailedSteps.length) return;
    const copy = [...detailedSteps];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    const updated = copy.map((s, i) => ({ ...s, stepNo: i + 1 }));
    setDetailedSteps(updated);
  };

  const handleAddStep = () => {
    const nextNo = detailedSteps.length + 1;
    const newStep = {
      id: `step-${nextNo}`,
      phase: 'DEV',
      stepNo: nextNo,
      label: `Tác vụ mới ${nextNo}`,
      subLabel: 'Bước bổ sung theo yêu cầu',
      dep: `${nextNo - 1} · bước bắt đầu từ 0`,
      roleType: 'AI Agent',
      type: 'agent',
      model: 'claude:claude-3-5-sonnet',
      profile: 'Developer',
      maxRetries: 2,
      timeoutMinutes: 30,
      budgetVnd: 500000,
      condition: 'ALWAYS',
      onFailure: 'ESCALATE_HUMAN',
      requiredInputs: ['Context manifest'],
      desc: 'Tác vụ mới được bổ sung vào quy trình.',
    };
    setDetailedSteps(prev => [...prev, newStep]);
    setActiveStepId(newStep.id);
  };

  const selectedStep = detailedSteps.find(s => s.id === activeStepId) || detailedSteps[0];
  const selectedIndex = detailedSteps.findIndex(s => s.id === (selectedStep?.id || 'step-1'));

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
    <div className="wf-container">
      {/* Top Header & Action Bar */}
      <div className="wf-top-bar">
        <div className="wf-top-left">
          <span className="wf-version-pill">v1.3 · Bản nháp</span>
          <span className="wf-main-title">Quy trình phát triển tính năng</span>
        </div>
        <div className="wf-top-actions">
          {!disabled && (
            <Button size="sm" icon={Plus} onClick={handleAddStep}>
              Thêm bước
            </Button>
          )}
          <div className="wf-view-toggle">
            <button
              type="button"
              className={`wf-vt-btn${viewMode === 'canvas' ? ' on' : ''}`}
              onClick={() => setViewMode('canvas')}
              title="Sơ đồ Canvas & Thiết lập bước">
              <SlidersHorizontal size={13} />
              <span>Canvas trực quan</span>
            </button>
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
      </div>

      {/* Preset Toolbar */}
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
                  if (p.id === 'enterprise') setViewMode('canvas');
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main View Area */}
      {viewMode === 'canvas' ? (
        <div className="wf-two-col-layout">
          <WorkflowCanvas
            steps={detailedSteps}
            selectedStepId={activeStepId}
            onSelectStep={setActiveStepId}
            phaseStateMap={phaseStateMap}
            disabled={disabled}
            onAddStep={handleAddStep}
          />

          {selectedStep && (
            <WorkflowStepInspector
              step={selectedStep}
              stepIndex={selectedIndex >= 0 ? selectedIndex : 0}
              totalSteps={detailedSteps.length}
              members={members}
              users={users}
              disabled={disabled}
              onUpdateStep={handleUpdateStep}
              onMoveStep={handleMoveStep}
            />
          )}
        </div>
      ) : viewMode === 'detailed' ? (
        <div ref={listRef} className="gate-pipeline-list" style={{ border: 'none', borderRadius: 0 }}>
          {detailedSteps.map(item => {
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
          })}
        </div>
      ) : (
        <div ref={listRef} className={`gate-pipeline-list${drag ? ' wf-dragging' : ''}`} style={{ border: 'none', borderRadius: 0 }}>
          {value.map((w, idx) => {
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
                        aria-label={`Kéo để đổi thứ tự bước ${STEP_LABEL[w.step]}`}
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
                          onClick={() => onChange(moveStep(value, w.step, -1))}>
                          <ChevronUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="wf-arrow-btn"
                          disabled={idx >= lastMovable}
                          title={`Chuyển bước ${STEP_LABEL[w.step]} xuống sau`}
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
          })}
        </div>
      )}
    </div>
  );
}
