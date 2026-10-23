import { readStudioModels, readProviders } from './providers.js';
import { ensureGateway, GATEWAY_URL } from './gateway.js';
import { childEnv } from './scaffold/util.js';

/**
 * How a product-studio role reaches the model chosen for it in "Nhà cung cấp AI → Chat ý tưởng": a Claude model runs on the machine's own account (or the API key, see
 * providers.claudeEnv via util.run); any other provider (Gemini, OpenAI…) goes through the LiteLLM
 * gateway — the same route the lanes' run-step.sh takes — so it uses no Claude quota.
 * Returns { model, env, gateway, label }: pass `--model model` and, when `env` is set, run with it.
 */
export async function modelRoute(step, fallback = 'claude:claude-opus-5-5') {
  let value = fallback;
  try { value = readStudioModels()?.[step] || fallback; } catch { /* unreadable config: the fallback */ }
  const i = value.indexOf(':');
  const prov = i < 0 ? 'claude' : value.slice(0, i);
  const model = i < 0 ? value : value.slice(i + 1);
  if (prov === 'claude' || prov === 'openhands' || !model) {
    const f = fallback.slice(fallback.indexOf(':') + 1);
    return { model: prov === 'claude' && model ? model : f, env: null, gateway: false, label: prov === 'claude' ? value : fallback };
  }
  const gw = await ensureGateway();
  if (!gw.ok) throw new Error(`không bật được cổng LiteLLM cho ${value}: ${String(gw.output || '').split('\n').filter(Boolean).pop() || 'lỗi không rõ'}`);
  const key = readProviders().gateway_key;
  if (!key) throw new Error('chưa có gateway_key — mở Nhà cung cấp AI và bấm Lưu');
  const alias = `${prov}/${model}`;
  // Every model name Claude Code may ask for maps to the chosen one; the gateway key, never a real key.
  const env = { ...childEnv(), ANTHROPIC_BASE_URL: GATEWAY_URL, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: alias,
    ANTHROPIC_SMALL_FAST_MODEL: alias, ANTHROPIC_DEFAULT_HAIKU_MODEL: alias, ANTHROPIC_DEFAULT_SONNET_MODEL: alias,
    ANTHROPIC_DEFAULT_OPUS_MODEL: alias };
  return { model: alias, env, gateway: true, label: value };
}

/** Environment for a Claude Code process whose every model is `alias` (provider/model) on the gateway. */
export function gatewayEnv(alias, base = process.env) {
  const key = readProviders().gateway_key;
  if (!key) throw new Error('chưa có gateway_key — mở Nhà cung cấp AI và bấm Lưu');
  const env = { ...base, ANTHROPIC_BASE_URL: GATEWAY_URL, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: alias,
    ANTHROPIC_SMALL_FAST_MODEL: alias, ANTHROPIC_DEFAULT_HAIKU_MODEL: alias, ANTHROPIC_DEFAULT_SONNET_MODEL: alias,
    ANTHROPIC_DEFAULT_OPUS_MODEL: alias };
  delete env.ANTHROPIC_API_KEY;
  return env;
}
