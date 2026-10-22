// Which account Claude Code runs on from the dashboard (studio, advisor, lane sessions): the machine's
// login by default; the Anthropic API key only when chosen and usable; back to the login when it fails.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, P, U, S, bin;
const KEY = 'sk-ant-api03-TESTKEY';
const providers = doc => fs.writeFileSync(path.join(tmp, 'config', 'providers.json'), JSON.stringify(doc));

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-auth-'));
  process.env.HARNESS_ROOT = tmp;
  process.env.LANES_ROOT = path.join(tmp, 'lanes');
  fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
  // A fake `claude` that reports its account and rejects keys while BADKEY exists.
  bin = path.join(tmp, 'claude');
  fs.writeFileSync(bin, `#!/usr/bin/env bash
if [ -n "$ANTHROPIC_API_KEY" ]; then echo "acct key"; else echo "acct login"; fi
if [ -n "$ANTHROPIC_API_KEY" ] && [ -f "${tmp}/BADKEY" ]; then echo '{"is_error":true,"result":"Invalid API key · Fix external API key"}'; exit 1; fi
echo '{"is_error":false,"result":"ok"}'
`, { mode: 0o755 });
  P = await import('../server/services/providers.js');
  U = await import('../server/services/scaffold/util.js');
  S = await import('../server/services/sessions.js');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { fs.rmSync(path.join(tmp, 'run'), { recursive: true, force: true }); fs.rmSync(path.join(tmp, 'BADKEY'), { force: true }); });

const accounts = async () => { const lines = []; await U.run(bin, ['-p', 'x'], { log: l => lines.push(l) }); return lines.filter(l => l.startsWith('acct')).map(l => l.slice(5)); };

describe('claude account', () => {
  it('uses the login by default, never an inherited key', async () => {
    providers({ providers: { anthropic: { api_key: KEY } } });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-INHERITED';
    try {
      expect(P.claudeAuthStatus()).toEqual({ mode: 'login', using: 'login', why: '' });
      expect(await accounts()).toEqual(['login']);
      expect(P.claudeEnv().ANTHROPIC_API_KEY).toBeUndefined();
    } finally { delete process.env.ANTHROPIC_API_KEY; }
  });

  it('uses the key when chosen; a rejected key reruns on the login and is skipped for an hour', async () => {
    providers({ providers: { anthropic: { api_key: KEY } }, gateway_key: 'sk-gw-x' });
    expect(P.setClaudeAuth('api_key')).toMatchObject({ mode: 'api_key', using: 'api_key' });
    expect(P.readProviders().providers.anthropic.api_key).toBe(KEY);   // keys kept
    expect(await accounts()).toEqual(['key']);
    fs.writeFileSync(path.join(tmp, 'BADKEY'), '');
    expect(await accounts()).toEqual(['key', 'login']);
    const st = P.claudeAuthStatus();
    expect(st).toMatchObject({ mode: 'api_key', using: 'login' });
    expect(st.why).toContain('Invalid API key');
    expect(JSON.stringify(st)).not.toContain('TESTKEY');
    expect(await accounts()).toEqual(['login']);
    expect(P.claudeAuthStatus(Date.now() + 3601_000).using).toBe('api_key');   // tried again after an hour
    expect(() => P.setClaudeAuth('other')).toThrow();
    P.setClaudeAuth('login');
    expect(P.claudeAuthStatus().mode).toBe('login');
  });

  it('explains why the key is not used', () => {
    providers({ claude_auth: 'api_key', providers: {} });
    expect(P.claudeAuthStatus().why).toContain('Chưa nhập');
    providers({ claude_auth: 'api_key', providers: { anthropic: { api_key: 'sk-ant-usr-x' } } });
    expect(P.claudeAuthStatus().why).toContain('sk-ant-api');
  });

  it('lane sessions get the chosen account; a key error is reported and remembered', async () => {
    providers({ claude_auth: 'api_key', providers: { anthropic: { api_key: KEY } } });
    let opts;
    S.configureSessions({
      setNeedsAction: () => {},
      query: ({ options }) => {
        opts = options;
        const it = (async function* () { yield { type: 'result', is_error: true, result: 'Invalid API key · Please run /login' }; })();
        it.interrupt = async () => {};
        return it;
      },
    });
    const events = [];
    const off = S.subscribe(9, e => events.push(e));
    S.startSession(9, { model: 'claude-opus-5-5' });
    await new Promise(r => setTimeout(r, 50));
    expect(opts.env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(P.claudeAuthStatus().using).toBe('login');
    expect(events.some(e => /API key Anthropic lỗi/.test(e.text || ''))).toBe(true);
    off();
    S.stopAll();
  });
});
