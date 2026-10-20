import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { HARNESS_ROOT, LANES_ROOT } from './config.js';
import { readProviders } from './providers.js';
import { recordSessionResult, recordRateLimit, readLaneContext } from './usage.js';

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

const live = new Map();      // n -> { q, input, pending }
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
  const input = new InputQueue();
  if (prompt) input.push(prompt);
  const options = {
    cwd: path.join(lanesRoot(), `lane${n}`),
    model,
    permissionMode: 'auto',
    pathToClaudeCodeExecutable: deps.claudeBin,
    canUseTool: (name, inp, opts) => canUseTool(n, name, inp, opts),
  };
  if (effort) options.effort = effort;
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
        for (const ev of simplify(m)) emit(n, ev);
      }
    } catch (e) {
      if (!live.get(n)?.stopping) emit(n, { kind: 'system', text: `lỗi phiên: ${e.message}` });
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

export function sendMessage(n, text) {
  const s = live.get(n);
  if (!s) throw new Error('no session');
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

export function brief(n) {
  const s = live.get(n);
  return {
    session_running: !!s,
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
