import React from 'react';
import { Bot, Users, ShieldCheck, Sparkles, Plus, Check } from 'lucide-react';

export default function WorkflowCanvas({
  steps = [],
  selectedStepId,
  onSelectStep,
  phaseStateMap = {},
  disabled = false,
  onAddStep,
}) {
  return (
    <div className="wf-canvas-container" aria-label="Sơ đồ quy trình trực quan">
      {/* Dot Grid Flow Area */}
      <div className="wf-canvas-grid">
        {/* Spine Connector Line */}
        <div className="wf-canvas-spine" aria-hidden="true" />

        {/* Start Trigger Node */}
        <div className="wf-canvas-start-badge">
          <Sparkles size={13} className="wf-start-icon" />
          <span>YÊU CẦU SẴN SÀNG</span>
        </div>

        {/* Step Nodes List */}
        <div className="wf-nodes-list" role="list">
          {steps.map((item, idx) => {
            const isSelected = item.id === selectedStepId;
            const phaseState = phaseStateMap[item.phase];
            const isSkipped = phaseState?.mode === 'SKIP';
            const isAuto = phaseState?.mode === 'AUTO';

            const getIcon = () => {
              if (item.type === 'gate') return <Users size={16} />;
              if (item.type === 'qa') return <ShieldCheck size={16} />;
              return <Bot size={16} />;
            };

            const getBorderAccent = () => {
              if (item.type === 'gate') return 'var(--warn)';
              if (item.type === 'qa') return 'var(--ok)';
              return 'var(--accent)';
            };

            return (
              <div key={item.id} className="wf-node-wrapper">
                <button
                  type="button"
                  role="listitem"
                  aria-selected={isSelected}
                  disabled={disabled}
                  className={`wf-node-card${isSelected ? ' active' : ''}${isSkipped ? ' skipped' : ''}`}
                  onClick={() => onSelectStep(item.id)}
                  style={{
                    '--node-accent': getBorderAccent(),
                  }}>
                  <div className="wf-node-left">
                    <div className={`wf-node-icon-box type-${item.type}`}>
                      {getIcon()}
                    </div>
                    <div className="wf-node-content">
                      <div className="wf-node-title-row">
                        <strong className="wf-node-title">{item.label}</strong>
                        {isSelected && <span className="wf-node-active-pill">Đang chọn</span>}
                      </div>
                      <div className="wf-node-subtitle">{item.subLabel}</div>
                      <div className="wf-node-dep-text">Phụ thuộc: {item.dep}</div>
                    </div>
                  </div>

                  <div className="wf-node-badges">
                    <span className={`wf-node-type-badge tag-${item.type}`}>
                      {item.roleType || (item.type === 'gate' ? 'Con người phê duyệt' : 'AI Agent')}
                    </span>
                    {item.model && item.type === 'agent' && (
                      <span className="wf-node-model-chip" title={`Model: ${item.model}`}>
                        {item.model.split(':')[1] || item.model}
                      </span>
                    )}
                    {isAuto && <span className="wf-node-mode-chip auto">Tự duyệt</span>}
                    {isSkipped && <span className="wf-node-mode-chip skip">Tạm tắt</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Add Step Action at Canvas Bottom */}
        {!disabled && onAddStep && (
          <div className="wf-canvas-bottom-action">
            <button
              type="button"
              className="wf-canvas-add-btn"
              onClick={onAddStep}
              title="Thêm bước mới vào quy trình">
              <Plus size={14} />
              <span>Thêm bước tiếp theo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
