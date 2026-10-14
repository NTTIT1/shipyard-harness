import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, S, needs, lastOpts;

// Fake SDK query: replays a script; a {tool} step calls canUseTool and records the decision.
function fakeQuery(script) {
  return ({ prompt, options }) => {
    lastOpts = options;
    const it = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'sess-1', model: options.model };
      for (const step of script) {
        if (step.tool) {
          const decision = await options.canUseTool(step.tool, step.input, { signal: new AbortController().signal });
          yield { type: 'assistant', message: { content: [{ type: 'text', text: `decision:${JSON.stringify(decision)}` }] } };
        } else if (step.waitInput) {
          const r = await prompt[Symbol.asyncIterator]().next();
          yield { type: 'assistant', message: { content: [{ type: 'text', text: `got:${r.value.message.content}` }] } };
        } else yield step;
      }
    })();
    it.interrupt = async () => {};
    return it;
  };
}
const tick = () => new Promise(r => setTimeout(r, 20));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sess-'));
  process.env.HARNESS_ROOT = tmp;
  process.env.LANES_ROOT = path.join(tmp, 'lanes');
  fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'config', 'providers.json'),
    JSON.stringify({ providers: { openai: { api_key: 'sk-live-SECRETSECRET' } }, gateway_key: 'sk-gw-x' }));
  S = await import('../server/services/sessions.js');
});
afterAll(() => { S.stopAll(); fs.rmSync(tmp, { recursive: true, force: true }); });
beforeEach(() => { needs = []; });

describe('sessions', () => {
  it('routes AskUserQuestion to the dashboard and returns the answers', async () => {
    const q = { questions: [{ question: 'Which color?', header: 'C', multiSelect: false, options: [{ label: 'red' }, { label: 'blue' }] }] };
    S.configureSessions({ query: fakeQuery([{ tool: 'AskUserQuestion', input: q }]), setNeedsAction: (n, v) => needs.push(v), claudeBin: '/x/claude' });
    S.startSession(1, { model: 'claude-opus-5-5', prompt: '/ship-feature thing' });
    await tick();
    const pending = S.history(1).find(e => e.kind === 'question');
    expect(pending.questions[0].question).toBe('Which color?');
    expect(S.brief(1).pending_kind).toBe('question');
    expect(needs).toEqual(['answer']);
    S.answer(1, pending.id, { answers: { 'Which color?': 'blue' } });
    await tick();
    const dec = S.history(1).filter(e => e.kind === 'assistant').pop().text;
    expect(dec).toContain('"behavior":"allow"');
    expect(dec).toContain('"Which color?":"blue"');
    expect(needs).toEqual(['answer', '']);
    expect(lastOpts.cwd).toBe(path.join(tmp, 'lanes', 'lane1'));
    expect(lastOpts.pathToClaudeCodeExecutable).toBe('/x/claude');
    expect(S.sessionInfo(1).session_id).toBe('sess-1');
    S.stopSession(1);
  });

  it('a permission prompt can be denied', async () => {
    S.configureSessions({ query: fakeQuery([{ tool: 'Bash', input: { command: 'rm -rf x' } }]), setNeedsAction: () => {} });
    S.startSession(2, { model: 'claude-opus-5-5', prompt: 'go' });
    await tick();
    const p = S.history(2).find(e => e.kind === 'permission');
    expect(p.tool).toBe('Bash');
    S.answer(2, p.id, { allow: false });
    await tick();
    expect(S.history(2).filter(e => e.kind === 'assistant').pop().text).toContain('"behavior":"deny"');
    S.stopSession(2);
  });

  it('free-text messages reach the session input', async () => {
    S.configureSessions({ query: fakeQuery([{ waitInput: true }, { waitInput: true }]) });
    S.startSession(3, { model: 'claude-opus-5-5', prompt: 'first' });
    await tick();
    S.sendMessage(3, 'ok');
    await tick();
    const texts = S.history(3).filter(e => e.kind === 'assistant').map(e => e.text);
    expect(texts).toEqual(['got:first', 'got:ok']);
    expect(S.history(3).some(e => e.kind === 'user' && e.text === 'ok')).toBe(true);
    S.stopSession(3);
  });

  it('refuses a second session on a busy lane', async () => {
    S.configureSessions({ query: fakeQuery([{ waitInput: true }]) });
    S.startSession(4, { model: 'claude-opus-5-5', prompt: 'a' });
    expect(() => S.startSession(4, { model: 'claude-opus-5-5', prompt: 'b' })).toThrow('busy');
    S.stopSession(4);
  });

  it('stop clears a pending question and needs_action; session stays resumable', async () => {
    const q = { questions: [{ question: 'Q?', header: 'Q', multiSelect: false, options: [{ label: 'a' }, { label: 'b' }] }] };
    S.configureSessions({ query: fakeQuery([{ tool: 'AskUserQuestion', input: q }]), setNeedsAction: (n, v) => needs.push(v) });
    S.startSession(5, { model: 'claude-opus-5-5', prompt: 'x' });
    await tick();
    S.stopSession(5);
    await tick();
    expect(S.brief(5)).toEqual({ session_running: false, session_resumable: true, pending_kind: '' });
    expect(needs.at(-1)).toBe('');
    expect(S.history(5).at(-1).kind).toBe('ended');
  });

  it('resume passes the stored session id', async () => {
    S.configureSessions({ query: fakeQuery([]) });
    S.startSession(5, { model: 'claude-opus-5-5', prompt: 'continue', resume: S.sessionInfo(5).session_id });
    expect(lastOpts.resume).toBe('sess-1');
    S.stopSession(5);
  });

  it('redacts configured keys and key-shaped strings from the chat log', async () => {
    S.configureSessions({ query: fakeQuery([{ type: 'assistant', message: { content: [{ type: 'text', text: 'key sk-live-SECRETSECRET and AIzaSyD0123456789abcdefghijklm' }] } }]) });
    S.startSession(6, { model: 'claude-opus-5-5', prompt: 'x' });
    await tick();
    const log = fs.readFileSync(path.join(tmp, 'run', 'lane6', 'chat.jsonl'), 'utf8');
    expect(log).not.toContain('SECRETSECRET');
    expect(log).not.toContain('AIzaSyD0123456789');
    expect(log).toContain('***');
    S.stopSession(6);
  });

  it('survives a malformed providers.json: still redacts key shapes and can be stopped', async () => {
    const pf = path.join(tmp, 'config', 'providers.json');
    const good = fs.readFileSync(pf, 'utf8');
    fs.writeFileSync(pf, '{not json');
    try {
      S.configureSessions({ query: fakeQuery([{ type: 'assistant', message: { content: [{ type: 'text', text: 'key sk-live-SECRETSECRET' }] } }, { waitInput: true }]) });
      expect(() => S.startSession(7, { model: 'claude-opus-5-5', prompt: 'x' })).not.toThrow();
      await tick();
      const log = fs.readFileSync(path.join(tmp, 'run', 'lane7', 'chat.jsonl'), 'utf8');
      expect(log).not.toContain('SECRETSECRET');
      expect(log).toContain('***');
      S.stopSession(7);
      await tick();
      expect(S.history(7).at(-1).kind).toBe('ended');
      expect(S.isRunning(7)).toBe(false);
    } finally {
      fs.writeFileSync(pf, good);
    }
  });
});
