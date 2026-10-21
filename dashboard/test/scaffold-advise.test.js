// AI advisor of the new-project wizard: requirements → a stack this machine can build, a workflow,
// and the reasons; anything off-catalog is refused, bad options fall back to defaults.
import { describe, it, expect } from 'vitest';
import { catalogForPrompt, advisePrompt, parseAdvice, createAdvisor, PRESET_IDS } from '../server/services/scaffold/advise.js';
import { validateRequest, validateWorkflow } from '../server/services/scaffold/catalog.js';
import { WORKFLOW_PRESETS } from '../src/lib/review.js';
import { applyAdvice } from '../src/lib/scaffold.js';

const ALL = { java: { ok: true, major: 21, version: '21' }, node: { ok: true, major: 22 }, npm: { ok: true, major: 10 },
  git: { ok: true }, uv: { ok: true }, unzip: { ok: true } };
const NO_PY = { ...ALL, uv: { ok: false } };
const block = o => `Đề xuất như sau.\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\`\nROLE-STEP: DONE advice`;
const SALES = { kind: 'fullstack', stack: 'java-spring', options: { db: 'postgresql', docker: true }, frontend: { stack: 'ts-react-vite', options: {} },
  workflow: 'plan-code-test', archFirst: true, summary: 'Spring Boot + React, PostgreSQL', reasons: ['giao dịch ổn định'],
  scale: ['1000 user: một instance + PostgreSQL đủ, thêm index cho đơn hàng'], risks: ['thanh toán online?'] };

describe('advisor', () => {
  it('only offers stacks the machine can build, and the workflow presets the wizard knows', () => {
    const ids = catalogForPrompt(NO_PY).map(s => s.id);
    expect(ids).toContain('java-spring');
    expect(ids).not.toContain('python-fastapi');
    const prompt = advisePrompt('bán hàng 1000 user', catalogForPrompt(ALL));
    expect(prompt).toContain('bán hàng 1000 user');
    for (const id of PRESET_IDS) expect(prompt).toContain(`- ${id}:`);
    expect(PRESET_IDS).toEqual(WORKFLOW_PRESETS.map(p => p.id));
  });
  it('turns the answer into wizard choices', () => {
    const a = parseAdvice(block(SALES), ALL);
    expect(a).toMatchObject({ kind: 'fullstack', language: 'java', stack: 'java-spring', workflow: 'plan-code-test', archFirst: true,
      frontend: { stack: 'ts-react-vite' }, scale: SALES.scale });
    expect(a.options.db).toBe('postgresql');
    // the advice is a valid wizard request once the human keeps it
    expect(() => validateRequest({ name: 'Bán hàng', slug: 'ban-hang', kind: a.kind, stack: a.stack, options: a.options, frontend: a.frontend }, ALL)).not.toThrow();
  });
  it('refuses stacks that are not on this machine; unknown options and workflows fall back', () => {
    expect(() => parseAdvice(block({ ...SALES, kind: 'single', stack: 'python-fastapi' }), NO_PY)).toThrow(/không có trên máy/);
    expect(() => parseAdvice(block({ ...SALES, stack: 'ts-react-vite' }), ALL)).toThrow(/backend/);
    expect(() => parseAdvice('không có json', ALL)).toThrow(/JSON/);
    const a = parseAdvice(block({ ...SALES, options: { db: 'oracle' }, workflow: 'yolo' }), ALL);
    expect(a.workflow).toBe('full');
    expect(a.options.db).not.toBe('oracle');
  });
  it('runs claude without tools in an empty folder and reports its errors', async () => {
    let seen;
    // like util.run: the command line (with the prompt, whose lines start with "{") is logged first
    const run = async (cmd, args, opts) => { seen = { cmd, args, cwd: opts.cwd }; opts.log(`$ ${[cmd, ...args].join(' ')}`); opts.log(JSON.stringify({ type: 'result', is_error: false, result: block(SALES) })); };
    const advise = createAdvisor({ run, tools: () => ALL, claudeBin: '/x/claude' });
    await expect(advise('ngắn')).rejects.toThrow(/10 ký tự/);
    const a = await advise('Hệ thống bán hàng khoảng 1000 user');
    expect(a.stack).toBe('java-spring');
    expect(seen.args).toContain('--disallowedTools');
    expect(seen.args[0]).toBe('-p');
    expect(seen.args[1]).toContain('Hệ thống bán hàng khoảng 1000 user'); // never after the variadic --disallowedTools
    expect(seen.args.join(' ')).toMatch(/Bash,Edit,Write,Read/);
    const bad = createAdvisor({ run: async (c, a2, o) => o.log(JSON.stringify({ is_error: true, result: 'rate limited' })), tools: () => ALL, claudeBin: '/x/claude' });
    await expect(bad('Hệ thống bán hàng khoảng 1000 user')).rejects.toThrow(/rate limited/);
  });
  it('applying the advice pre-fills the wizard', () => {
    const a = parseAdvice(block(SALES), ALL);
    const f = applyAdvice({ name: 'B', requirements: 'x', workflow: WORKFLOW_PRESETS[0].steps }, a, null);
    expect(f).toMatchObject({ kind: 'fullstack', language: 'java', stack: 'java-spring', archFirst: true, requirements: 'x',
      frontend: { stack: 'ts-react-vite' } });
    expect(f.workflow).toEqual(WORKFLOW_PRESETS.find(p => p.id === 'plan-code-test').steps);
  });
});

describe('workflow chosen in the wizard', () => {
  it('validates like the orchestrator', () => {
    const ok = WORKFLOW_PRESETS[1].steps;
    expect(validateWorkflow(ok)).toEqual(ok);
    expect(() => validateWorkflow(ok.slice(1))).toThrow(/6 bước/);
    expect(() => validateWorkflow(ok.map(w => (w.step === 'DEV' ? { ...w, mode: 'SKIP' } : w)))).toThrow(/Code/);
    expect(() => validateWorkflow([...ok.slice(0, 4), ok[5], ok[4]])).toThrow(/Test sau Code/);
    expect(validateRequest({ name: 'K', slug: 'kho-a', stack: 'java-spring', options: {}, workflow: ok }, ALL).workflow).toEqual(ok);
  });
});
