import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HARNESS_ROOT } from './config.js';
import { normalizeEfforts } from './usage.js';

// Non-Claude providers reachable through the LiteLLM gateway. `litellm` is the
// LiteLLM model prefix; models are listed explicitly (from "Kiểm tra") rather
// than wildcard-routed so a typo fails at assign time, not mid-pipeline.
export const CATALOG = {
  // Claude through the Anthropic API (API key from console.anthropic.com) — used by OpenHands for
  // DEV; Claude Code roles keep running on the machine's own Claude login.
  anthropic:  { label: 'Anthropic (Claude API)', litellm: 'anthropic', listUrl: 'https://api.anthropic.com/v1/models', auth: 'x-api-key', workspace: true },
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
  // The lane's main session: Claude, or another provider's model through the LiteLLM gateway (never OpenHands).
  { id: 'main', label: 'Phiên chính' },
  // DEV implementation engine: claude:* = the main session codes (default); openhands:<provider>/<model>
  // = OpenHands in a sandbox through the gateway (bin/openhands-step.sh).
  { id: 'dev', label: 'DEV — viết code', engine: true },
  { id: 'pm', label: 'PM (AI)' },
  { id: 'ba', label: 'BA (AI)' },
  { id: 'arch', label: 'Kiến trúc sư (AI)' },
  { id: 'design', label: 'Designer (AI)', warn: 'cần Chrome để chụp mockup' },
  { id: 'test', label: 'Tester (AI)', openhands: true },  // may run in the OpenHands sandbox
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
  const out = { providers: doc.providers || {}, gateway_key: doc.gateway_key || '' };
  if (doc.claude_auth === 'api_key') out.claude_auth = 'api_key';
  return out;
}

// Which account Claude Code runs on — same rules as bin/claude_auth.py (lanes use that one):
// 'login' (default) = the machine's own Claude login; 'api_key' = the Anthropic API key from this page
// when there is a usable one, back to the login for an hour after the key fails.
const CLAUDE_AUTH_FAIL_TTL = 3600_000;
export const CLAUDE_AUTH_ERR = /invalid (x-)?api.?key|authentication_error|credit balance is too low|API Error: 401/i;
const authFailPath = () => path.join(root(), 'run', 'claude_auth_fail.json');

export function setClaudeAuth(mode) {
  if (!['login', 'api_key'].includes(mode)) throw new Error('claude_auth phải là login hoặc api_key');
  const doc = readProviders();
  if (mode === 'api_key') doc.claude_auth = 'api_key'; else delete doc.claude_auth;
  if (!doc.gateway_key) doc.gateway_key = 'sk-gw-' + crypto.randomBytes(24).toString('hex');
  writeSecretJson(providersPath(), doc);
  if (mode === 'login') fs.rmSync(authFailPath(), { force: true });
  return claudeAuthStatus();
}

/** The key Claude Code should use now ('' = the login). Never logged or sent to the browser. */
export function claudeAuthKey(now = Date.now()) {
  let doc;
  try { doc = readProviders(); } catch { return ''; }   // unreadable config: the login, never a crash
  if (doc.claude_auth !== 'api_key') return '';
  const key = doc.providers.anthropic?.api_key || '';
  if (!key.startsWith('sk-ant-api')) return '';
  const failed = readJson(authFailPath(), {});
  if (failed.at && now - failed.at * 1000 < CLAUDE_AUTH_FAIL_TTL) return '';
  return key;
}

export function claudeAuthFailed(reason) {
  fs.mkdirSync(path.dirname(authFailPath()), { recursive: true });
  fs.writeFileSync(authFailPath(), JSON.stringify({ at: Date.now() / 1000, reason: String(reason || '').slice(0, 300) }));
}

/** For the page: the chosen mode and what is actually used right now, with why. */
export function claudeAuthStatus(now = Date.now()) {
  const doc = readProviders();
  const mode = doc.claude_auth === 'api_key' ? 'api_key' : 'login';
  const key = doc.providers.anthropic?.api_key || '';
  const failed = readJson(authFailPath(), {});
  let using = 'login', why = '';
  if (mode === 'api_key') {
    if (!key) why = 'Chưa nhập API key Anthropic — đang dùng tài khoản đăng nhập.';
    else if (!key.startsWith('sk-ant-api')) why = 'Claude Code chỉ nhận key dạng sk-ant-api… — đang dùng tài khoản đăng nhập.';
    else if (failed.at && now - failed.at * 1000 < CLAUDE_AUTH_FAIL_TTL) {
      why = `Key vừa lỗi (${failed.reason || 'không rõ'}) — tạm dùng tài khoản đăng nhập tới ${new Date(failed.at * 1000 + CLAUDE_AUTH_FAIL_TTL).toLocaleTimeString('vi-VN')}.`;
    } else using = 'api_key';
  }
  return { mode, using, why };
}

/** Environment for a Claude Code process: the key when it should be used, never an inherited one. */
export function claudeEnv(base = process.env) {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  const key = claudeAuthKey();
  if (key) env.ANTHROPIC_API_KEY = key;
  return env;
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
    // Keys not scoped to a workspace (e.g. sk-ant-usr…) must name one on every call.
    if (p.workspace_id !== undefined && p.workspace_id !== '' && !/^wrkspc_[A-Za-z0-9]{6,64}$/.test(String(p.workspace_id).trim())) {
      throw new Error('Workspace ID có dạng wrkspc_…');
    }
    const cur = doc.providers[id] || {};
    const next = { ...cur };
    if (p.api_key) next.api_key = p.api_key;
    if (p.base_url !== undefined) next.base_url = p.base_url;
    if (p.label !== undefined) next.label = p.label;
    if (p.workspace_id !== undefined) next.workspace_id = String(p.workspace_id).trim();
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
      workspace: !!cat.workspace, workspace_id: p?.workspace_id || '',
      base_url: p?.base_url || '',
      models: p?.models || [],
      custom: !CATALOG[id],
      needsUrl: !!cat.needsUrl || !CATALOG[id],
      keyless: !!cat.keyless,
    };
  }
  return out;
}

function normalizeEntry(d = {}, eff = {}, fallback = null) {
  const out = {};
  for (const s of STEPS) out[s.id] = d[s.id] || (fallback ? fallback[s.id] : DEFAULT_MODEL);
  const defaultImpl = fallback ? fallback.impl_agents : 1;
  out.impl_agents = Number.isInteger(d.impl_agents) && d.impl_agents > 0 ? d.impl_agents : defaultImpl;
  // Lane-level workflow choices ({STEP: REQUIRED|AUTO|SKIP}); only lanes carry them, the global default has none.
  if (fallback) out.gates = cleanGates(d.gates);
  try {
    const normEff = normalizeEfforts(eff, STEPS.map(s => s.id));
    out.effort = fallback ? { ...(fallback.effort || {}), ...normEff } : normEff;
  } catch {
    out.effort = fallback ? { ...(fallback.effort || {}) } : {};
  }
  return out;
}

const GATE_STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
function cleanGates(g) {
  const out = {};
  for (const [k, v] of Object.entries(g && typeof g === 'object' ? g : {})) {
    const step = String(k).toUpperCase(), mode = String(v || '').toUpperCase();
    if (GATE_STEPS.includes(step) && ['REQUIRED', 'AUTO', 'SKIP'].includes(mode) && !(step === 'DEV' && mode === 'SKIP')) out[step] = mode;
  }
  return out;
}

export function readModelDefaults() {
  const doc = readJson(modelsPath(), {});
  return normalizeEntry(doc.defaults || {}, doc.effort || {}, null);
}

// The product studio's roles (chat from an idea to a project) have their own models, so choosing
// Gemini for them never changes what the lanes run. Missing = Claude Opus on this machine.
export const STUDIO_ROLES = [
  { id: 'pm', label: 'AI PM — yêu cầu sản phẩm' },
  { id: 'arch', label: 'AI Kiến trúc sư — công nghệ, hệ thống, quy trình' },
  { id: 'design', label: 'AI Thiết kế — mockup giao diện' },
];
export function readStudioModels() {
  const doc = readJson(modelsPath(), {});
  return Object.fromEntries(STUDIO_ROLES.map(r => [r.id, doc.studio?.[r.id] || DEFAULT_MODEL]));
}
export function writeStudioModels(models = {}) {
  const pick = Object.fromEntries(STUDIO_ROLES.map(r => [r.id, models[r.id] || DEFAULT_MODEL]));
  // Same rules as a lane's role step (pm/arch/design): Claude, or a configured provider's listed model.
  const errs = validateModels(pick).map(e => e.replace(/^(pm|arch|design):/, 'Chat ý tưởng — $1:'));
  if (Object.values(pick).some(v => v.startsWith('openhands:'))) errs.push('Chat ý tưởng không dùng OpenHands');
  if (errs.length) throw new Error(errs.join('; '));
  const prev = readJson(modelsPath(), {});
  fs.mkdirSync(path.dirname(modelsPath()), { recursive: true });
  fs.writeFileSync(modelsPath(), JSON.stringify({ ...prev, studio: pick }, null, 2) + '\n');
  return pick;
}

export function writeModelDefaults(defaults) {
  const prev = readJson(modelsPath(), {});
  const errs = validateModels(Object.fromEntries(STEPS.map(s => [s.id, defaults[s.id] || DEFAULT_MODEL])));
  if (errs.length) throw new Error(errs.join('; '));
  const effort = normalizeEfforts(defaults.effort, STEPS.map(s => s.id));
  const impl = parseInt(defaults.impl_agents, 10);
  const doc = {
    ...prev,
    defaults: { ...Object.fromEntries(STEPS.map(s => [s.id, defaults[s.id] || DEFAULT_MODEL])), impl_agents: impl > 0 ? impl : 1 },
    effort,
  };
  fs.mkdirSync(path.dirname(modelsPath()), { recursive: true });
  fs.writeFileSync(modelsPath(), JSON.stringify(doc, null, 2) + '\n');
}

export function readAllLaneDefaults() {
  const doc = readJson(modelsPath(), {});
  const base = normalizeEntry(doc.defaults || {}, doc.effort || {}, null);
  const lanes = doc.lanes || {};
  const out = {};
  for (const [k, v] of Object.entries(lanes)) {
    if (!v || typeof v !== 'object') continue;
    out[k] = normalizeEntry(v.models || v, v.effort || {}, base);
  }
  return out;
}

export function readLaneModelDefaults(n) {
  const all = readAllLaneDefaults();
  return all[String(n)] || readModelDefaults();
}

export function writeLaneModelDefaults(n, config) {
  const key = String(n);
  if (!/^[1-9]\d*$/.test(key)) throw new Error(`lane không hợp lệ: ${n}`);
  const prev = readJson(modelsPath(), {});
  const lanes = { ...(prev.lanes || {}) };
  if (!config || config.reset) {
    delete lanes[key];
  } else {
    const base = readModelDefaults();
    const stepMap = Object.fromEntries(STEPS.map(s => [s.id, config[s.id] || (config.models || {})[s.id] || base[s.id] || DEFAULT_MODEL]));
    const errs = validateModels(stepMap);
    if (errs.length) throw new Error(errs.join('; '));
    const effort = normalizeEfforts(config.effort, STEPS.map(s => s.id));
    const impl = parseInt(config.impl_agents, 10);
    lanes[key] = { ...stepMap, impl_agents: impl > 0 && impl <= 9 ? impl : (base.impl_agents || 1), effort,
      // Screens that edit only models leave the lane's workflow choices alone.
      gates: cleanGates(config.gates !== undefined ? config.gates : (lanes[key] || {}).gates) };
  }
  const doc = { ...prev, lanes };
  fs.mkdirSync(path.dirname(modelsPath()), { recursive: true });
  fs.writeFileSync(modelsPath(), JSON.stringify(doc, null, 2) + '\n');
  return readLaneModelDefaults(n);
}

export function readFeatureModels() {
  const doc = readJson(modelsPath(), {});
  const base = normalizeEntry(doc.defaults || {}, doc.effort || {}, null);
  const feats = doc.features || {};
  const out = {};
  for (const [k, v] of Object.entries(feats)) {
    if (!v || typeof v !== 'object') continue;
    out[k] = normalizeEntry(v.models || v, v.effort || {}, base);
  }
  return out;
}

export function writeFeatureModels(featureKey, config) {
  const key = String(featureKey || '').trim();
  if (!key || key.length > 200) throw new Error('feature key không hợp lệ');
  const prev = readJson(modelsPath(), {});
  const features = { ...(prev.features || {}) };
  if (!config || config.reset) {
    delete features[key];
  } else {
    const base = readModelDefaults();
    const stepMap = Object.fromEntries(STEPS.map(s => [s.id, config[s.id] || (config.models || {})[s.id] || base[s.id] || DEFAULT_MODEL]));
    const errs = validateModels(stepMap);
    if (errs.length) throw new Error(errs.join('; '));
    const effort = normalizeEfforts(config.effort, STEPS.map(s => s.id));
    const impl = parseInt(config.impl_agents, 10);
    features[key] = { ...stepMap, impl_agents: impl > 0 && impl <= 9 ? impl : (base.impl_agents || 1), effort };
  }
  const doc = { ...prev, features };
  fs.mkdirSync(path.dirname(modelsPath()), { recursive: true });
  fs.writeFileSync(modelsPath(), JSON.stringify(doc, null, 2) + '\n');
  return readFeatureModels()[key] || null;
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
    if ((meta.engine || meta.openhands) && prov === 'openhands') {
      const [gp, ...rest] = model.split('/');
      const gm = rest.join('/');
      const p = providers[gp];
      if (!gp || !gm) errs.push(`${step}: dạng đúng là openhands:<nhà cung cấp>/<model>`);
      else if (!isConfigured(gp, p)) errs.push(`${step}: nhà cung cấp ${gp} chưa cấu hình`);
      else if (!(p.models || []).includes(gm)) errs.push(`${step}: model ${gm} không có trong danh sách của ${gp}`);
      continue;
    }
    if (prov === 'openhands') { errs.push(`${step}: OpenHands chỉ dùng cho bước DEV và TEST`); continue; }
    if (prov === 'claude') {
      if (!CLAUDE_MODELS.some(m => m.id === model)) errs.push(`${step}: model Claude ${model} không hợp lệ`);
      continue;
    }
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
      if (p.workspace_id) lines.push('      extra_headers:', `        anthropic-workspace-id: ${q(p.workspace_id)}`);
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
  } else if (cat.auth === 'x-api-key') {
    url = `${cat.listUrl}?limit=1000`;
    headers['x-api-key'] = p.api_key || '';
    headers['anthropic-version'] = '2023-06-01';
    if (p.workspace_id) headers['anthropic-workspace-id'] = p.workspace_id;
  } else {
    url = cat.listUrl;
    headers.Authorization = `Bearer ${p.api_key || ''}`;
  }
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    // Surface the provider's own reason (e.g. "not scoped to a workspace") instead of a bare status.
    let why = '';
    try { why = (await r.json())?.error?.message || ''; } catch { /* not JSON */ }
    throw new Error(`HTTP ${r.status}${why ? ` — ${why}` : ''}`);
  }
  const j = await r.json();
  let ids;
  if (cat?.keyless) ids = (j.models || []).map(m => m.name);
  else if (cat?.auth === 'query-key') ids = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  else ids = (j.data || []).map(m => m.id);
  return [...new Set(ids)].sort();
}
