import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HARNESS_ROOT } from './config.js';

// Non-Claude providers reachable through the LiteLLM gateway. `litellm` is the
// LiteLLM model prefix; models are listed explicitly (from "Kiểm tra") rather
// than wildcard-routed so a typo fails at assign time, not mid-pipeline.
export const CATALOG = {
  openai:     { label: 'OpenAI',         litellm: 'openai',      listUrl: 'https://api.openai.com/v1/models', auth: 'bearer' },
  gemini:     { label: 'Google Gemini',  litellm: 'gemini',      listUrl: 'https://generativelanguage.googleapis.com/v1beta/models', auth: 'query-key' },
  openrouter: { label: 'OpenRouter',     litellm: 'openrouter',  listUrl: 'https://openrouter.ai/api/v1/models', auth: 'bearer' },
  deepseek:   { label: 'DeepSeek',       litellm: 'deepseek',    listUrl: 'https://api.deepseek.com/models', auth: 'bearer' },
  mistral:    { label: 'Mistral',        litellm: 'mistral',     listUrl: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  groq:       { label: 'Groq',           litellm: 'groq',        listUrl: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  xai:        { label: 'xAI',            litellm: 'xai',         listUrl: 'https://api.x.ai/v1/models', auth: 'bearer' },
  ollama:     { label: 'Ollama (local)', litellm: 'ollama_chat', needsUrl: true, keyless: true, defaultUrl: 'http://127.0.0.1:11434' },
};

export const CLAUDE_MODELS = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];

export const STEPS = [
  { id: 'main', label: 'Phiên chính', claudeOnly: true },
  { id: 'plan-critic', label: 'Phản biện plan' },
  { id: 'impl-worker', label: 'Code song song', warn: 'cần sửa file + chạy test' },
  { id: 'code-review', label: 'Code review' },
  { id: 'qc-local', label: 'QC local', warn: 'cần MCP trình duyệt' },
  { id: 'senior-gate', label: 'Senior gate' },
  { id: 'ticketer', label: 'Ticket', warn: 'cần MCP tracker' },
  { id: 'dev-qc', label: 'Dev-QC', warn: 'cần MCP trình duyệt' },
];

export const DEFAULT_MODEL = 'claude:claude-opus-5-5';
const CUSTOM_RE = /^custom-[a-z0-9-]{1,30}$/;

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
export const providersPath = () => path.join(root(), 'config', 'providers.json');
export const modelsPath = () => path.join(root(), 'config', 'models.json');

// Missing file => fallback. Any other failure (parse error, EACCES, ...) must
// throw: swallowing it would make the next write rewrite the file from {} and
// silently drop every API key and regenerate the gateway key.
function readJson(p, fallback) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`cannot read ${p}: ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`cannot read ${p}: ${err.message}`);
  }
}
function writeSecretJson(p, doc) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p);
  fs.chmodSync(p, 0o600);
}

export function readProviders() {
  const doc = readJson(providersPath(), {});
  return { providers: doc.providers || {}, gateway_key: doc.gateway_key || '' };
}

function assertOneLine(v, what) {
  if (typeof v === 'string' && /[\r\n]/.test(v)) throw new Error(`${what} must not contain a newline`);
}

export function writeProviders(patch) {
  const doc = readProviders();
  for (const [id, p] of Object.entries(patch || {})) {
    if (!CATALOG[id] && !CUSTOM_RE.test(id)) throw new Error(`unknown provider ${id}`);
    if (p.remove) { delete doc.providers[id]; continue; }
    assertOneLine(p.api_key, 'api_key'); assertOneLine(p.base_url, 'base_url'); assertOneLine(p.label, 'label');
    const cur = doc.providers[id] || {};
    const next = { ...cur };
    if (p.api_key) next.api_key = p.api_key;
    if (p.base_url !== undefined) next.base_url = p.base_url;
    if (p.label !== undefined) next.label = p.label;
    doc.providers[id] = next;
  }
  if (!doc.gateway_key) doc.gateway_key = 'sk-gw-' + crypto.randomBytes(24).toString('hex');
  writeSecretJson(providersPath(), doc);
}

export function setProviderModels(id, models) {
  const doc = readProviders();
  doc.providers[id] = { ...(doc.providers[id] || {}), models: [...models] };
  if (!doc.gateway_key) doc.gateway_key = 'sk-gw-' + crypto.randomBytes(24).toString('hex');
  writeSecretJson(providersPath(), doc);
}

function isConfigured(id, p) {
  if (!p) return false;
  const cat = CATALOG[id];
  if (cat?.keyless) return !!(p.base_url || cat.defaultUrl);
  return !!p.api_key;
}

export function publicProviders() {
  const { providers } = readProviders();
  const out = {};
  const ids = [...Object.keys(CATALOG), ...Object.keys(providers).filter(id => CUSTOM_RE.test(id))];
  for (const id of ids) {
    const cat = CATALOG[id] || {};
    const p = providers[id];
    out[id] = {
      label: p?.label || cat.label || id,
      configured: isConfigured(id, p),
      key_hint: p?.api_key ? '…' + p.api_key.slice(-4) : '',
      base_url: p?.base_url || '',
      models: p?.models || [],
      custom: !CATALOG[id],
      needsUrl: !!cat.needsUrl || !CATALOG[id],
      keyless: !!cat.keyless,
    };
  }
  return out;
}

export function readModelDefaults() {
  const doc = readJson(modelsPath(), {});
  const d = doc.defaults || {};
  const out = {};
  for (const s of STEPS) out[s.id] = d[s.id] || DEFAULT_MODEL;
  out.impl_agents = Number.isInteger(d.impl_agents) && d.impl_agents > 0 ? d.impl_agents : 1;
  return out;
}

export function writeModelDefaults(defaults) {
  const errs = validateModels(Object.fromEntries(STEPS.map(s => [s.id, defaults[s.id] || DEFAULT_MODEL])));
  if (errs.length) throw new Error(errs.join('; '));
  const impl = parseInt(defaults.impl_agents, 10);
  const doc = { defaults: { ...Object.fromEntries(STEPS.map(s => [s.id, defaults[s.id] || DEFAULT_MODEL])), impl_agents: impl > 0 ? impl : 1 } };
  fs.mkdirSync(path.dirname(modelsPath()), { recursive: true });
  fs.writeFileSync(modelsPath(), JSON.stringify(doc, null, 2) + '\n');
}

function split(v) {
  const i = String(v || '').indexOf(':');
  return i < 0 ? [String(v || ''), ''] : [v.slice(0, i), v.slice(i + 1)];
}

export function validateModels(models) {
  const errs = [];
  const { providers } = readProviders();
  for (const [step, value] of Object.entries(models || {})) {
    const meta = STEPS.find(s => s.id === step);
    if (!meta) { errs.push(`${step}: bước không tồn tại`); continue; }
    const [prov, model] = split(value);
    if (prov === 'claude') {
      if (!CLAUDE_MODELS.some(m => m.id === model)) errs.push(`${step}: model Claude ${model} không hợp lệ`);
      continue;
    }
    if (meta.claudeOnly) { errs.push(`${step}: phiên chính chỉ dùng model Claude`); continue; }
    const p = providers[prov];
    if (!isConfigured(prov, p)) { errs.push(`${step}: nhà cung cấp ${prov} chưa cấu hình`); continue; }
    if (!(p.models || []).includes(model))
      errs.push(`${step}: model ${value} không có trong danh sách (bấm Kiểm tra ở Nhà cung cấp)`);
  }
  return errs;
}

export function usesGateway(models) {
  return Object.values(models || {}).some(v => split(v)[0] !== 'claude');
}

// Containers can't reach the host's 127.0.0.1 — gateway.sh adds host.docker.internal.
function dockerUrl(u) {
  return String(u || '').replace(/^(https?:\/\/)(127\.0\.0\.1|localhost)(?=[:/]|$)/, '$1host.docker.internal');
}
const q = s => JSON.stringify(String(s));
const envName = id => 'KEY_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_');

export function renderGateway(dir) {
  const { providers, gateway_key } = readProviders();
  const lines = ['model_list:'];
  const env = [`LITELLM_MASTER_KEY=${gateway_key}`];
  for (const [id, p] of Object.entries(providers)) {
    if (!isConfigured(id, p)) continue;
    const cat = CATALOG[id];
    const prefix = cat ? cat.litellm : 'openai';
    const base = cat?.needsUrl ? dockerUrl(p.base_url || cat.defaultUrl) : (!cat ? dockerUrl(p.base_url) : '');
    if (p.api_key) env.push(`${envName(id)}=${p.api_key}`);
    for (const m of p.models || []) {
      lines.push(`  - model_name: ${q(`${id}/${m}`)}`);
      lines.push('    litellm_params:');
      lines.push(`      model: ${q(`${prefix}/${m}`)}`);
      if (p.api_key) lines.push(`      api_key: ${q(`os.environ/${envName(id)}`)}`);
      if (base) lines.push(`      api_base: ${q(base)}`);
    }
  }
  if (lines.length === 1) lines[0] = 'model_list: []';
  lines.push('general_settings:', '  master_key: "os.environ/LITELLM_MASTER_KEY"', 'litellm_settings:', '  drop_params: true');
  const yaml = lines.join('\n') + '\n';
  const envText = env.join('\n') + '\n';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'litellm.yaml'), yaml, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'gateway.env'), envText, { mode: 0o600 });
  fs.chmodSync(path.join(dir, 'litellm.yaml'), 0o600);
  fs.chmodSync(path.join(dir, 'gateway.env'), 0o600);
  return { yaml, env: envText };
}

export async function listModels(id, fetchImpl = fetch) {
  const { providers } = readProviders();
  const p = providers[id] || {};
  const cat = CATALOG[id];
  let url; const headers = {};
  if (cat?.keyless) {
    url = `${(p.base_url || cat.defaultUrl).replace(/\/$/, '')}/api/tags`;
  } else if (!cat) {
    url = `${String(p.base_url || '').replace(/\/$/, '')}/models`;
    if (p.api_key) headers.Authorization = `Bearer ${p.api_key}`;
  } else if (cat.auth === 'query-key') {
    url = `${cat.listUrl}?key=${encodeURIComponent(p.api_key || '')}`;
  } else {
    url = cat.listUrl;
    headers.Authorization = `Bearer ${p.api_key || ''}`;
  }
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  let ids;
  if (cat?.keyless) ids = (j.models || []).map(m => m.name);
  else if (cat?.auth === 'query-key') ids = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  else ids = (j.data || []).map(m => m.id);
  return [...new Set(ids)].sort();
}
