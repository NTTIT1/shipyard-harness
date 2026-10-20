import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, P;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prov-'));
  process.env.HARNESS_ROOT = tmp;
  fs.mkdirSync(path.join(tmp, 'config'));
  P = await import('../server/services/providers.js');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('providers store', () => {
  it('writes keys with mode 600 and a generated gateway key', () => {
    P.writeProviders({ openai: { api_key: 'sk-test-1234567890abcd' } });
    const st = fs.statSync(P.providersPath());
    expect(st.mode & 0o777).toBe(0o600);
    expect(P.readProviders().gateway_key).toMatch(/^sk-gw-[0-9a-f]{48}$/);
  });
  it('never exposes a full key publicly', () => {
    const pub = P.publicProviders();
    expect(pub.openai.configured).toBe(true);
    expect(pub.openai.key_hint).toBe('…abcd');
    expect(JSON.stringify(pub)).not.toContain('sk-test-1234567890abcd');
    expect(pub.gemini.configured).toBe(false);
  });
  it('empty api_key keeps the existing key; remove deletes the provider', () => {
    P.writeProviders({ openai: { api_key: '' } });
    expect(P.readProviders().providers.openai.api_key).toBe('sk-test-1234567890abcd');
    P.writeProviders({ mistral: { api_key: 'm-key-0000' } });
    P.writeProviders({ mistral: { remove: true } });
    expect(P.readProviders().providers.mistral).toBeUndefined();
  });
  it('rejects a key containing a newline (would break gateway.env)', () => {
    expect(() => P.writeProviders({ groq: { api_key: 'abc\nLITELLM_MASTER_KEY=x' } })).toThrow(/newline/);
  });
  it('accepts custom-<slug> providers and rejects unknown ids', () => {
    P.writeProviders({ 'custom-lab': { label: 'Lab', base_url: 'http://10.0.0.5:8000/v1', api_key: 'k' } });
    expect(P.publicProviders()['custom-lab'].custom).toBe(true);
    expect(() => P.writeProviders({ 'bogus': { api_key: 'x' } })).toThrow(/unknown provider/);
  });
});

describe('validateModels', () => {
  it('requires main to be a Claude model', () => {
    P.setProviderModels('openai', ['gpt-x']);
    expect(P.validateModels({ main: 'openai:gpt-x' })).toEqual(['main: phiên chính chỉ dùng model Claude']);
  });
  it('accepts configured models and rejects unknown/removed ones', () => {
    expect(P.validateModels({ main: 'claude:claude-opus-5-5', 'code-review': 'openai:gpt-x' })).toEqual([]);
    expect(P.validateModels({ 'code-review': 'openai:gpt-nope' })).toEqual(['code-review: model openai:gpt-nope không có trong danh sách (bấm Kiểm tra ở Nhà cung cấp)']);
    expect(P.validateModels({ 'qc-local': 'mistral:large' })).toEqual(['qc-local: nhà cung cấp mistral chưa cấu hình']);
    expect(P.validateModels({ 'bogus-step': 'claude:claude-opus-5-5' })).toEqual(['bogus-step: bước không tồn tại']);
  });
  it('usesGateway is true only when a non-Claude model is chosen', () => {
    expect(P.usesGateway({ main: 'claude:claude-opus-5-5' })).toBe(false);
    expect(P.usesGateway({ main: 'claude:claude-opus-5-5', 'code-review': 'openai:gpt-x' })).toBe(true);
  });
});

describe('renderGateway', () => {
  it('emits explicit model entries, env-referenced keys and a 600 env file', () => {
    P.writeProviders({ ollama: { base_url: 'http://127.0.0.1:11434' } });
    P.setProviderModels('ollama', ['qwen3:8b']);
    P.setProviderModels('custom-lab', ['m1']);
    const dir = path.join(tmp, 'run', 'gateway');
    const { yaml, env } = P.renderGateway(dir);
    expect(yaml).toContain('model_name: "openai/gpt-x"');
    expect(yaml).toContain('api_key: "os.environ/KEY_OPENAI"');
    expect(yaml).toContain('model: "ollama_chat/qwen3:8b"');
    expect(yaml).toContain('api_base: "http://host.docker.internal:11434"');
    expect(yaml).toContain('model_name: "custom-lab/m1"');
    expect(yaml).toContain('model: "openai/m1"');
    expect(yaml).not.toContain('sk-test-1234567890abcd');
    expect(env).toContain('KEY_OPENAI=sk-test-1234567890abcd');
    expect(env).toMatch(/^LITELLM_MASTER_KEY=sk-gw-/m);
    expect(fs.statSync(path.join(dir, 'gateway.env')).mode & 0o777).toBe(0o600);
  });
});

describe('listModels', () => {
  it('parses OpenAI-style, Gemini and Ollama listings', async () => {
    const fake = async (url) => ({
      ok: true,
      json: async () => url.includes('googleapis')
        ? { models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }
        : url.endsWith('/api/tags') ? { models: [{ name: 'qwen3:8b' }] }
        : { data: [{ id: 'b' }, { id: 'a' }] },
    });
    expect(await P.listModels('openai', fake)).toEqual(['a', 'b']);
    P.writeProviders({ gemini: { api_key: 'AIzaTEST' } });
    expect(await P.listModels('gemini', fake)).toEqual(['gemini-x']);
    expect(await P.listModels('ollama', fake)).toEqual(['qwen3:8b']);
  });
  it('throws the HTTP status on a rejected key', async () => {
    const fake = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(P.listModels('openai', fake)).rejects.toThrow('HTTP 401');
  });
});

describe('corrupt store is never overwritten', () => {
  it('throws on malformed providers.json and leaves the file byte-for-byte unchanged', () => {
    const file = P.providersPath();
    const saved = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, '{not json');
      expect(() => P.readProviders()).toThrow(/providers\.json/);
      expect(() => P.writeProviders({ openai: { api_key: 'x' } })).toThrow(/providers\.json/);
      expect(fs.readFileSync(file, 'utf8')).toBe('{not json');
    } finally {
      fs.writeFileSync(file, saved, { mode: 0o600 });
    }
  });
});

describe('per-lane model defaults & per-feature models', () => {
  it('stores and retrieves per-lane model defaults independently of global defaults', () => {
    P.writeModelDefaults({ main: 'claude:claude-opus-5-5', impl_agents: 2 });
    P.writeLaneModelDefaults(2, { main: 'claude:claude-sonnet-5-5', pm: 'claude:claude-haiku-5-5', impl_agents: 3, effort: { pm: 'high' } });

    const lane2 = P.readLaneModelDefaults(2);
    expect(lane2.main).toBe('claude:claude-sonnet-5-5');
    expect(lane2.pm).toBe('claude:claude-haiku-5-5');
    expect(lane2.impl_agents).toBe(3);
    expect(lane2.effort).toEqual({ pm: 'high' });

    // Lane 1 has no custom defaults -> falls back to global defaults
    const lane1 = P.readLaneModelDefaults(1);
    expect(lane1.main).toBe('claude:claude-opus-5-5');
    expect(P.readAllLaneDefaults()['2'].impl_agents).toBe(3);

    // Resetting lane 2 restores fallback
    P.writeLaneModelDefaults(2, null);
    expect(P.readAllLaneDefaults()['2']).toBeUndefined();
  });

  it('stores and retrieves per-feature model configs', () => {
    P.writeFeatureModels('feat-auth', { models: { 'code-review': 'openai:gpt-x' }, impl_agents: 4, effort: { 'code-review': 'max' } });
    const feats = P.readFeatureModels();
    expect(feats['feat-auth']['code-review']).toBe('openai:gpt-x');
    expect(feats['feat-auth'].impl_agents).toBe(4);
    expect(feats['feat-auth'].effort).toEqual({ 'code-review': 'max' });

    // Writing global defaults preserves feature models
    P.writeModelDefaults({ main: 'claude:claude-opus-5-5', impl_agents: 2 });
    expect(P.readFeatureModels()['feat-auth']['code-review']).toBe('openai:gpt-x');

    // Reset removes feature config
    P.writeFeatureModels('feat-auth', null);
    expect(P.readFeatureModels()['feat-auth']).toBeUndefined();
  });
});



describe('Anthropic provider + OpenHands DEV engine', () => {
  it('lists Claude API models with x-api-key and renders them on the gateway', async () => {
    P.writeProviders({ anthropic: { api_key: 'sk-ant-api-test-9999' } });
    let seen;
    const fake = async (url, opts) => { seen = { url, headers: opts.headers }; return { ok: true, json: async () => ({ data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-opus-5-5' }] }) }; };
    expect(await P.listModels('anthropic', fake)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(seen.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect(seen.headers['x-api-key']).toBe('sk-ant-api-test-9999');
    expect(seen.headers['anthropic-version']).toBeTruthy();
    expect(seen.headers.Authorization).toBeUndefined();
    P.setProviderModels('anthropic', ['claude-sonnet-5-5']);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
    const { yaml, env } = P.renderGateway(dir);
    expect(yaml).toContain('model_name: "anthropic/claude-sonnet-5-5"');
    expect(yaml).toContain('model: "anthropic/claude-sonnet-5-5"');
    expect(env).toContain('KEY_ANTHROPIC=sk-ant-api-test-9999');
  });
  it('DEV accepts the session (claude:*) or openhands:<configured provider>/<listed model> only', () => {
    expect(P.STEPS.find(s => s.id === 'dev')?.engine).toBe(true);
    expect(P.validateModels({ dev: 'claude:claude-opus-5-5' })).toEqual([]);
    expect(P.validateModels({ dev: 'openhands:anthropic/claude-sonnet-5-5' })).toEqual([]);
    expect(P.validateModels({ dev: 'openhands:anthropic/claude-nope' })).toEqual(['dev: model claude-nope không có trong danh sách của anthropic']);
    expect(P.validateModels({ dev: 'openhands:mistral/large' })).toEqual(['dev: nhà cung cấp mistral chưa cấu hình']);
    expect(P.validateModels({ dev: 'openhands:bad' })).toEqual(['dev: dạng đúng là openhands:<nhà cung cấp>/<model>']);
    expect(P.validateModels({ 'code-review': 'openhands:anthropic/claude-sonnet-5-5' })).toEqual(['code-review: OpenHands chỉ dùng cho bước DEV']);
    expect(P.usesGateway({ dev: 'openhands:anthropic/claude-sonnet-5-5' })).toBe(true);
  });
});
