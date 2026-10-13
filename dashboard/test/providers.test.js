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
