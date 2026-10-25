// The Claude + Gemini split: Claude drives, codes, plans and gates; Gemini writes and reviews.
import { describe, it, expect } from 'vitest';
import { claudeGeminiModels, claudeGeminiStudio, geminiModel, SPLIT } from '../src/lib/modelPresets.js';
import { suggestedConfigs } from '../src/lib/workflow.js';

const info = g => ({ claude_models: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }],
  providers: { gemini: { configured: true, models: g } } });

describe('Claude + Gemini split', () => {
  it('picks a Gemini model that works through the gateway', () => {
    expect(geminiModel(info(['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']))).toBe('gemini:gemini-3.5-flash');
    expect(geminiModel(info(['gemini-2.5-flash']))).toBe('gemini:gemini-2.5-flash');
    expect(geminiModel(info([]))).toBe('');
    expect(claudeGeminiModels(info([]))).toBe(null);
  });
  it('Claude drives and codes, Gemini writes and gives the second opinion', () => {
    const m = claudeGeminiModels(info(['gemini-3.5-flash']), { impl_agents: 2 });
    expect(m).toMatchObject({ main: 'claude:claude-sonnet-5-5', dev: 'claude:claude-sonnet-5-5', arch: 'claude:claude-sonnet-5-5',
      'senior-gate': 'claude:claude-sonnet-5-5', pm: 'gemini:gemini-3.5-flash', 'code-review': 'gemini:gemini-3.5-flash',
      'plan-critic': 'gemini:gemini-3.5-flash', impl_agents: 2 });
    expect(Object.keys(SPLIT)).toHaveLength(14);
    expect(claudeGeminiStudio(info(['gemini-3.5-flash']))).toEqual({ pm: 'gemini:gemini-3.5-flash', arch: 'claude:claude-sonnet-5-5', design: 'gemini:gemini-3.5-flash' });
  });
  it('the project workflow suggestion follows the split when Gemini is set up', () => {
    const s = suggestedConfigs(info(['gemini-3.5-flash']));
    expect(s.PM.model).toBe('gemini:gemini-3.5-flash');
    expect(s.ARCH.model).toBe('claude:claude-sonnet-5-5');
    expect(s.TEST.model).toBe('gemini:gemini-3.5-flash');
    expect(suggestedConfigs(info([])).PM.model).toBe('claude:claude-opus-5-5');   // no Gemini: as before
  });
});
