// Product studio: idea → AI PM (brief) → AI architect (stack + architecture) → AI designer (mockups)
// → project generated with the approved documents. Fake `claude`, real files.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createStudio, roadmap, turnPrompt, normalizeWorkflow, workflowGuide } from '../server/services/scaffold/studio.js';

const ALL = { java: { ok: true, major: 21, version: '21' }, node: { ok: true, major: 22 }, npm: { ok: true, major: 10 },
  git: { ok: true }, uv: { ok: true }, unzip: { ok: true } };
const ARCH = `# Kiến trúc\n\n## Tổng quan\nBán hàng.\n\n## Lộ trình tính năng\n1. **Đăng nhập & phân quyền** — tài khoản theo vai trò\n2. **Sản phẩm** — danh mục, giá\n- Đơn hàng tại quầy\n\n## Quyết định\n- Spring`;
const STACK = { kind: 'fullstack', stack: 'java-spring', options: { db: 'postgresql' }, frontend: { stack: 'ts-react-vite', options: {} },
  workflow: 'plan-code-test', hasUi: true, summary: 'Spring + React', reasons: ['ổn định'], scale: ['1000 user'], risks: [] };

/** "claude": the agent is known from --append-system-prompt (agentPrompt returns the agent name). */
function fakeClaude(calls, { hasUi = true, fail = null } = {}) {
  return async (cmd, args, opts) => {
    const agent = args[args.indexOf('--append-system-prompt') + 1];
    calls.push({ agent, prompt: args[1], cwd: opts.cwd });
    if (fail === agent) { opts.log(JSON.stringify({ is_error: true, result: 'quota exceeded' })); return; }
    const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(opts.cwd, f)), { recursive: true }); fs.writeFileSync(path.join(opts.cwd, f), t); };
    let reply = 'Bạn dùng cho bao nhiêu cửa hàng?';
    if (agent === 'studio-pm-agent' && /5 cửa hàng/.test(args[1])) { w('product-brief.md', '# Bán hàng 5 cửa hàng\n\n## Tóm tắt\nPOS.'); reply = 'Mình đã viết bản yêu cầu.'; }
    if (agent === 'studio-architect-agent') { w('stack.json', JSON.stringify({ ...STACK, hasUi })); w('architecture.md', ARCH); reply = 'Đề xuất Spring + React.'; }
    if (agent === 'studio-workflow-agent' && /Haiku/.test(args[1])) {
      const wf = JSON.parse(fs.readFileSync(path.join(opts.cwd, 'workflow.json'), 'utf8'));
      wf.find(x => x.step === 'TEST').config = { model: 'claude:claude-haiku-5-5', timeoutMinutes: 30, onFailure: 'RETRY', maxRetries: 2 };
      w('workflow.json', JSON.stringify(wf)); reply = 'Test dùng Haiku, 30 phút.';
    }
    if (agent === 'studio-designer-agent') { w('design.md', '# Giao diện'); w('mockups/01-dang-nhap.html', '<html><body>Đăng nhập</body></html>'); reply = 'Đã vẽ 1 màn hình.'; }
    opts.log(`$ ${cmd} ${args.join(' ')}`);
    opts.log(JSON.stringify({ type: 'result', is_error: false, result: `${reply}\nROLE-STEP: DONE chat` }));
  };
}

let root;
const me = { id: 'u1', email: 'a@x.io', name: 'A' };
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const until = async fn => { const t = Date.now(); while (!fn()) { if (Date.now() - t > 3000) throw new Error('timeout'); await new Promise(r => setTimeout(r, 15)); } };
const claudeRoute = async () => ({ model: 'claude-opus-5-5', env: null, gateway: false });
const make = (calls, opts = {}, jobs = null, route = claudeRoute) => createStudio({ root: () => root, run: fakeClaude(calls, opts), tools: () => ALL, route,
  claudeBin: '/x/claude', agentPrompt: n => n, jobs });

describe('studio', () => {
  it('walks idea → brief → system → UI → project, approved in the chat', async () => {
    const calls = [];
    const started = [];
    const jobs = { start: (spec, user, token) => { started.push({ spec, user, token }); return { id: 'scf_1' }; },
      get: () => ({ id: 'scf_1', status: 'running', stages: {}, stageList: [], project: { id: 'proj_9' } }) };
    const st = make(calls, {}, jobs);
    let s = st.start(me, 'Tôi cần hệ thống bán hàng');
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(s.messages.map(m => m.role)).toEqual(['user', 'ai']);
    expect(s.messages[1].text).toContain('bao nhiêu cửa hàng');
    expect(() => st.approve(s.id, me, 'pm')).toThrow(/chưa viết/);

    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    expect(calls[1].prompt).toContain('[Người dùng]: Tôi cần hệ thống bán hàng');   // the history goes along
    expect(calls[1].prompt).toContain('Chuỗi 5 cửa hàng');
    s = st.approve(s.id, me, 'pm');
    expect(s.title).toBe('Bán hàng 5 cửa hàng');
    expect(s.stage).toBe('system');
    await until(() => !st.isBusy(s.id));
    expect(calls[2].agent).toBe('studio-architect-agent');
    expect(JSON.parse(fs.readFileSync(path.join(calls[2].cwd, 'stacks.json'), 'utf8')).map(x => x.id)).toContain('java-spring');
    s = st.get(s.id, me);
    expect(s.docs.advice).toMatchObject({ stack: 'java-spring', workflow: 'plan-code-test', hasUi: true });
    expect(s.roadmap.map(r => r.title)).toEqual(['Đăng nhập & phân quyền', 'Sản phẩm', 'Đơn hàng tại quầy']);

    s = st.approve(s.id, me, 'system');
    expect(s.stage).toBe('ui');
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(s.docs.mockups.map(m => m.name)).toEqual(['01-dang-nhap.html']);
    s = st.approve(s.id, me, 'ui');
    expect(s.stage).toBe('create');
    expect(s.messages.at(-1).text).toContain('Bước cuối');
    // The advised preset is the starting workflow; the chat at "Tạo dự án" changes it in workflow.json.
    expect(s.docs.workflow.map(w => `${w.step}:${w.mode}`)).toEqual(['ARCH:REQUIRED', 'PM:SKIP', 'BA:SKIP', 'DESIGN:SKIP', 'DEV:AUTO', 'TEST:AUTO']);
    st.send(s.id, me, 'Bước Test dùng Haiku, tối đa 30 phút, lỗi thì thử lại 2 lần');
    await until(() => !st.isBusy(s.id));
    expect(calls.at(-1).agent).toBe('studio-workflow-agent');
    expect(fs.readFileSync(path.join(calls.at(-1).cwd, 'workflow-guide.md'), 'utf8')).toContain('claude:claude-haiku-5-5');
    s = st.get(s.id, me);
    expect(s.docs.workflowSaved).toBe(true);
    expect(s.docs.workflow.find(w => w.step === 'TEST').config).toEqual({ model: 'claude:claude-haiku-5-5', timeoutMinutes: 30, onFailure: 'RETRY', maxRetries: 2 });
    // …and by hand: the ARCH step gets a minute limit (bad values are bounded, unknown keys dropped)
    const hand = s.docs.workflow.map(w => (w.step === 'ARCH' ? { ...w, config: { timeoutMinutes: 9999, junk: 1 } } : w));
    s = st.setWorkflow(s.id, me, hand);
    expect(s.docs.workflow.find(w => w.step === 'ARCH').config).toEqual({ timeoutMinutes: 480 });
    expect(() => st.setWorkflow(s.id, me, hand.filter(w => w.step !== 'DEV'))).toThrow(/đủ 6 bước/);

    s = st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang', git: { provider: 'local' }, aiTeam: false,
      delivery: { openPr: false, localMerge: true, e2e: false } });
    expect(s.stage).toBe('build');
    const { spec, token } = started[0];
    expect(token).toBe('tok');
    expect(spec).toMatchObject({ slug: 'ban-hang', kind: 'fullstack', stack: 'java-spring', frontend: { stack: 'ts-react-vite' } });
    expect(Object.keys(spec.docs)).toEqual(['docs/product-brief.md', 'docs/architecture.md', 'docs/design/design.md', 'docs/design/mockups/01-dang-nhap.html']);
    expect(spec.brief).toContain('Bán hàng 5 cửa hàng');
    expect(spec.workflow.find(w => w.step === 'TEST').config.model).toBe('claude:claude-haiku-5-5');   // the chat's workflow
    expect(spec.delivery).toMatchObject({ openPr: false, localMerge: true, e2e: false, ciGate: true });   // local demo pipeline
    expect(spec.workflow.find(w => w.step === 'ARCH').config).toEqual({ timeoutMinutes: 480 });
    expect(() => st.send(s.id, me, 'x')).toThrow(/không trò chuyện/);
    expect(() => st.setWorkflow(s.id, me, hand)).toThrow(/đã được tạo/);
    expect(st.get(s.id, me).project.projectId).toBe('proj_9');
  });

  it('goes straight to project creation when no UI design is needed; the UI step can also be skipped', async () => {
    const calls = [];
    const st = make(calls, { hasUi: false });
    let s = st.start(me, 'Chuỗi 5 cửa hàng cần API tồn kho');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm');
    await until(() => !st.isBusy(s.id));
    s = st.approve(s.id, me, 'system');
    expect(s).toMatchObject({ stage: 'create', skippedUi: true });
    expect(calls.some(c => c.agent === 'studio-designer-agent')).toBe(false);

    const st2 = make([], { hasUi: true });
    let t = st2.start(me, 'Chuỗi 5 cửa hàng cần web bán hàng');
    await until(() => !st2.isBusy(t.id));
    st2.approve(t.id, me, 'pm'); await until(() => !st2.isBusy(t.id));
    st2.approve(t.id, me, 'system'); await until(() => !st2.isBusy(t.id));
    t = st2.skipUi(t.id, me);
    expect(t.stage).toBe('create');
  });

  it('reopens an earlier stage, drops later approvals, keeps the drafts', async () => {
    const st = make([]);
    let s = st.start(me, 'Chuỗi 5 cửa hàng bán lẻ');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm'); await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'system'); await until(() => !st.isBusy(s.id));
    s = st.reopen(s.id, me, 'pm');
    expect(s.stage).toBe('pm');
    expect(s.approved).toEqual({});
    expect(s.docs.architecture).toContain('Lộ trình');
    expect(() => st.reopen(s.id, me, 'system')).toThrow(/bước trước/);
  });

  it('a failing AI turn lands in the chat; any admin opens it; inputs are bounded', async () => {
    const st = make([], { fail: 'studio-pm-agent' });
    const s = st.start(me, 'Một ý tưởng bất kỳ');
    await until(() => !st.isBusy(s.id));
    const v = st.get(s.id, me);
    expect(v.error).toMatch(/quota exceeded/);
    expect(v.messages.at(-1)).toMatchObject({ role: 'shipyard' });
    expect(st.get(s.id, { id: 'u2' }).id).toBe(s.id);   // chats belong to the project: every admin opens them
    expect(() => st.get('../../etc/passwd', me)).toThrow(/Không tìm thấy/);
    expect(() => st.start(me, 'x')).toThrow(/ý tưởng/);
    expect(() => st.send(s.id, me, 'y'.repeat(9000))).toThrow(/tối đa/);
    expect(st.list({ id: 'u2' }).map(x => x.id)).toEqual([s.id]);
    expect(st.list(me).map(x => x.id)).toEqual([s.id]);
    st.remove(s.id, me);
    expect(st.list(me)).toEqual([]);
  });

  it('a failed project creation goes back to "Tạo dự án" with the documents kept', async () => {
    let job = { id: 'scf_2', status: 'failed', stage: 'verify', stages: {}, stageList: [], error: 'build lỗi', project: null };
    const discarded = [];
    const jobs = { root: path.join(root, 'ws'), start: () => ({ id: 'scf_2' }), get: () => job, discard: id => { discarded.push(id); job = null; return { ok: true }; } };
    const st = make([], { hasUi: false }, jobs);
    let s = st.start(me, 'Chuỗi 5 cửa hàng cần API tồn kho');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm'); await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'system');
    s = st.create(s.id, me, 'tok', { name: 'Kho', slug: 'kho-api', git: { provider: 'local' }, aiTeam: false });
    expect(st.get(s.id, me).job).toMatchObject({ status: 'failed', error: 'build lỗi', retryable: false });
    s = st.backToCreate(s.id, me);
    expect(discarded).toEqual(['scf_2']);
    expect(s).toMatchObject({ stage: 'create', project: null });
    expect(s.docs.architecture).toContain('Lộ trình');
    expect(s.messages.at(-1).text).toContain('chưa xong');
    // After a dashboard restart the job is gone: only Shipyard's own half-made folder is removed.
    s = st.create(s.id, me, 'tok', { name: 'Kho', slug: 'kho-api', git: { provider: 'local' }, aiTeam: false });
    fs.mkdirSync(path.join(root, 'ws', 'kho-api', '.shipyard'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ws', 'kho-api', '.shipyard', 'project.json'), JSON.stringify({ slug: 'kho-api' }));
    s = st.backToCreate(s.id, me);
    expect(fs.existsSync(path.join(root, 'ws', 'kho-api'))).toBe(false);
    // A registered project is never undone from here.
    job = { id: 'scf_3', status: 'failed', stage: 'team', project: { id: 'proj_1' } };
    s = st.create(s.id, me, 'tok', { name: 'Kho', slug: 'kho-api', git: { provider: 'local' }, aiTeam: false });
    expect(() => st.backToCreate(s.id, me)).toThrow(/đã được đăng ký/);
  });

  it('each role talks with the model chosen for it — Gemini through the LiteLLM gateway', async () => {
    const calls = [], seen = [];
    const route = async (step, fallback) => { seen.push([step, fallback]); return { model: 'gemini/gemini-2.5-flash', env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:4000' }, gateway: true }; };
    const runs = [];
    const fake = fakeClaude(calls);
    const st = createStudio({ root: () => root, tools: () => ALL, claudeBin: '/x/claude', agentPrompt: n => n, route,
      run: async (cmd, args, opts) => { runs.push({ args, env: opts.env }); return fake(cmd, args, opts); } });
    const s = st.start(me, 'Tôi cần hệ thống bán hàng');
    await until(() => !st.isBusy(s.id));
    expect(seen[0]).toEqual(['pm', 'claude:claude-opus-5-5']);
    expect(runs[0].args[runs[0].args.indexOf('--model') + 1]).toBe('gemini/gemini-2.5-flash');
    expect(runs[0].args).not.toContain('--effort');   // a Claude-only setting
    expect(runs[0].env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:4000');
  });

  it('shows the AI at work while it runs, and keeps the steps on its reply', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const st = createStudio({ root: () => root, tools: () => ALL, claudeBin: '/x/claude', agentPrompt: n => n, route: claudeRoute,
      run: async (cmd, args, opts) => {
        expect(args).toEqual(expect.arrayContaining(['stream-json', '--verbose']));
        opts.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' }));
        opts.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/w/product-brief.md' } }] } }));
        await gate;
        opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'Xong.\nROLE-STEP: DONE chat' }));
      } });
    let s = st.start(me, 'Tôi cần ứng dụng ghi chú');
    await until(() => st.get(s.id, me).activity?.steps.length >= 3);
    s = st.get(s.id, me);
    expect(s.activity).toMatchObject({ role: 'AI PM', model: 'claude-opus-5-5' });
    expect(s.activity.steps.map(x => x.text)).toEqual(['AI PM bắt đầu với claude-opus-5-5', 'Đã kết nối — model claude-opus-5-5', 'Viết product-brief.md']);
    release();
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(s.activity).toBe(null);
    expect(s.messages.at(-1)).toMatchObject({ role: 'ai', text: 'Xong.', model: 'claude-opus-5-5' });
    expect(s.messages.at(-1).steps).toHaveLength(3);
  });

  it('a gateway model that goes silent is given up on and Claude answers instead', async () => {
    const runs = [];
    const route = async () => ({ model: 'gemini/gemini-3.8-flash', env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:4000' }, gateway: true });
    const st = createStudio({ root: () => root, tools: () => ALL, claudeBin: '/x/claude', agentPrompt: n => n, route, stallMs: 40,
      run: async (cmd, args, opts) => {
        const m = args[args.indexOf('--model') + 1];
        runs.push({ m, env: opts.env });
        if (m.startsWith('gemini/')) return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('killed'))));
        opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'Claude trả lời.\nROLE-STEP: DONE chat' }));
      } });
    let s = st.start(me, 'Tôi cần ứng dụng ghi chú');
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(runs.map(r => r.m)).toEqual(['gemini/gemini-3.8-flash', 'claude-sonnet-5-5']);
    expect(runs[1].env).toBeUndefined();   // Claude on this machine's account, not the gateway
    expect(s.messages.at(-1)).toMatchObject({ role: 'ai', text: 'Claude trả lời.', model: 'claude-sonnet-5-5' });
    expect(s.messages.at(-1).steps.map(x => x.text).join('\n')).toMatch(/không phản hồi sau 0 giây — chuyển sang Claude/);
  });

  it('a reply without its ROLE-STEP line is still shown; the role cannot use skills', async () => {
    const runs = [];
    const st = createStudio({ root: () => root, tools: () => ALL, claudeBin: '/x/claude', agentPrompt: n => n, route: claudeRoute,
      run: async (cmd, args, opts) => { runs.push(args); opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'Bạn dùng cho mấy người?' })); } });
    let s = st.start(me, 'Tôi cần ứng dụng ghi chú');
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(s.messages.at(-1)).toMatchObject({ role: 'ai', text: 'Bạn dùng cho mấy người?' });
    expect(s.error).toBe(null);
    expect(runs[0][runs[0].indexOf('--disallowedTools') + 1]).toContain('Skill');
  });

  it('normalizes a workflow written by the AI', () => {
    const base = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'].map(step => ({ step, mode: 'REQUIRED' }));
    const w = normalizeWorkflow({ steps: base.map(x => (x.step === 'DEV' ? { ...x, config: { model: 'bad model', condition: 'HAS_UI', maxRetries: 2 } } : x)) });
    expect(w.find(x => x.step === 'DEV').config).toEqual({ maxRetries: 2 });   // bad model + DEV condition dropped
    expect(() => normalizeWorkflow(base.map(x => (x.step === 'DEV' ? { ...x, mode: 'SKIP' } : x)))).toThrow(/bỏ bước Code/);
    expect(workflowGuide()).toContain('PREV_PASSED');
  });

  it('helpers', () => {
    expect(roadmap('## Khác\n1. x')).toEqual([]);
    const s = { title: 'T', messages: [{ stage: 'pm', role: 'user', text: 'a' }, { stage: 'pm', role: 'ai', text: 'b' }, { stage: 'system', role: 'shipyard', text: 'c' }] };
    expect(turnPrompt(s, 'system')).toContain('[Shipyard]:\nc');
    expect(turnPrompt(s, 'system')).not.toContain('[Người dùng]: a');
  });
});

describe('studio — how a project starts', () => {
  const admin2 = { id: 'u2', email: 'b@x.io', name: 'B' };
  // `git clone … <dir>` makes a tiny repo (or fails when told to); every other call is the fake claude.
  const withGit = (calls, { cloneFails = false } = {}, gitCalls = []) => {
    const claude = fakeClaude(calls);
    return async (cmd, args, opts) => {
      if (cmd !== 'git') return claude(cmd, args, opts);
      gitCalls.push(args);
      if (cloneFails) throw new Error('fatal: repository not found');
      const dir = path.join(opts.cwd, args.at(-1));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'README.md'), '# Shop');
    };
  };
  const makeGit = (calls, o = {}, gitCalls = []) => createStudio({ root: () => root, run: withGit(calls, o, gitCalls), tools: () => ALL,
    route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n });

  it('a plain idea still starts as before', async () => {
    const st = make([]);
    const s = st.start(me, 'Tôi cần hệ thống bán hàng');
    expect(s.kind).toBe('idea');
    await until(() => !st.isBusy(s.id));
  });

  it('a template limits the architect to the chosen stack', async () => {
    const calls = [];
    const st = make(calls);
    let s = st.start(me, { kind: 'template', text: 'Chuỗi 5 cửa hàng bán lẻ', template: { stack: 'java-spring' } });
    expect(s.kind).toBe('template');
    await until(() => !st.isBusy(s.id));
    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm');
    await until(() => !st.isBusy(s.id));
    const arch = calls.find(c => c.agent === 'studio-architect-agent');
    expect(arch.prompt).toContain('Khung đã chọn: backend java-spring');
    expect(JSON.parse(fs.readFileSync(path.join(arch.cwd, 'stacks.json'), 'utf8')).map(x => x.id)).toEqual(['java-spring']);
    expect(() => st.start(me, { kind: 'template', text: 'abcdef', template: { stack: 'cobol' } })).toThrow(/khung/);
  });

  it('a template keeps the chosen backend, frontend and database through to the created project', async () => {
    const calls = [], started = [];
    const jobs = { start: spec => { started.push(spec); return { id: 'scf_1' }; }, get: () => null };
    const st = createStudio({ root: () => root, run: fakeClaude(calls), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, jobs });
    const template = { kind: 'fullstack', stack: 'java-spring', options: { db: 'mysql' }, frontend: { stack: 'ts-react-vite', options: {} } };
    let s = st.start(me, { kind: 'template', text: 'Chuỗi 5 cửa hàng bán lẻ', template });
    await until(() => !st.isBusy(s.id));
    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm');
    await until(() => !st.isBusy(s.id));
    const arch = calls.find(c => c.agent === 'studio-architect-agent');
    expect(arch.prompt).toMatch(/backend java-spring.*db: mysql.*frontend ts-react-vite/s);
    expect(JSON.parse(fs.readFileSync(path.join(arch.cwd, 'stacks.json'), 'utf8')).map(x => x.id).sort()).toEqual(['java-spring', 'ts-react-vite']);
    for (const stage of ['system', 'ui']) { st.approve(s.id, me, stage); await until(() => !st.isBusy(s.id)); }
    st.create(s.id, me, 'tok', { name: 'Bán lẻ', slug: 'ban-le' });
    expect(started[0]).toMatchObject({ kind: 'fullstack', stack: 'java-spring', options: { db: 'mysql' }, frontend: { stack: 'ts-react-vite' } });
    expect(() => st.start(me, { kind: 'template', text: 'abcdef', template: { kind: 'fullstack', stack: 'java-spring', frontend: { stack: 'cobol' } } })).toThrow(/frontend/);
  });

  it('a git project: the repo is cloned and the documents given, then the AI PM reads them', async () => {
    const calls = [], gitCalls = [];
    const st = makeGit(calls, {}, gitCalls);
    let s = st.start(me, { kind: 'git', text: 'Shop có sẵn', source: { url: 'https://github.com/a/shop.git' },
      docs: { files: [{ name: 'yeu-cau.md', content: '# Yêu cầu' }], paths: ['docs/a.md'] } });
    expect(s.kind).toBe('git');
    expect(s.preparing).toBe(true);
    expect(s.importDraft).toEqual({ name: '', slug: '', branch: '' });
    await until(() => !st.isBusy(s.id) && calls.length);
    expect(gitCalls[0]).toContain('https://github.com/a/shop.git');
    const pm = calls[0];
    expect(pm.agent).toBe('studio-pm-agent');
    expect(fs.existsSync(path.join(pm.cwd, 'repo/README.md'))).toBe(true);
    expect(fs.readFileSync(path.join(pm.cwd, 'input/yeu-cau.md'), 'utf8')).toBe('# Yêu cầu');
    expect(pm.prompt).toContain('code ở ./repo');
    expect(pm.prompt).toContain('docs/a.md');
    expect(st.get(s.id, me).preparing).toBe(false);
  });

  it('a failed clone says so and is retried by sending again', async () => {
    const calls = [];
    const st = makeGit(calls, { cloneFails: true });
    let s = st.start(me, { kind: 'git', text: 'Shop có sẵn', source: { url: 'https://github.com/a/nope.git' } });
    await until(() => !st.isBusy(s.id));
    s = st.get(s.id, me);
    expect(s.preparing).toBe(false);
    expect(s.error).toMatch(/repository not found/);
    expect(s.messages.at(-1).text).toMatch(/Không đọc được repo/);
    expect(calls).toEqual([]);
    st.send(s.id, me, 'thử lại');
    await until(() => !st.isBusy(s.id));
    expect(st.get(s.id, me).messages.filter(m => /Không đọc được repo/.test(m.text))).toHaveLength(2);
  });

  it('refuses bad documents', () => {
    const st = makeGit([]);
    const go = files => () => st.start(me, { kind: 'git', text: 'Shop có sẵn', source: { url: 'https://github.com/a/shop.git' }, docs: { files } });
    expect(go([{ name: '../x.md', content: 'a' }])).toThrow(expect.objectContaining({ status: 400 }));
    expect(go([{ name: 'a.exe', content: 'a' }])).toThrow(/loại tệp/);
    expect(go(Array.from({ length: 21 }, (_, i) => ({ name: `${i}.md`, content: 'a' })))).toThrow(/20 tệp/);
    expect(go([{ name: 'big.md', content: 'x'.repeat(2 * 1024 * 1024 + 1) }])).toThrow(/2 MB/);
    expect(go([{ name: 'bin.md', content: 'a\0b' }])).toThrow(/văn bản/);
    expect(() => st.start(me, { kind: 'git', text: 'Shop có sẵn', source: { url: 'ftp://x' } })).toThrow(/URL repo/);
    expect(fs.readdirSync(root).filter(f => f.endsWith('.json'))).toEqual([]);
  });

  it('an interrupted clone (repo/ left half-written) is cloned again on resend', async () => {
    const calls = [], gitCalls = [];
    const st = makeGit(calls, {}, gitCalls);
    fs.mkdirSync(path.join(root, 'stu_cccccccccccc', 'repo'), { recursive: true });   // partial clone, no marker
    fs.writeFileSync(path.join(root, 'stu_cccccccccccc.json'), JSON.stringify({ id: 'stu_cccccccccccc', title: 'X', kind: 'git', stage: 'pm',
      source: { provider: 'url', url: 'https://github.com/a/shop.git' }, preparing: true, messages: [], approved: {}, createdBy: 'u1', createdAt: 'x' }));
    expect(st.get('stu_cccccccccccc', me).error).toMatch(/Bị gián đoạn/);
    st.send('stu_cccccccccccc', me, 'thử lại');
    await until(() => !st.isBusy('stu_cccccccccccc') && calls.length);
    expect(gitCalls).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'stu_cccccccccccc', 'repo', '.shipyard-cloned'))).toBe(true);
  });

  it('a session left running by a restart is shown as interrupted', () => {
    const st = make([]);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'stu_aaaaaaaaaaaa.json'), JSON.stringify({ id: 'stu_aaaaaaaaaaaa', title: 'X', kind: 'git', stage: 'pm',
      preparing: true, messages: [], approved: {}, createdBy: 'u1', createdAt: 'x' }));
    const s = st.get('stu_aaaaaaaaaaaa', me);
    expect(s.preparing).toBe(false);
    expect(s.error).toMatch(/Bị gián đoạn/);
  });

  it('any admin opens any chat', async () => {
    const st = make([]);
    const s = st.start(me, 'Tôi cần hệ thống bán hàng');
    await until(() => !st.isBusy(s.id));
    expect(st.list(admin2).map(x => x.id)).toContain(s.id);
    expect(st.get(s.id, admin2).id).toBe(s.id);
  });
});

describe('studio — feature threads in a project chat', () => {
  // The project's master docs and queue, faked: what the thread reads and where approved features go.
  const fakeProject = () => {
    const added = [], queued = [];
    const docs = { brief: '# Bán hàng', architecture: ARCH, design: '# Giao diện', mockups: [{ name: '01.html', html: '<html></html>' }], features: [] };
    return { added, queued,
      projectDocs: { hasDocs: () => true, seedFromRepo: () => {}, readDocs: () => ({ ...docs, features: added.map(f => ({ slug: f.slug, title: f.title, status: 'approved' })) }),
        addFeature: (pid, f) => added.push({ pid, ...f }) },
      projectQueue: { enqueue: (pid, item) => queued.push({ pid, ...item }), readProjectQueue: () => ({ items: queued, assigned: [], error: '' }) },
      repoDirOf: () => '/srv/proj_9' };
  };
  // The architect of a feature writes feature.json instead of stack.json.
  const featureClaude = (calls, hasUi) => async (cmd, args, opts) => {
    const agent = args[args.indexOf('--append-system-prompt') + 1];
    calls.push({ agent, prompt: args[1], cwd: opts.cwd, args });
    const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(opts.cwd, f)), { recursive: true }); fs.writeFileSync(path.join(opts.cwd, f), t); };
    if (agent === 'studio-pm-agent') w('product-brief.md', '# Xuất Excel\n\n## Tiêu chí chấp nhận\n1. Có nút Xuất');
    if (agent === 'studio-architect-agent') { w('architecture.md', '# Xuất Excel — thay đổi'); w('feature.json', JSON.stringify({ title: 'Xuất Excel', hasUi })); }
    if (agent === 'studio-designer-agent') { w('design.md', '# Nút xuất'); w('mockups/01-xuat.html', '<html>Xuất</html>'); }
    opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'Xong.\nROLE-STEP: DONE chat' }));
  };
  const makeFeature = (calls, p, hasUi = false) => createStudio({ root: () => root, run: featureClaude(calls, hasUi), tools: () => ALL, route: claudeRoute,
    claudeBin: '/x/claude', agentPrompt: n => n, projectDocs: p.projectDocs, projectQueue: p.projectQueue, repoDirOf: p.repoDirOf });
  const walk = async (st, s, stages) => { for (const stage of stages) { await until(() => !st.isBusy(s.id)); s = st.approve(s.id, me, stage); } await until(() => !st.isBusy(s.id)); return s; };

  it('reads the project docs and code, then an approved feature is recorded and queued', async () => {
    const calls = [], p = fakeProject();
    const st = makeFeature(calls, p);
    let s = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    expect(s).toMatchObject({ kind: 'feature', projectId: 'proj_9', stage: 'pm' });
    await until(() => !st.isBusy(s.id));
    expect(fs.readFileSync(path.join(calls[0].cwd, 'project-docs/architecture.md'), 'utf8')).toContain('Lộ trình tính năng');
    expect(fs.existsSync(path.join(calls[0].cwd, 'project-docs/mockups/01.html'))).toBe(true);
    expect(calls[0].prompt).toContain('CHẾ ĐỘ BỔ SUNG TÍNH NĂNG');
    expect(calls[0].args).toEqual(expect.arrayContaining(['--add-dir', '/srv/proj_9']));
    s = await walk(st, s, ['pm', 'system']);
    expect(s.stage).toBe('queued');
    expect(fs.existsSync(path.join(calls[1].cwd, 'stacks.json'))).toBe(false);   // a feature never changes the stack
    expect(p.added).toHaveLength(1);
    expect(p.added[0]).toMatchObject({ pid: 'proj_9', slug: 'xuat-excel', title: 'Xuất Excel', architecture: '# Xuất Excel — thay đổi' });
    expect(p.queued).toHaveLength(1);
    expect(p.queued[0]).toMatchObject({ pid: 'proj_9', slug: 'xuat-excel', title: 'Xuất Excel', sessionId: s.id });
    expect(p.queued[0].spec).toContain('## Tiêu chí chấp nhận');
  });

  it('a feature with screens goes through the designer', async () => {
    const calls = [], p = fakeProject();
    const st = makeFeature(calls, p, true);
    let s = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    s = await walk(st, s, ['pm', 'system']);
    expect(s.stage).toBe('ui');
    s = await walk(st, s, ['ui']);
    expect(s.stage).toBe('queued');
    expect(p.queued[0].designDir).toBe(path.join(root, s.id));
  });

  it('the architect must say what the feature is', async () => {
    const calls = [], p = fakeProject();
    const st = createStudio({ root: () => root, tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, ...p,
      run: async (cmd, args, opts) => {
        const agent = args[args.indexOf('--append-system-prompt') + 1];
        if (agent === 'studio-pm-agent') fs.writeFileSync(path.join(opts.cwd, 'product-brief.md'), '# X');
        if (agent === 'studio-architect-agent') fs.writeFileSync(path.join(opts.cwd, 'architecture.md'), '# X');
        opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'ok\nROLE-STEP: DONE chat' }));
      } });
    let s = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    await until(() => !st.isBusy(s.id));
    st.approve(s.id, me, 'pm');
    await until(() => !st.isBusy(s.id));
    expect(() => st.approve(s.id, me, 'system')).toThrow(/feature.json/);
  });

  it('two features approved one after the other get their own slugs', async () => {
    const calls = [], p = fakeProject();
    const st = makeFeature(calls, p);
    const a = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    await walk(st, a, ['pm', 'system']);
    const b = st.startFeature(me, 'proj_9', 'Cần xuất Excel lần nữa');
    await walk(st, b, ['pm', 'system']);
    expect(p.queued.map(x => x.slug)).toEqual(['xuat-excel', 'xuat-excel-2']);
  });

  it('a project chat holds its creation thread and only its own features', async () => {
    const calls = [], p = fakeProject();
    const st = makeFeature(calls, p);
    fs.mkdirSync(root, { recursive: true });
    // An older studio session that created proj_9 (the project id kept under `project`).
    fs.writeFileSync(path.join(root, 'stu_bbbbbbbbbbbb.json'), JSON.stringify({ id: 'stu_bbbbbbbbbbbb', title: 'Bán hàng', stage: 'build',
      project: { jobId: 'scf_1', slug: 'ban-hang', name: 'Bán hàng', projectId: 'proj_9' }, messages: [], approved: {}, createdBy: 'u1', createdAt: 'x' }));
    const f = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    await until(() => !st.isBusy(f.id));
    const c = st.projectChat('proj_9');
    expect(c.root.id).toBe('stu_bbbbbbbbbbbb');
    expect(c.threads.map(t => t.id)).toEqual([f.id]);
    expect(c.threads[0]).toMatchObject({ stage: 'pm', status: 'pm' });
    expect(st.get(f.id, me).parent).toBe('stu_bbbbbbbbbbbb');
    const other = st.projectChat('proj_X');
    expect(other.root).toBe(null);
    expect(other.threads).toEqual([]);
    expect(st.list(me).map(x => x.id)).not.toContain(f.id);   // feature threads live in the project chat, not in drafts
  });
});

describe('studio — a created project owns its chat', () => {
  const fakes = () => {
    const seeded = [], queued = [];
    return { seeded, queued, projectDocs: { seedDocs: (pid, d) => seeded.push({ pid, ...d }), hasDocs: () => false, readDocs: () => ({ features: [] }) },
      projectQueue: { enqueue: (pid, item) => queued.push({ pid, ...item }), readProjectQueue: () => ({ items: [], assigned: [], error: '' }) } };
  };
  const toCreate = async (st, text = 'Tôi cần hệ thống bán hàng') => {
    let s = st.start(me, text);
    await until(() => !st.isBusy(s.id));
    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    for (const stage of ['pm', 'system', 'ui']) { st.approve(s.id, me, stage); await until(() => !st.isBusy(s.id)); }
    return st.get(s.id, me);
  };

  it('seeds the master docs and queues the roadmap once the project is registered', async () => {
    const f = fakes();
    let registered = null;
    const jobs = { start: () => ({ id: 'scf_1' }), get: () => ({ id: 'scf_1', status: 'running', stages: {}, stageList: [], project: registered }) };
    const st = createStudio({ root: () => root, run: fakeClaude([]), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n,
      jobs, projectDocs: f.projectDocs, projectQueue: f.projectQueue });
    let s = await toCreate(st);
    s = st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang' });
    expect(f.seeded).toEqual([]);
    registered = { id: 'proj_9' };
    s = st.get(s.id, me);
    expect(s.projectId).toBe('proj_9');
    expect(f.seeded).toHaveLength(1);
    expect(f.seeded[0]).toMatchObject({ pid: 'proj_9', brief: '# Bán hàng 5 cửa hàng\n\n## Tóm tắt\nPOS.' });
    expect(f.seeded[0].mockups.map(m => m.name)).toEqual(['01-dang-nhap.html']);
    expect(f.queued.map(q => [q.slug, q.title])).toEqual([['dang-nhap-phan-quyen', 'Đăng nhập & phân quyền'], ['san-pham', 'Sản phẩm'], ['don-hang-tai-quay', 'Đơn hàng tại quầy']]);
    expect(f.queued[0].requirement).toMatch(/^Tính năng "Đăng nhập & phân quyền" của dự án Bán hàng/);
    st.get(s.id, me);
    expect(f.queued).toHaveLength(3);
    expect(st.projectChat('proj_9').root.id).toBe(s.id);
  });

  it('adds a lane for the project once it is created, only once', async () => {
    const f = fakes(), added = [];
    let status = 'running';
    const jobs = { start: () => ({ id: 'scf_1' }), get: () => ({ id: 'scf_1', status, stages: {}, stageList: [], project: { id: 'proj_9' } }) };
    const st = createStudio({ root: () => root, run: fakeClaude([]), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n,
      jobs, ...f, addLane: p => added.push(p) });
    let s = await toCreate(st);
    st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang' });
    st.get(s.id, me);
    expect(added).toEqual([]);                       // still generating: no profile to bind a lane to yet
    status = 'done';
    s = st.get(s.id, me);
    st.get(s.id, me);
    expect(added).toEqual([{ slug: 'ban-hang', projectId: 'proj_9', name: 'Bán hàng' }]);
    expect(s.messages.at(-1).text).toMatch(/tự thêm một lane/);
  });

  it('roadmap items already in the code are not queued', async () => {
    const f = fakes();
    const jobs = { start: () => ({ id: 'scf_1' }), get: () => ({ id: 'scf_1', status: 'done', stages: {}, stageList: [], project: { id: 'proj_9' } }) };
    const claude = fakeClaude([]);
    const st = createStudio({ root: () => root, tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, jobs, ...f,
      run: async (cmd, args, opts) => {
        await claude(cmd, args, opts);
        const a = path.join(opts.cwd, 'architecture.md');
        if (fs.existsSync(a)) fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('— danh mục, giá', '— danh mục, giá (Đã có)'));
      } });
    let s = await toCreate(st);
    st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang' });
    st.get(s.id, me);
    expect(f.queued.map(q => q.title)).toEqual(['Đăng nhập & phân quyền', 'Đơn hàng tại quầy']);
  });

  it('a git project is created through the importer with its source and documents', async () => {
    const f = fakes(), started = [];
    const importer = { start: (spec, user, token) => { started.push(spec); return { id: 'imp_1' }; },
      get: () => ({ id: 'imp_1', status: 'running', stage: 'clone', stages: {}, stageList: [], project: null }) };
    const claude = fakeClaude([]);
    const st = createStudio({ root: () => root, tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, importer, ...f,
      run: async (cmd, args, opts) => { if (cmd === 'git') { fs.mkdirSync(path.join(opts.cwd, 'repo'), { recursive: true }); return; } return claude(cmd, args, opts); } });
    let s = st.start(me, { kind: 'git', text: 'Shop có sẵn ở công ty', source: { url: 'https://github.com/a/shop.git' }, docs: { paths: ['docs/a.md'] } });
    await until(() => !st.isBusy(s.id) && st.get(s.id, me).messages.some(m => m.role === 'ai'));
    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    for (const stage of ['pm', 'system', 'ui']) { st.approve(s.id, me, stage); await until(() => !st.isBusy(s.id)); }
    const form = { name: 'Shop', slug: 'shop', branch: 'main', backend: { tech: 'Laravel', run: 'php artisan serve' } };
    s = st.create(s.id, me, 'tok', { import: form });
    expect(started[0]).toMatchObject({ slug: 'shop', source: { url: 'https://github.com/a/shop.git' }, docs: { brief: '', other: ['docs/a.md'] } });
    expect(s.job).toMatchObject({ id: 'imp_1', status: 'running' });
  });
});

describe('studio — approved chat documents reach the project memory', () => {
  const fakes = (failFirst = false) => {
    const events = [];
    let fail = failFirst;
    return { events,
      projectDocs: { seedDocs: () => {}, hasDocs: () => false, readDocs: () => ({ features: [] }), addFeature: () => {}, seedFromRepo: () => {} },
      projectQueue: { enqueue: () => {}, readProjectQueue: () => ({ items: [], assigned: [], error: '' }) },
      memory: { approved: async e => { if (fail) { fail = false; throw new Error('context-service down'); } events.push(e); } } };
  };
  const settle = () => new Promise(r => setTimeout(r, 30));

  it('sends the approved brief, architecture and design once the project exists', async () => {
    const f = fakes();
    const jobs = { start: () => ({ id: 'scf_1' }), get: () => ({ id: 'scf_1', status: 'running', stages: {}, stageList: [], project: { id: 'proj_9' } }) };
    const st = createStudio({ root: () => root, run: fakeClaude([]), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, jobs, ...f });
    let s = st.start(me, 'Tôi cần hệ thống bán hàng');
    await until(() => !st.isBusy(s.id));
    st.send(s.id, me, 'Chuỗi 5 cửa hàng, 1000 người dùng');
    await until(() => !st.isBusy(s.id));
    for (const stage of ['pm', 'system', 'ui']) { st.approve(s.id, me, stage); await until(() => !st.isBusy(s.id)); }
    st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang' });
    st.get(s.id, me);
    await settle();
    expect(f.events.map(e => [e.projectId, e.step, Object.keys(e.documents)])).toEqual([
      ['proj_9', 'PM', ['product-brief.md']], ['proj_9', 'ARCH', ['architecture.md']], ['proj_9', 'DESIGN', ['design.md']]]);
    expect(f.events[0]).toMatchObject({ runId: `chat:${s.id}`, runTitle: 'Tạo dự án — Bán hàng 5 cửa hàng' });
    st.get(s.id, me);
    await settle();
    expect(f.events).toHaveLength(3);                // sent once
  });

  it('a failed send is retried on the next look; an approved feature is sent too', async () => {
    const f = fakes(true);
    const st = createStudio({ root: () => root, tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, ...f,
      run: async (cmd, args, opts) => {
        const agent = args[args.indexOf('--append-system-prompt') + 1];
        const w = (n, t) => fs.writeFileSync(path.join(opts.cwd, n), t);
        if (agent === 'studio-pm-agent') w('product-brief.md', '# Xuất Excel\n\n## Tiêu chí chấp nhận\n1. Có nút');
        if (agent === 'studio-architect-agent') { w('architecture.md', '# đổi'); w('feature.json', JSON.stringify({ title: 'Xuất Excel', hasUi: false })); }
        opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'ok\nROLE-STEP: DONE chat' }));
      } });
    let s = st.startFeature(me, 'proj_9', 'Cần xuất Excel danh sách đơn');
    for (const stage of ['pm', 'system']) { await until(() => !st.isBusy(s.id)); s = st.approve(s.id, me, stage); }
    await settle();
    expect(f.events).toHaveLength(1);               // the first of the two failed
    st.get(s.id, me);
    await settle();
    expect(f.events.map(e => e.step).sort()).toEqual(['ARCH', 'PM']);
    expect(f.events[0]).toMatchObject({ projectId: 'proj_9', runTitle: 'Xuất Excel' });
  });

  it('on start, every project made by a chat gets its documents and memory filled', async () => {
    const f = fakes(), seeded = [];
    f.projectDocs.seedDocs = (pid, d) => seeded.push(pid);
    const st = createStudio({ root: () => root, run: fakeClaude([]), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, ...f });
    for (const [id, pid] of [['stu_eeeeeeeeeeee', 'proj_1'], ['stu_ffffffffffff', null]]) {
      fs.mkdirSync(path.join(root, id), { recursive: true });
      fs.writeFileSync(path.join(root, id, 'product-brief.md'), '# X');
      fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify({ id, title: 'X', stage: pid ? 'build' : 'pm', approved: { pm: 'x' },
        ...(pid ? { project: { slug: 'x', name: 'X', projectId: pid } } : {}), messages: [], createdBy: 'u1', createdAt: 'x' }));
    }
    st.backfill();
    await settle();
    expect(seeded).toEqual(['proj_1']);
    expect(f.events.map(e => e.projectId)).toEqual(['proj_1']);
  });

  it('a project created before this has its documents and memory filled from its creation chat', async () => {
    const f = fakes(), seeded = [];
    f.projectDocs.seedDocs = (pid, d) => seeded.push({ pid, ...d });
    const st = createStudio({ root: () => root, run: fakeClaude([]), tools: () => ALL, route: claudeRoute, claudeBin: '/x/claude', agentPrompt: n => n, ...f });
    fs.mkdirSync(path.join(root, 'stu_dddddddddddd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'stu_dddddddddddd', 'product-brief.md'), '# Web học');
    fs.writeFileSync(path.join(root, 'stu_dddddddddddd.json'), JSON.stringify({ id: 'stu_dddddddddddd', title: 'Web học', stage: 'build',
      project: { jobId: 'gone', slug: 'web-hoc', name: 'Web học', projectId: 'proj_7' }, approved: { pm: 'x' }, messages: [], createdBy: 'u1', createdAt: 'x' }));
    st.ensureProjectDocs('proj_7');
    await settle();
    expect(seeded[0]).toMatchObject({ pid: 'proj_7', brief: '# Web học' });
    expect(f.events.map(e => e.step)).toEqual(['PM']);
  });
});

