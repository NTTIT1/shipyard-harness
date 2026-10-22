import { describe, it, expect } from 'vitest';
import { configSummary, cleanConfig, configProblem, suggestedConfigs, workflowModels, modelLabel } from '../src/lib/workflow.js';
import { workflowProblem, WORKFLOW_PRESETS } from '../src/lib/review.js';
import { validateWorkflow } from '../server/services/scaffold/catalog.js';

const full = WORKFLOW_PRESETS.find(p => p.id === 'full').steps;

describe('per-step workflow settings', () => {
  it('summarises what a step is limited by', () => {
    expect(configSummary({})).toBe('');
    expect(configSummary({ timeoutMinutes: 45, onFailure: 'RETRY', maxRetries: 2, budgetVnd: 500000, condition: 'HAS_UI', requiredInputs: ['spec.md'] }))
      .toBe('45 phút · thử lại 2 lần · trần 500.000 ₫ · khi có giao diện · 1 đầu vào');
    expect(modelLabel({ model: 'claude:claude-opus-5-5' })).toBe('claude-opus-5-5');
    expect(modelLabel({})).toBe('model mặc định');
  });
  it('cleans what the server would store (bounds, defaults dropped, bad paths out)', () => {
    expect(cleanConfig('ARCH', { model: '', maxRetries: 9, timeoutMinutes: '45', condition: 'ALWAYS', onFailure: 'ESCALATE_HUMAN',
      requiredInputs: ['spec.md', 'spec.md', '../x', '/etc/passwd'] }))
      .toEqual({ maxRetries: 5, timeoutMinutes: 45, requiredInputs: ['spec.md'] });
    expect(cleanConfig('DEV', { condition: 'HAS_UI' })).toEqual({});
  });
  it('blocks saving a workflow the server would refuse', () => {
    expect(configProblem('TEST', { maxRetries: 7 })).toMatch(/0 đến 5/);
    expect(configProblem('ARCH', { requiredInputs: ['../secrets.env'] })).toMatch(/không hợp lệ/);
    expect(configProblem('DEV', { condition: 'PREV_PASSED' })).toMatch(/luôn chạy/);
    expect(workflowProblem(full.map(w => (w.step === 'TEST' ? { ...w, config: { timeoutMinutes: 999 } } : w)))).toMatch(/Kiểm thử: giới hạn/);
    expect(workflowProblem(full)).toBe('');
  });
  it('suggests strong models for analysis, the cheapest for testing', () => {
    const s = suggestedConfigs({ claude_models: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }] });
    expect(s.ARCH.model).toBe('claude:claude-opus-5-5');
    expect(s.TEST.model).toBe('claude:claude-haiku-5-5');
    expect(s.DESIGN.condition).toBe('HAS_UI');
    expect(s.DEV).toEqual({});
  });
  it('turns the workflow into the lane model ids, skipping left-out steps', () => {
    const w = full.map(x => ({ ...x, config: x.step === 'ARCH' ? { model: 'claude:claude-opus-5-5' } : x.step === 'TEST' ? { model: 'deepseek:deepseek-chat' } : {} }));
    w.find(x => x.step === 'TEST').mode = 'SKIP';
    expect(workflowModels(w)).toEqual({ arch: 'claude:claude-opus-5-5' });
  });
  it('the wizard keeps approvers and settings for the orchestrator to validate', () => {
    const w = full.map(x => (x.step === 'ARCH' ? { ...x, approverRole: 'TECH_LEAD', config: { timeoutMinutes: 45 } } : x));
    expect(validateWorkflow(w).find(x => x.step === 'ARCH')).toEqual({ step: 'ARCH', mode: 'REQUIRED', approverRole: 'TECH_LEAD', config: { timeoutMinutes: 45 } });
  });
});
