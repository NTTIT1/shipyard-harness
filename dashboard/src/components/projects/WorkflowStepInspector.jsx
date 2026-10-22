import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Save, Cpu, UserCheck, ShieldCheck, Tag, Plus, X, Layers } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { APPROVER_ROLE_OPTIONS, defaultApproverRole } from '../../lib/review.js';

export const AVAILABLE_MODELS = [
  { id: 'claude:claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (Anthropic)', desc: 'Mạnh mẽ nhất về code và logic đặc tả' },
  { id: 'claude:claude-opus-5-5', name: 'Claude 3 Opus (Anthropic)', desc: 'Tư duy sâu cho kiến trúc hệ thống và giải pháp' },
  { id: 'claude:claude-3-5-haiku', name: 'Claude 3.5 Haiku (Anthropic)', desc: 'Rất nhanh và tiết kiệm chi phí, tối ưu cho QA' },
  { id: 'openai:gpt-4o', name: 'GPT-4o (OpenAI)', desc: 'Đa phương thức và xử lý tổng quát' },
  { id: 'openai:gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)', desc: 'Nhỏ gọn, nhanh cho các bước phụ trợ' },
  { id: 'google:gemini-1.5-pro', name: 'Gemini 1.5 Pro (Google)', desc: 'Context window cực lớn cho tài liệu dày' },
  { id: 'deepseek:deepseek-chat', name: 'DeepSeek V3 (DeepSeek)', desc: 'Chi phí cực thấp, hiệu năng lập trình cao' },
];

const PRESET_INPUTS = [
  'Đặc tả được duyệt',
  'Context manifest',
  'API Contract',
  'Mockup spec',
  'Test report',
  'DB Migration spec',
  'Wireframe flow',
];

export default function WorkflowStepInspector({
  step,
  stepIndex,
  totalSteps,
  members = [],
  users = {},
  disabled = false,
  onUpdateStep,
  onMoveStep,
}) {
  const [form, setForm] = useState(() => ({
    label: step.label || '',
    subLabel: step.subLabel || '',
    type: step.type || 'agent',
    model: step.model || 'claude:claude-3-5-sonnet',
    profile: step.profile || step.label || '',
    approverRole: step.approverRole || defaultApproverRole(step.phase),
    approverId: step.approverId || '',
    maxRetries: step.maxRetries ?? 2,
    timeoutMinutes: step.timeoutMinutes ?? 30,
    budgetVnd: step.budgetVnd ?? 500000,
    dep: step.dep || (stepIndex === 0 ? 'Không · bước bắt đầu từ 0' : `${stepIndex} · bước bắt đầu từ 0`),
    parallelGroup: step.parallelGroup || '',
    condition: step.condition || 'ALWAYS',
    onFailure: step.onFailure || 'ESCALATE_HUMAN',
    requiredInputs: step.requiredInputs || ['Đặc tả được duyệt', 'Context manifest'],
  }));

  const [customInputTag, setCustomInputTag] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  // Sync form state when active step changes
  useEffect(() => {
    setForm({
      label: step.label || '',
      subLabel: step.subLabel || '',
      type: step.type || 'agent',
      model: step.model || 'claude:claude-3-5-sonnet',
      profile: step.profile || step.label || '',
      approverRole: step.approverRole || defaultApproverRole(step.phase),
      approverId: step.approverId || '',
      maxRetries: step.maxRetries ?? 2,
      timeoutMinutes: step.timeoutMinutes ?? 30,
      budgetVnd: step.budgetVnd ?? 500000,
      dep: step.dep || (stepIndex === 0 ? 'Không · bước bắt đầu từ 0' : `${stepIndex} · bước bắt đầu từ 0`),
      parallelGroup: step.parallelGroup || '',
      condition: step.condition || 'ALWAYS',
      onFailure: step.onFailure || 'ESCALATE_HUMAN',
      requiredInputs: step.requiredInputs || ['Đặc tả được duyệt', 'Context manifest'],
    });
    setSavedNotice('');
  }, [step.id, stepIndex]);

  const handleChange = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }));
    setSavedNotice('');
  };

  const handleSave = e => {
    e?.preventDefault();
    onUpdateStep(step.id, form);
    setSavedNotice('Đã lưu cấu hình bước!');
    setTimeout(() => setSavedNotice(''), 3000);
  };

  const toggleTag = tag => {
    setForm(prev => {
      const exists = prev.requiredInputs.includes(tag);
      return {
        ...prev,
        requiredInputs: exists
          ? prev.requiredInputs.filter(t => t !== tag)
          : [...prev.requiredInputs, tag],
      };
    });
  };

  const addCustomTag = e => {
    e.preventDefault();
    const t = customInputTag.trim();
    if (t && !form.requiredInputs.includes(t)) {
      setForm(prev => ({ ...prev, requiredInputs: [...prev.requiredInputs, t] }));
      setCustomInputTag('');
    }
  };

  const eligibleMembers = members.filter(m =>
    m.roles?.includes(form.approverRole) || m.roles?.includes('OWNER') || m.roles?.includes('MAINTAINER')
  );

  return (
    <div className="wf-inspector-card">
      <div className="wf-inspector-header">
        <div className="wf-inspector-title-wrap">
          <h3 className="wf-inspector-title">
            Thiết lập bước {stepIndex + 1}
          </h3>
          <span className="wf-inspector-phase-tag">
            {step.phase} · {step.id}
          </span>
        </div>
        {savedNotice && <span className="wf-inspector-saved-pill" role="status">{savedNotice}</span>}
      </div>

      <form className="wf-inspector-form" onSubmit={handleSave}>
        {/* Tên bước */}
        <div className="wf-form-group">
          <label className="wf-form-label" htmlFor="inp-step-name">
            Tên bước <span className="req-star">*</span>
          </label>
          <input
            id="inp-step-name"
            type="text"
            className="wf-form-input"
            disabled={disabled}
            value={form.label}
            onChange={e => handleChange('label', e.target.value)}
            placeholder="Ví dụ: Business Analyst, Solution Architect..."
          />
        </div>

        {/* Loại xử lý */}
        <div className="wf-form-group">
          <label className="wf-form-label" htmlFor="sel-step-type">
            Loại xử lý
          </label>
          <select
            id="sel-step-type"
            className="wf-form-select"
            disabled={disabled}
            value={form.type}
            onChange={e => handleChange('type', e.target.value)}>
            <option value="agent">Agent (AI tự động xử lý)</option>
            <option value="gate">Con người phê duyệt (Gate)</option>
            <option value="qa">Kiểm tra độc lập / Quality Gate</option>
          </select>
        </div>

        {/* Cấu hình Agent (Model AI & Profile) hoặc Gate (Vai trò duyệt & Người phụ trách) */}
        {form.type === 'agent' ? (
          <div className="wf-form-grid-2">
            <div className="wf-form-group">
              <label className="wf-form-label" htmlFor="sel-model-ai">
                Model AI chỉ định <span className="req-star">*</span>
              </label>
              <select
                id="sel-model-ai"
                className="wf-form-select"
                disabled={disabled}
                value={form.model}
                onChange={e => handleChange('model', e.target.value)}>
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.id} value={m.id} title={m.desc}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="wf-form-group">
              <label className="wf-form-label" htmlFor="inp-agent-profile">
                Agent profile / Persona <span className="req-star">*</span>
              </label>
              <input
                id="inp-agent-profile"
                type="text"
                className="wf-form-input"
                disabled={disabled}
                value={form.profile}
                onChange={e => handleChange('profile', e.target.value)}
                placeholder="Ví dụ: Business Analyst..."
              />
            </div>
          </div>
        ) : (
          <div className="wf-form-grid-2">
            <div className="wf-form-group">
              <label className="wf-form-label" htmlFor="sel-approver-role">
                Vai trò phê duyệt <span className="req-star">*</span>
              </label>
              <select
                id="sel-approver-role"
                className="wf-form-select"
                disabled={disabled}
                value={form.approverRole}
                onChange={e => handleChange('approverRole', e.target.value)}>
                {APPROVER_ROLE_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="wf-form-group">
              <label className="wf-form-label" htmlFor="sel-approver-user">
                Người phụ trách / Chỉ định
              </label>
              <select
                id="sel-approver-user"
                className="wf-form-select"
                disabled={disabled || eligibleMembers.length === 0}
                value={form.approverId}
                onChange={e => handleChange('approverId', e.target.value)}>
                <option value="">Bất kỳ ai có vai trò {form.approverRole}</option>
                {eligibleMembers.map(m => {
                  const u = users[m.userId];
                  const name = u?.name || u?.email || m.userId;
                  return (
                    <option key={m.userId} value={m.userId}>
                      {name} ({m.roles?.join(', ')})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        {/* Hàng: Vòng thử tối đa & Giới hạn phút */}
        <div className="wf-form-grid-2">
          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="inp-retries">
              Vòng thử tối đa
            </label>
            <input
              id="inp-retries"
              type="number"
              min="1"
              max="10"
              className="wf-form-input tabular-nums"
              disabled={disabled}
              value={form.maxRetries}
              onChange={e => handleChange('maxRetries', parseInt(e.target.value, 10) || 1)}
            />
          </div>

          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="inp-timeout">
              Giới hạn phút
            </label>
            <input
              id="inp-timeout"
              type="number"
              min="5"
              max="240"
              step="5"
              className="wf-form-input tabular-nums"
              disabled={disabled}
              value={form.timeoutMinutes}
              onChange={e => handleChange('timeoutMinutes', parseInt(e.target.value, 10) || 30)}
            />
          </div>
        </div>

        {/* Hàng: Ngân sách VND & Phụ thuộc bước */}
        <div className="wf-form-grid-2">
          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="inp-budget">
              Ngân sách VND
            </label>
            <input
              id="inp-budget"
              type="number"
              step="50000"
              min="0"
              className="wf-form-input tabular-nums"
              disabled={disabled}
              value={form.budgetVnd}
              onChange={e => handleChange('budgetVnd', parseInt(e.target.value, 10) || 0)}
            />
          </div>

          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="inp-deps">
              Phụ thuộc bước (chỉ số, cách nhau dấu phẩy)
            </label>
            <input
              id="inp-deps"
              type="text"
              className="wf-form-input"
              disabled={disabled}
              value={form.dep}
              onChange={e => handleChange('dep', e.target.value)}
              placeholder="Ví dụ: 0, 1 hoặc Không"
            />
          </div>
        </div>

        {/* Nhóm chạy song song */}
        <div className="wf-form-group">
          <label className="wf-form-label" htmlFor="inp-parallel">
            Nhóm chạy song song (tùy chọn)
          </label>
          <input
            id="inp-parallel"
            type="text"
            className="wf-form-input"
            disabled={disabled}
            value={form.parallelGroup}
            onChange={e => handleChange('parallelGroup', e.target.value)}
            placeholder="Ví dụ: parallel-dev, parallel-qa..."
          />
        </div>

        {/* Hàng: Điều kiện & Khi không đạt */}
        <div className="wf-form-grid-2">
          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="sel-condition">
              Điều kiện
            </label>
            <select
              id="sel-condition"
              className="wf-form-select"
              disabled={disabled}
              value={form.condition}
              onChange={e => handleChange('condition', e.target.value)}>
              <option value="ALWAYS">Luôn chạy</option>
              <option value="HAS_UI">Khi có giao diện (has_ui = true)</option>
              <option value="PREV_PASSED">Khi bước trước đạt chuẩn</option>
            </select>
          </div>

          <div className="wf-form-group">
            <label className="wf-form-label" htmlFor="sel-on-fail">
              Khi không đạt
            </label>
            <select
              id="sel-on-fail"
              className="wf-form-select"
              disabled={disabled}
              value={form.onFailure}
              onChange={e => handleChange('onFailure', e.target.value)}>
              <option value="ESCALATE_HUMAN">Chuyển con người</option>
              <option value="RETRY">Tự thử lại theo vòng thử</option>
              <option value="FAIL_RUN">Dừng quy trình</option>
            </select>
          </div>
        </div>

        {/* Đầu vào bắt buộc (Tags) */}
        <div className="wf-form-group">
          <label className="wf-form-label">
            Đầu vào bắt buộc
          </label>
          <div className="wf-tags-selector">
            {PRESET_INPUTS.map(tag => {
              const active = form.requiredInputs.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`wf-tag-pill${active ? ' on' : ''}`}
                  disabled={disabled}
                  onClick={() => toggleTag(tag)}>
                  {active && <span className="wf-tag-check">✓</span>}
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
          {/* Custom tag add input */}
          <div className="wf-custom-tag-row">
            <input
              type="text"
              className="wf-form-input sm"
              placeholder="+ Thêm đầu vào tùy chỉnh..."
              value={customInputTag}
              disabled={disabled}
              onChange={e => setCustomInputTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTag(e); }}
            />
            <Button size="sm" disabled={disabled || !customInputTag.trim()} onClick={addCustomTag}>
              Thêm
            </Button>
          </div>
        </div>

        {/* Action Buttons & Note */}
        <div className="wf-inspector-actions">
          <div className="wf-inspector-btn-row">
            <Button variant="primary" icon={Save} disabled={disabled} onClick={handleSave}>
              Lưu cấu hình
            </Button>
            <Button
              size="sm"
              icon={ArrowUp}
              disabled={disabled || stepIndex <= 0}
              onClick={() => onMoveStep(step.id, -1)}>
              Di chuyển lên
            </Button>
            <Button
              size="sm"
              icon={ArrowDown}
              disabled={disabled || stepIndex >= totalSteps - 1}
              onClick={() => onMoveStep(step.id, 1)}>
              Di chuyển xuống
            </Button>
          </div>
          <p className="wf-inspector-footnote">
            Thay đổi chỉ áp dụng bản nháp: run đã bắt đầu giữ snapshot.
          </p>
        </div>
      </form>
    </div>
  );
}
