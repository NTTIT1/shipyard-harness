import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { HARNESS_ROOT, LANES_ROOT } from './config.js';
import { readProviders, claudeEnv, claudeAuthFailed, CLAUDE_AUTH_ERR } from './providers.js';
import { gatewayEnv } from './airoute.js';
import { recordSessionResult, recordRateLimit, readLaneContext, readPlan } from './usage.js';
import { LIMIT_RE, wakeTime, resetFromPlan, hhmm } from './limitwake.js';

// One Agent SDK session per lane, driving /ship-feature. Streaming input keeps the
// session open across turns, so background tasks (run-step.sh, sleeps) re-invoke
// it exactly as in a terminal session. Every message is filtered into a small
// chat event, persisted to run/laneN/chat.jsonl (redacted) and pushed to SSE.

let deps = {
  query: sdkQuery,
  setNeedsAction: () => {},
  claudeBin: process.env.CLAUDE_BIN || path.join(process.env.HOME || '', '.local/bin/claude'),
  laneContext: readLaneContext,
  teamRules: readTeamRules,
  claudeEnv,
  gatewayEnv,
  authFailed: claudeAuthFailed,
  setNotes: () => {},
  laneStatus: () => '',
  readPlan,
  now: () => new Date(),
};

/** bin/team_rules.py output for a lane checkout ('' when the project has no AI team or on error). */
export function readTeamRules(cwd, step, branch = process.env.INTEGRATION_BRANCH || 'development') {
  const r = spawnSync('python3', [path.join(HARNESS_ROOT, 'bin', 'team_rules.py'), cwd, step, branch], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}
export function configureSessions(d) { deps = { ...deps, ...d }; }

const root = () => process.env.HARNESS_ROOT || HARNESS_ROOT;
const lanesRoot = () => process.env.LANES_ROOT || LANES_ROOT;
const runDir = n => path.join(root(), 'run', `lane${n}`);
const chatFile = n => path.join(runDir(n), 'chat.jsonl');
const sessionFile = n => path.join(runDir(n), 'session.json');
const wakeFile = n => path.join(runDir(n), 'limit-wake.json');

const live = new Map();      // n -> { q, input, pending }
const wakes = new Map();     // n -> timer of the wake-up after a Claude usage limit
const listeners = new Map(); // n -> Set<fn>
const seqs = new Map();

const KEY_SHAPES = /(sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,})/g;
export function redact(text) {
  let s = String(text ?? '');
  try {
    const { providers, gateway_key } = readProviders();
    for (const v of [gateway_key, ...Object.values(providers).map(p => p.api_key)]) {
      if (v && v.length >= 6) s = s.split(v).join('***');
    }
  } catch { /* unreadable providers.json: fall back to key-shape redaction only */ }
  return s.replace(KEY_SHAPES, '***');
}

class InputQueue {
  constructor() { this.items = []; this.waiters = []; this.closed = false; }
  push(text) {
    const msg = { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: text } };
    const w = this.waiters.shift();
    if (w) w({ value: msg, done: false }); else this.items.push(msg);
  }
  close() { this.closed = true; for (const w of this.waiters.splice(0)) w({ value: undefined, done: true }); }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift(), done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise(r => this.waiters.push(r));
      },
    };
  }
}

function emit(n, ev) {
  const seq = (seqs.get(n) || 0) + 1;
  seqs.set(n, seq);
  const full = { seq, ts: new Date().toISOString(), ...ev };
  if (full.text !== undefined) full.text = redact(full.text);
  if (full.summary !== undefined) full.summary = redact(full.summary);
  try {
    fs.mkdirSync(runDir(n), { recursive: true });
    fs.appendFileSync(chatFile(n), JSON.stringify(full) + '\n');
  } catch { /* log unwritable: still notify listeners */ }
  for (const fn of listeners.get(n) || []) { try { fn(full); } catch { /* listener gone */ } }
}

function simplify(m) {
  const out = [];
  if (m.type === 'system' && m.subtype === 'init') out.push({ kind: 'system', text: `phiên chạy (${m.model || ''})` });
  else if (m.type === 'system' && m.subtype === 'task_notification') out.push({ kind: 'system', text: 'tác vụ nền đã xong' });
  else if (m.type === 'assistant') {
    for (const c of m.message?.content || []) {
      if (c.type === 'text' && c.text.trim()) out.push({ kind: 'assistant', text: c.text });
      if (c.type === 'tool_use' && c.name !== 'AskUserQuestion')
        out.push({ kind: 'tool', name: c.name, summary: JSON.stringify(c.input).slice(0, 200) });
    }
  } else if (m.type === 'result') out.push({ kind: 'result', text: String(m.result || m.subtype || '').slice(0, 2000) });
  return out;
}

function waitForUser(n, ev, signal) {
  const s = live.get(n);
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    s.pending = { id, kind: ev.kind, resolve, reject };
    deps.setNeedsAction(n, ev.kind === 'question' ? 'answer' : 'permission');
    emit(n, { ...ev, id });
    signal?.addEventListener('abort', () => { if (s.pending?.id === id) clearPending(n); });
  });
}

function clearPending(n) {
  const s = live.get(n);
  if (s?.pending) { s.pending = null; deps.setNeedsAction(n, ''); }
}

async function canUseTool(n, name, input, { signal }) {
  if (name === 'AskUserQuestion') {
    const answers = await waitForUser(n, { kind: 'question', questions: input.questions }, signal);
    return { behavior: 'allow', updatedInput: { ...input, answers } };
  }
  const allow = await waitForUser(n, { kind: 'permission', tool: name, summary: JSON.stringify(input).slice(0, 300) }, signal);
  return allow
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: 'Người dùng từ chối trên dashboard' };
}

export function startSession(n, { model, effort, prompt, resume }) {
  if (live.has(n)) throw new Error('busy');
  cancelLimitWake(n);
  const input = new InputQueue();
  if (prompt) input.push(prompt);
  // "claude:<id>" / "<id>" = Claude on this machine's account (or API key); "<provider>:<model>" (Gemini…)
  // = the same Claude Code through the LiteLLM gateway, every model name mapped to that one.
  const sep = String(model || '').indexOf(':');
  const prov = sep < 0 ? 'claude' : model.slice(0, sep);
  const mid = sep < 0 ? model : model.slice(sep + 1);
  const viaGateway = prov !== 'claude';
  const options = {
    cwd: path.join(lanesRoot(), `lane${n}`),
    model: viaGateway ? `${prov}/${mid}` : mid,
    permissionMode: 'auto',
    pathToClaudeCodeExecutable: deps.claudeBin,
    canUseTool: (name, inp, opts) => canUseTool(n, name, inp, opts),
    // The person's own login, or the Anthropic API key when "Nhà cung cấp AI" says so.
    env: viaGateway ? deps.gatewayEnv(`${prov}/${mid}`) : deps.claudeEnv(),
  };
  const usesKey = !!options.env.ANTHROPIC_API_KEY;
  const keyFailed = text => {
    if (!usesKey || !CLAUDE_AUTH_ERR.test(String(text || ''))) return;
    deps.authFailed(String(text).slice(0, 300));
    emit(n, { kind: 'system', text: 'API key Anthropic lỗi (sai key hoặc hết tiền) — dừng phiên rồi mở lại sẽ chạy bằng tài khoản đăng nhập.' });
  };
  if (effort && !viaGateway) options.effort = effort;   // a Claude setting
  if (resume) options.resume = resume;
  // Project AI-team rules for the developer role, same as run-step.sh gives sub-steps.
  const rules = deps.teamRules(options.cwd, 'main');
  if (rules) options.extraArgs = { 'append-system-prompt': rules };
  const q = deps.query({ prompt: input, options });
  live.set(n, { q, input, pending: null });
  try { if (prompt) emit(n, { kind: 'user', text: prompt }); } catch { /* never strand the lane */ }
  (async () => {
    try {
      for await (const m of q) {
        if (m.type === 'system' && m.subtype === 'init' && m.session_id) {
          fs.mkdirSync(runDir(n), { recursive: true });
          fs.writeFileSync(sessionFile(n), JSON.stringify({ session_id: m.session_id, model, effort: effort || '', started_at: new Date().toISOString() }) + '\n');
        }
        try { trackUsage(n, m); } catch { /* accounting must never break the lane */ }
        if (m.type === 'result' && m.is_error) keyFailed(m.result);
        if (m.type === 'result') onTurnEnd(n, m);
        track(n, m);
        for (const ev of simplify(m)) emit(n, ev);
      }
    } catch (e) {
      if (!live.get(n)?.stopping) emit(n, { kind: 'system', text: `lỗi phiên: ${e.message}` });
      keyFailed(e.message);
    } finally {
      clearPending(n);
      live.delete(n);
      emit(n, { kind: 'ended' });
    }
  })().catch(() => {});
}

function trackUsage(n, m) {
  if (m.type === 'rate_limit_event') recordRateLimit(m.rate_limit_info);
  if (m.type === 'result' && m.modelUsage && m.session_id) recordSessionResult(n, m.session_id, m.modelUsage, deps.laneContext(n) || {});
}

/**
 * A turn that ended on Claude's usage limit — the session's own reply says so, or the lane is blocked
 * while the plan's window is refused (a role step died of it) — wakes the lane when the window resets.
 */
function onTurnEnd(n, m) {
  const text = String(m.result || '');
  const plan = deps.readPlan();
  const refused = !!resetFromPlan(plan, deps.now());
  if (!LIMIT_RE.test(text) && !(refused && deps.laneStatus(n) === 'blocked')) return;
  scheduleLimitWake(n, wakeTime(text, plan, deps.now()));
}

/** Wake lane n at `at` (persisted, so a dashboard restart keeps it). */
export function scheduleLimitWake(n, at) {
  fs.mkdirSync(runDir(n), { recursive: true });
  fs.writeFileSync(wakeFile(n), JSON.stringify({ at: at.toISOString() }) + '\n');
  deps.setNotes(n, `Hết lượt Claude — tự chạy lại lúc ${hhmm(at)}`);
  emit(n, { kind: 'system', text: `Tài khoản Claude hết lượt — dashboard sẽ tự chạy tiếp lane lúc ${hhmm(at)}.` });
  arm(n, at.getTime() - deps.now().getTime());
}

function arm(n, ms) {
  clearTimeout(wakes.get(n));
  const t = setTimeout(() => wakeLane(n), Math.max(0, ms));
  t.unref?.();
  wakes.set(n, t);
}

export function cancelLimitWake(n) {
  clearTimeout(wakes.get(n));
  wakes.delete(n);
  try { fs.rmSync(wakeFile(n), { force: true }); } catch { /* nothing to cancel */ }
}

export function limitWakeAt(n) {
  try { return JSON.parse(fs.readFileSync(wakeFile(n), 'utf8')).at || null; } catch { return null; }
}

// A resume nudge, never an approval: a spec waiting for the human (Stage 0c) stays waiting.
const WAKE_MSG = 'Lượt dùng Claude đã hồi — dashboard tự đánh thức lane sau khi hết lượt (đây KHÔNG phải người duyệt). '
  + 'Đọc lại lane state và làm tiếp đúng bước đang dở; bước nào đã chết vì hết lượt thì chạy lại bước đó. '
  + 'Đang chờ người duyệt thì vẫn chờ.';

function wakeLane(n) {
  cancelLimitWake(n);
  deps.setNotes(n, '');
  try {
    if (live.has(n)) { sendMessage(n, WAKE_MSG); return; }
    const info = sessionInfo(n);
    if (info) startSession(n, { model: info.model, effort: info.effort || undefined, prompt: WAKE_MSG, resume: info.session_id });
  } catch (e) {
    emit(n, { kind: 'system', text: `không tự chạy lại được: ${e.message} — gõ continue để chạy tiếp` });
  }
}

/** Re-arm the wake-ups saved before a dashboard restart (one already due fires right away). */
export function restoreLimitWakes() {
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(root(), 'run')); } catch { return; }
  for (const d of dirs) {
    const n = Number(/^lane(\d+)$/.exec(d)?.[1]);
    const at = n ? limitWakeAt(n) : null;
    if (at && !Number.isNaN(new Date(at).getTime())) {
      arm(n, Math.max(5000, new Date(at).getTime() - deps.now().getTime()));
    }
  }
}

export function sendMessage(n, text) {
  const s = live.get(n);
  if (!s) throw new Error('no session');
  if (text !== WAKE_MSG) cancelLimitWake(n);
  s.input.push(text);
  emit(n, { kind: 'user', text });
}

export function answer(n, id, { answers, allow }) {
  const s = live.get(n);
  if (!s?.pending || s.pending.id !== id) throw new Error('no such pending request');
  const { resolve, kind } = s.pending;
  clearPending(n);
  emit(n, { kind: 'answered', id, text: kind === 'question' ? JSON.stringify(answers) : (allow ? 'cho phép' : 'từ chối') });
  resolve(kind === 'question' ? answers : !!allow);
}

export function stopSession(n) {
  const s = live.get(n);
  if (!s) return;
  s.stopping = true;
  const rejectPending = s.pending?.reject;
  clearPending(n);
  rejectPending?.(new Error('stopped'));
  try { s.q.interrupt?.(); } catch { /* already stopping */ }
  s.input.close();
}

export function stopAll() { for (const n of [...live.keys()]) stopSession(n); }
export function isRunning(n) { return live.has(n); }

export function sessionInfo(n) {
  try { return JSON.parse(fs.readFileSync(sessionFile(n), 'utf8')); } catch { return null; }
}

/** Is the session doing something: a turn in progress, or a background task it will wake up for. */
function track(n, m) {
  const s = live.get(n);
  if (!s) return;
  s.working = m.type !== 'result';
  if (m.type === 'system' && m.subtype === 'task_notification') s.bg = Math.max(0, (s.bg || 0) - 1);
  if (m.type === 'assistant') {
    for (const c of m.message?.content || []) if (c.type === 'tool_use' && c.input?.run_in_background) s.bg = (s.bg || 0) + 1;
  }
}

export function brief(n) {
  const s = live.get(n);
  return {
    session_running: !!s,
    session_active: !!s && (!!s.working || (s.bg || 0) > 0),
    session_resumable: !s && !!sessionInfo(n),
    pending_kind: s?.pending?.kind || '',
  };
}

export function history(n) {
  try {
    return fs.readFileSync(chatFile(n), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

export function subscribe(n, fn) {
  if (!listeners.has(n)) listeners.set(n, new Set());
  listeners.get(n).add(fn);
  return () => listeners.get(n)?.delete(fn);
}
