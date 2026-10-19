import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

export const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** Only what toolchains need: the dashboard's secrets (JWT_SECRET, tokens…) never reach generators. */
export function childEnv(extra = {}) {
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'JAVA_HOME', 'MAVEN_OPTS', 'GRADLE_USER_HOME',
    'NPM_CONFIG_CACHE', 'UV_CACHE_DIR', 'XDG_CACHE_HOME', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy'];
  const env = {};
  for (const k of keep) if (process.env[k] != null) env[k] = process.env[k];
  return { ...env, CI: '1', NO_COLOR: '1', npm_config_yes: 'true', ...extra };
}

/**
 * Run a command (argv array, never a shell string). Output lines go to `log`.
 * Rejects with the tail of the output when it exits non-zero or times out.
 */
export function run(cmd, args, { cwd, log = () => {}, timeoutMs = 10 * 60_000, env, extraEnv, signal } = {}) {
  return new Promise((resolve, reject) => {
    log(`$ ${[cmd, ...args].join(' ')}`);
    const child = spawn(cmd, args, { cwd, env: env || childEnv(extraEnv), stdio: ['ignore', 'pipe', 'pipe'] });
    const tail = [];
    let buf = '';
    const onData = d => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        log(l);
        tail.push(l);
        if (tail.length > 40) tail.shift();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', e => { clearTimeout(timer); reject(new Error(`${cmd}: ${e.message}`)); });
    child.on('close', (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (buf.trim()) { log(buf); tail.push(buf); }
      if (code === 0) return resolve();
      const why = signal?.aborted ? 'đã huỷ' : sig ? `bị dừng (${sig}, quá ${Math.round(timeoutMs / 1000)}s?)` : `mã lỗi ${code}`;
      reject(Object.assign(new Error(`${cmd} ${args[0] || ''} thất bại: ${why}`), { tail: tail.join('\n') }));
    });
  });
}

/** Write { "rel/path": "content" } under dir; refuses paths that escape it. */
export function writeFiles(dir, files) {
  const root = path.resolve(dir);
  for (const [rel, content] of Object.entries(files)) {
    if (content == null) continue;
    const p = path.resolve(root, rel);
    if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`đường dẫn không hợp lệ: ${rel}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    if (/(^|\/)(mvnw|gradlew)$/.test(rel)) fs.chmodSync(p, 0o755);
  }
}

export function readText(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf8'); } catch { return fallback; }
}

/** "My Shop-API" → "MyShopApi"; used for class and package names. */
export function pascal(s) {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('') || 'App';
}

/** Toolchain probe: { java: { ok, version, major }, node: …, npm: …, uv: …, git: … }. */
export function probeTools(spawnImpl = spawnSync) {
  const probe = (cmd, args, re) => {
    const r = spawnImpl(cmd, args, { encoding: 'utf8', timeout: 15000 });
    if (r.error || r.status !== 0) return { ok: false };
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = re.exec(out);
    const version = m ? m[1] : out.split('\n')[0].trim();
    return { ok: true, version, major: parseInt(version, 10) || 0 };
  };
  return {
    java: probe('java', ['-version'], /version "?(\d+[\d.]*)/),
    node: probe('node', ['--version'], /v?(\d+[\d.]*)/),
    npm: probe('npm', ['--version'], /(\d+[\d.]*)/),
    uv: probe('uv', ['--version'], /uv (\d+[\d.]*)/),
    git: probe('git', ['--version'], /version (\d+[\d.]*)/),
    unzip: probe('unzip', ['-v'], /UnZip (\d+[\d.]*)/),
  };
}

/** npm 9 (Ubuntu's apt package) crashes resolving modern peer deps; newer npm does not need the flag. */
export function npmInstallArgs(tools, extra = []) {
  const args = ['install', '--no-audit', '--no-fund', ...extra];
  if ((tools?.npm?.major || 0) < 10) args.push('--legacy-peer-deps');
  return args;
}
