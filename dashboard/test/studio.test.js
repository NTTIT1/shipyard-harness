// Product studio: idea → AI PM (brief) → AI architect (stack + architecture) → AI designer (mockups)
// → project generated with the approved documents. Fake `claude`, real files.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createStudio, roadmap, turnPrompt } from '../server/services/scaffold/studio.js';

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
const make = (calls, opts = {}, jobs = null) => createStudio({ root: () => root, run: fakeClaude(calls, opts), tools: () => ALL,
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
    expect(() => st.send(s.id, me, 'x')).toThrow(/không trò chuyện/);

    s = st.create(s.id, me, 'tok', { name: 'Bán hàng', slug: 'ban-hang', workflow: null, git: { provider: 'local' }, aiTeam: false });
    expect(s.stage).toBe('build');
    const { spec, token } = started[0];
    expect(token).toBe('tok');
    expect(spec).toMatchObject({ slug: 'ban-hang', kind: 'fullstack', stack: 'java-spring', frontend: { stack: 'ts-react-vite' } });
    expect(Object.keys(spec.docs)).toEqual(['docs/product-brief.md', 'docs/architecture.md', 'docs/design/design.md', 'docs/design/mockups/01-dang-nhap.html']);
    expect(spec.brief).toContain('Bán hàng 5 cửa hàng');
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

  it('a failing AI turn lands in the chat; sessions are private; inputs are bounded', async () => {
    const st = make([], { fail: 'studio-pm-agent' });
    const s = st.start(me, 'Một ý tưởng bất kỳ');
    await until(() => !st.isBusy(s.id));
    const v = st.get(s.id, me);
    expect(v.error).toMatch(/quota exceeded/);
    expect(v.messages.at(-1)).toMatchObject({ role: 'shipyard' });
    expect(() => st.get(s.id, { id: 'u2' })).toThrow(/Không tìm thấy/);
    expect(() => st.get('../../etc/passwd', me)).toThrow(/Không tìm thấy/);
    expect(() => st.start(me, 'x')).toThrow(/ý tưởng/);
    expect(() => st.send(s.id, me, 'y'.repeat(9000))).toThrow(/tối đa/);
    expect(st.list({ id: 'u2' })).toEqual([]);
    expect(st.list(me).map(x => x.id)).toEqual([s.id]);
    st.remove(s.id, me);
    expect(st.list(me)).toEqual([]);
  });

  it('helpers', () => {
    expect(roadmap('## Khác\n1. x')).toEqual([]);
    const s = { title: 'T', messages: [{ stage: 'pm', role: 'user', text: 'a' }, { stage: 'pm', role: 'ai', text: 'b' }, { stage: 'system', role: 'shipyard', text: 'c' }] };
    expect(turnPrompt(s, 'system')).toContain('[Shipyard]:\nc');
    expect(turnPrompt(s, 'system')).not.toContain('[Người dùng]: a');
  });
});
