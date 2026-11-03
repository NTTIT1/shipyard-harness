// Fullstack projects: one repository with backend/ and frontend/, generated together by the wizard.
// Each part is produced by its own stack generator (in its sub-folder); this module adds what joins
// them: the frontend talks to the backend through Vite's /api proxy (nginx in Docker), one dev.sh runs
// database + backend + frontend, and the root holds the shared README, .env, compose, CI and AI rules.
import fs from 'fs';
import path from 'path';
import { DB_LABEL, dbEnv, dbService, envFile } from './dbs.js';
import { mergeGitignore } from './common.js';
import { plan } from './ci.js';
import { STACK_RULES } from './team.js';
import { readText } from './util.js';
import { dartName } from './stacks/flutter-android.js';

export const BACKEND_STACKS = ['java-spring', 'python-fastapi', 'ts-nestjs'];
export const FRONTEND_STACKS = ['ts-react-vite', 'flutter-android'];
/** Frontends that are a phone app (built to an APK and QC'd on the Android emulator, not served on a port). */
export const MOBILE_STACKS = ['flutter-android'];
export const isMobileStack = id => MOBILE_STACKS.includes(id);
/** The Android application id of a generated app: <org>.<project as a Dart name>. */
export const mobilePackageId = (org, slug) => `${org}.${dartName(slug)}`;
export const FRONTEND_DEV_PORT = 5173;

/** Where each backend answers a cheap "are you up" request (the frontend's status badge calls it). */
export const HEALTH_PATH = { 'java-spring': '/actuator/health', 'python-fastapi': '/health', 'ts-nestjs': '/' };

/** Folder of the frontend half: frontend/ for a web app, mobile/ for a phone app. */
export const subOf = stackId => (isMobileStack(stackId) ? 'mobile' : 'frontend');

/** The parts of a project: one app at the root, or backend/ + frontend/ (or mobile/). */
export function partsOf(spec, root, stackById) {
  if (spec.kind !== 'fullstack') return [{ role: 'app', sub: '', stack: stackById(spec.stack), options: spec.options, dir: root }];
  return [
    { role: 'backend', sub: 'backend', stack: stackById(spec.stack), options: spec.options, dir: path.join(root, 'backend') },
    { role: 'frontend', sub: subOf(spec.frontend.stack), stack: stackById(spec.frontend.stack), options: spec.frontend.options, dir: path.join(root, subOf(spec.frontend.stack)) },
  ];
}

// ── frontend wiring ────────────────────────────────────────────────────────────────────────────

const API_TS = `// Backend base URL: VITE_API_URL when set (another host), otherwise the same-origin /api proxy
// (Vite dev server and the nginx image both forward /api to the backend).
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\\/$/, '') || '/api';

export async function apiGet(path: string): Promise<Response> {
  return fetch(\`\${API_BASE}\${path.startsWith('/') ? path : \`/\${path}\`}\`);
}
`;

const statusTsx = health => `import { useEffect, useState } from 'react';
import { apiGet } from './api';

type State = 'checking' | 'up' | 'down';

/** Shows whether the backend answers — the first thing to check after \`./dev.sh\`. */
export default function BackendStatus() {
  const [state, setState] = useState<State>('checking');
  useEffect(() => {
    let alive = true;
    apiGet('${health}')
      .then(r => { if (alive) setState(r.ok ? 'up' : 'down'); })
      .catch(() => { if (alive) setState('down'); });
    return () => { alive = false; };
  }, []);
  const label = { checking: 'Đang kiểm tra backend…', up: 'Backend đang chạy', down: 'Chưa kết nối được backend' }[state];
  return <p role="status" data-state={state}>{label}</p>;
}
`;

const appTsx = name => `import { useState } from 'react';
import BackendStatus from './BackendStatus';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>${name.replace(/[<>{}`]/g, '')}</h1>
      <BackendStatus />
      <button type="button" onClick={() => setCount(c => c + 1)}>Đã bấm {count} lần</button>
    </main>
  );
}
`;

const statusTest = `import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BackendStatus from './BackendStatus';

afterEach(() => vi.unstubAllGlobals());

describe('BackendStatus', () => {
  it('shows the backend as running when the health check answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<BackendStatus />);
    expect(await screen.findByText('Backend đang chạy')).toBeTruthy();
  });
  it('says so when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<BackendStatus />);
    expect(await screen.findByText('Chưa kết nối được backend')).toBeTruthy();
  });
});
`;

/** Add the /api → backend dev proxy to vite.config (create-vite's defineConfig({ plugins: [...] })). */
export function withApiProxy(viteConfig, backendPort) {
  if (viteConfig.includes("'/api'")) return viteConfig;
  // BACKEND_PORT (set by dev.sh) wins, so the backend can move off a port that is taken on this machine.
  const proxy = `  server: {\n    proxy: {\n      '/api': { target: \`http://localhost:\${process.env.BACKEND_PORT || ${backendPort}}\`, changeOrigin: true, rewrite: p => p.replace(/^\\/api/, '') },\n    },\n  },`;
  const out = viteConfig.replace(/(plugins:\s*\[[^\]]*\],?)/, m => `${m.replace(/,?$/, ',')}\n${proxy}`);
  if (out === viteConfig) throw new Error('vite.config: không tìm thấy plugins: [...] để thêm proxy /api');
  return out;
}

const nginxWithApi = backendPort => `server {
  listen 8080;
  root /usr/share/nginx/html;
  location /api/ {
    proxy_pass http://backend:${backendPort}/;
    proxy_set_header Host $host;
  }
  location / {
    try_files $uri /index.html;
  }
}
`;

// ── Flutter app wiring ───────────────────────────────────────────────────────────────────────────

const apiDart = port => `// Backend address: --dart-define=API_URL=... when building (each lane builds against its own backend).
// Default: the backend on this machine as seen from the Android emulator (10.0.2.2 is the host).
import 'package:http/http.dart' as http;

const apiBase = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:${port}');

Future<http.Response> apiGet(String path) =>
    http.get(Uri.parse('$apiBase${'${'}path.startsWith('/') ? path : '/$path'}'));
`;
const statusDart = health => `import 'package:flutter/material.dart';
import 'api.dart';

/// First screen: says whether the app reaches the backend.
class BackendStatus extends StatefulWidget {
  const BackendStatus({super.key, this.check});
  final Future<bool> Function()? check;
  @override
  State<BackendStatus> createState() => _BackendStatusState();
}

class _BackendStatusState extends State<BackendStatus> {
  bool? ok;
  @override
  void initState() {
    super.initState();
    (widget.check ?? () async => (await apiGet('${health}')).statusCode < 500)()
        .then((v) => setState(() => ok = v), onError: (_) => setState(() => ok = false));
  }
  @override
  Widget build(BuildContext context) => Center(
        child: Text(ok == null ? 'Đang kiểm tra backend…' : ok! ? 'Đã nối backend' : 'Chưa nối được backend',
            key: const Key('backend-status')),
      );
}
`;
/** A Dart single-quoted string literal ($ and quotes escaped, so any project name compiles). */
const dartString = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, ' ')}'`;
const mainDart = name => `import 'package:flutter/material.dart';
import 'backend_status.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: ${dartString(name)},
        home: Scaffold(appBar: AppBar(title: const Text(${dartString(name)})), body: const BackendStatus()),
      );
}
`;
const statusTestDart = slug => `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:${dartName(slug)}/backend_status.dart';

void main() {
  testWidgets('shows when the backend answers', (tester) async {
    await tester.pumpWidget(MaterialApp(home: BackendStatus(check: () async => true)));
    await tester.pump();
    expect(find.text('Đã nối backend'), findsOneWidget);
  });
}
`;

/** pubspec.yaml with the http package (the app calls the backend); unchanged when already there. */
export function pubspecWithHttp(text) {
  if (/^\s+http:/m.test(text)) return text;
  return text.replace(/^dependencies:\n/m, 'dependencies:\n  http: ^1.2.2\n');
}

/** Debug builds talk plain http to the lane's backend (10.0.2.2): allow cleartext there only. */
export function debugManifestCleartext(text) {
  if (text.includes('usesCleartextTraffic')) return text;
  return text.replace('</manifest>', '    <application android:usesCleartextTraffic="true" />\n</manifest>');
}

function flutterWiring(ctx, backend, frontend) {
  const dir = frontend.dir;
  const files = {
    'lib/api.dart': apiDart(backend.stack.appPort),
    'lib/backend_status.dart': statusDart(HEALTH_PATH[backend.stack.id] || '/'),
    'lib/main.dart': mainDart(ctx.name),
    'pubspec.yaml': pubspecWithHttp(readText(path.join(dir, 'pubspec.yaml'))),
  };
  const manifest = readText(path.join(dir, 'android/app/src/debug/AndroidManifest.xml'));
  if (manifest) files['android/app/src/debug/AndroidManifest.xml'] = debugManifestCleartext(manifest);
  // Replaces flutter create's sample test, which points at the counter app main.dart no longer is
  // (left alone it would break flutter analyze); written whether or not tests were asked for.
  files['test/widget_test.dart'] = statusTestDart(ctx.slug);
  return files;
}

/** Files that make the frontend part talk to the backend part (written after both overlays). */
export function frontendWiring(ctx, backend, frontend) {
  if (isMobileStack(frontend.stack.id)) return flutterWiring(ctx, backend, frontend);
  const port = backend.stack.appPort;
  const dir = frontend.dir;
  const cfgName = fs.existsSync(path.join(dir, 'vite.config.ts')) ? 'vite.config.ts' : 'vite.config.js';
  const pkg = JSON.parse(readText(path.join(dir, 'package.json')) || '{}');
  pkg.name = `${ctx.slug}-frontend`;
  const files = {
    [cfgName]: withApiProxy(readText(path.join(dir, cfgName)), port),
    'package.json': JSON.stringify(pkg, null, 2) + '\n',
    'src/api.ts': API_TS,
    'src/BackendStatus.tsx': statusTsx(HEALTH_PATH[backend.stack.id] || '/'),
    'src/App.tsx': appTsx(ctx.name),
    '.env.example': '# Để trống: gọi backend qua /api (proxy của Vite khi dev, nginx khi chạy Docker).\n# Đặt khi backend ở máy khác, ví dụ: VITE_API_URL=https://api.example.com\nVITE_API_URL=\n',
  };
  if (frontend.options.tests) files['src/BackendStatus.test.tsx'] = statusTest;
  if (frontend.options.docker) files['nginx.conf'] = nginxWithApi(port);
  return files;
}

/** Package names that say which half they are (Nest/Vite name the package after the folder). */
export function backendNaming(ctx, backend) {
  if (backend.stack.id !== 'ts-nestjs') return {};
  const pkg = JSON.parse(readText(path.join(backend.dir, 'package.json')) || '{}');
  pkg.name = `${ctx.slug}-backend`;
  return { 'package.json': JSON.stringify(pkg, null, 2) + '\n' };
}

// ── repository root ────────────────────────────────────────────────────────────────────────────

function compose(ctx, backend, frontend) {
  const svc = dbService(backend.options.db, ctx.slug);
  const lines = ['services:'];
  if (svc) lines.push(...svc.yaml);
  if (backend.options.docker) {
    const inside = Object.entries(dbEnv(backend.options.db, ctx.slug, 'db')).filter(([k]) => /_HOST$|_URI$/.test(k));
    lines.push('  backend:', '    build: ./backend', '    env_file: [.env]', `    ports: ["${backend.stack.appPort}:${backend.stack.appPort}"]`);
    if (inside.length) { lines.push('    environment:'); for (const [k, v] of inside) lines.push(`      ${k}: ${v}`); }
    if (svc) lines.push('    depends_on: [db]');
  }
  if (frontend.options.docker) {
    lines.push('  frontend:', '    build: ./frontend', '    ports: ["8088:8080"]');
    if (backend.options.docker) lines.push('    depends_on: [backend]');
  }
  if (lines.length === 1) return null;
  if (svc && svc.yaml.some(l => l.includes('db-data'))) lines.push('', 'volumes:', '  db-data:');
  return lines.join('\n') + '\n';
}

function devSh(backend, frontend, backendCmds, frontendCmds) {
  const db = dbService(backend.options.db, 'x');
  if (isMobileStack(frontend.stack.id)) return devShMobile(backend, backendCmds, db);
  // uvicorn ignores $PORT; the others read it (Spring server.port=${PORT}, Nest process.env.PORT).
  const beDev = backend.stack.id === 'python-fastapi' ? `${backendCmds.dev} --port "$BACKEND_PORT"` : backendCmds.dev;
  return `#!/usr/bin/env bash
# Chạy cả dự án trên máy: ${db ? 'database (docker compose) + ' : ''}backend + frontend. Ctrl+C dừng tất cả.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
# Backend port: BACKEND_PORT=9090 ./dev.sh when ${backend.stack.appPort} is taken; the frontend's /api proxy follows it.
export BACKEND_PORT="\${BACKEND_PORT:-${backend.stack.appPort}}" PORT="\${BACKEND_PORT:-${backend.stack.appPort}}"
${db ? 'docker compose up -d db\n' : ''}trap 'trap - EXIT; kill 0' EXIT INT TERM
(cd backend && ${backendCmds.install ? `${backendCmds.install} && ` : ''}${beDev}) &
(cd frontend && { [ -d node_modules ] || ${frontendCmds.install}; } && ${frontendCmds.dev}) &
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:${FRONTEND_DEV_PORT}  (gọi backend qua /api)"
wait
`;
}

// A phone app has no dev server: dev.sh runs db + backend and says how to run the app against it.
function devShMobile(backend, backendCmds, db) {
  const beDev = backend.stack.id === 'python-fastapi' ? `${backendCmds.dev} --port "$BACKEND_PORT"` : backendCmds.dev;
  return `#!/usr/bin/env bash
# Chạy backend trên máy: ${db ? 'database (docker compose) + ' : ''}backend. App Flutter chạy riêng trên máy ảo Android. Ctrl+C dừng tất cả.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
export BACKEND_PORT="\${BACKEND_PORT:-${backend.stack.appPort}}" PORT="\${BACKEND_PORT:-${backend.stack.appPort}}"
${db ? 'docker compose up -d db\n' : ''}trap 'trap - EXIT; kill 0' EXIT INT TERM
(cd backend && ${backendCmds.install ? `${backendCmds.install} && ` : ''}${beDev}) &
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "App:      cd mobile && flutter run --dart-define=API_URL=http://10.0.2.2:$BACKEND_PORT   (máy ảo Android đang chạy)"
wait
`;
}

function readme(ctx, backend, frontend, bc, fc) {
  if (isMobileStack(frontend.stack.id)) return readmeMobile(ctx, backend, frontend, bc, fc);
  const db = backend.options.db;
  const dockerAny = backend.options.docker || frontend.options.docker;
  return `# ${ctx.name}

${ctx.description || ''}

## Cấu trúc

| Thư mục | Công nghệ |
|---|---|
| \`backend/\` | ${backend.stack.languageLabel} · ${backend.stack.label}${db && db !== 'none' ? ` · ${DB_LABEL[db]}` : ''} |
| \`frontend/\` | ${frontend.stack.languageLabel} · ${frontend.stack.label} |

Frontend gọi backend qua đường dẫn \`/api\` (Vite chuyển tiếp khi dev, nginx khi chạy Docker), nên không cần cấu hình CORS.

## Chạy thử trên máy

\`\`\`bash
cp .env.example .env    # rồi sửa các giá trị change-me
./dev.sh                # ${db && db !== 'none' && db !== 'sqlite' ? 'database + ' : ''}backend + frontend cùng lúc
BACKEND_PORT=9090 ./dev.sh   # khi cổng ${backend.stack.appPort} đã bị chiếm trên máy
\`\`\`

Mở http://localhost:${FRONTEND_DEV_PORT} — trang chủ cho biết frontend đã nói chuyện được với backend chưa.

## Kiểm thử và build

\`\`\`bash
cd backend  && ${bc.test || bc.build}
cd frontend && ${fc.test ? `${fc.test} && ` : ''}${fc.build}
\`\`\`
${dockerAny ? `
## Docker

\`\`\`bash
docker compose up --build   # backend :${backend.stack.appPort}${frontend.options.docker ? ', frontend :8088' : ''}
\`\`\`
` : ''}
## Quy ước

- Nhánh tích hợp: \`development\`. Mọi thay đổi đi qua pull request.
- Biến môi trường mẫu nằm trong \`.env.example\`; **không commit \`.env\`**.

_Khởi tạo bằng Shipyard (fullstack: ${backend.stack.id} + ${frontend.stack.id})._
`;
}

function readmeMobile(ctx, backend, frontend, bc, fc) {
  const db = backend.options.db;
  return `# ${ctx.name}

${ctx.description || ''}

## Cấu trúc

| Thư mục | Công nghệ |
|---|---|
| \`backend/\` | ${backend.stack.languageLabel} · ${backend.stack.label}${db && db !== 'none' ? ` · ${DB_LABEL[db]}` : ''} |
| \`mobile/\` | ${frontend.stack.languageLabel} · ${frontend.stack.label} |

App gọi backend qua \`lib/api.dart\`; địa chỉ đặt lúc build bằng \`--dart-define=API_URL=...\` (trên máy ảo Android, máy chủ là \`10.0.2.2\`).

## Chạy thử trên máy

\`\`\`bash
cp .env.example .env    # rồi sửa các giá trị change-me
./dev.sh                # ${db && db !== 'none' && db !== 'sqlite' ? 'database + ' : ''}backend
cd mobile && flutter run --dart-define=API_URL=http://10.0.2.2:${backend.stack.appPort}
\`\`\`

## Kiểm thử và build

\`\`\`bash
cd backend && ${bc.test || bc.build}
cd mobile  && flutter analyze && ${fc.test} && ${fc.build}
\`\`\`

## Quy ước

- Nhánh tích hợp: \`development\`. Mọi thay đổi đi qua pull request.
- Biến môi trường mẫu nằm trong \`.env.example\`; **không commit \`.env\`**.
- Kiểm tra app Flutter chạy trên lane của Shipyard (máy ảo Android); CI từ xa chỉ kiểm tra backend.

_Khởi tạo bằng Shipyard (backend ${backend.stack.id} + app ${frontend.stack.id})._
`;
}

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{java,py,kt,gradle}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
`;

/** Root files of a fullstack repository. */
export function fullstackRootFiles(ctx, backend, frontend, generatedAt = new Date().toISOString()) {
  const bctx = { ...ctx, dir: backend.dir, options: backend.options };
  const fctx = { ...ctx, dir: frontend.dir, options: frontend.options };
  const bc = backend.stack.commands(bctx);
  const fc = frontend.stack.commands(fctx);
  return {
    'README.md': readme(ctx, backend, frontend, bc, fc),
    '.editorconfig': EDITORCONFIG,
    '.env.example': envFile({ ...backend.stack.env(bctx), ...dbEnv(backend.options.db, ctx.slug) }),
    '.gitignore': mergeGitignore('', `${backend.stack.gitignore(bctx)}\n${frontend.stack.gitignore(fctx)}`),
    'docker-compose.yml': compose(ctx, backend, frontend),
    'dev.sh': devSh(backend, frontend, bc, fc),
    '.shipyard/project.json': JSON.stringify({
      name: ctx.name, slug: ctx.slug, description: ctx.description, kind: 'fullstack',
      backend: { dir: 'backend', stack: backend.stack.id, options: backend.options },
      frontend: { dir: subOf(frontend.stack.id), stack: frontend.stack.id, options: frontend.options },
      ...(isMobileStack(frontend.stack.id) ? { mobile: { packageId: mobilePackageId(frontend.options.org || 'com.example', ctx.slug), apiDefine: 'API_URL' } } : {}),
      generatedAt, generator: 'shipyard-scaffold/2',
    }, null, 2) + '\n',
  };
}

// ── CI: one job per part ───────────────────────────────────────────────────────────────────────

const SETUP = p => ({
  java: ['      - uses: actions/setup-java@v4', '        with:', '          distribution: temurin',
    `          java-version: '${p.version}'`, `          cache: ${p.cache}`],
  python: ['      - uses: astral-sh/setup-uv@v5', '        with:', `          python-version: '${p.version}'`],
  node: ['      - uses: actions/setup-node@v4', '        with:', `          node-version: '${p.version}'`,
    '          cache: npm', '          cache-dependency-path: SUB/package-lock.json'],
}[p.kind]);

export function fullstackCiFiles(provider, allParts) {
  // The Flutter app is checked on the lanes of this machine only (a remote runner may not pull a Flutter image).
  const parts = allParts.filter(p => !isMobileStack(p.stack.id));
  if (provider === 'github') {
    const lines = ['name: CI', '', 'on:', '  push:', '    branches: [main, development]', '  pull_request:', '', 'jobs:'];
    for (const part of parts) {
      const p = plan(part.stack.id, part.options);
      lines.push(`  ${part.role}:`, '    runs-on: ubuntu-latest', '    defaults:', '      run:', `        working-directory: ${part.sub}`,
        '    steps:', '      - uses: actions/checkout@v4', ...SETUP(p).map(l => l.replace('SUB', part.sub)),
        ...p.script.map(s => `      - run: ${s}`));
    }
    return { '.github/workflows/ci.yml': lines.join('\n') + '\n' };
  }
  if (provider === 'gitlab') {
    const lines = ['stages: [test]', ''];
    for (const part of parts) {
      const p = plan(part.stack.id, part.options);
      const cache = { java: p.cache === 'gradle' ? `${part.sub}/.gradle/` : `${part.sub}/.m2/repository/`, python: `${part.sub}/.cache/uv/`, node: `${part.sub}/.npm/` }[p.kind];
      const vars = { java: p.cache === 'gradle' ? `GRADLE_USER_HOME: "$CI_PROJECT_DIR/${part.sub}/.gradle"` : `MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/${part.sub}/.m2/repository"`,
        python: `UV_CACHE_DIR: "$CI_PROJECT_DIR/${part.sub}/.cache/uv"`, node: `npm_config_cache: "$CI_PROJECT_DIR/${part.sub}/.npm"` }[p.kind];
      lines.push(`${part.role}:`, '  stage: test', `  image: ${p.image}`, '  variables:', `    ${vars}`, '  cache:',
        `    key: ${part.role}-$CI_COMMIT_REF_SLUG`, `    paths: [${cache}]`, `  before_script: [cd ${part.sub}]`, '  script:',
        ...p.script.map(s => `    - ${s}`), '  rules:', '    - if: $CI_PIPELINE_SOURCE == "merge_request_event"',
        '    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "development"', '');
    }
    return { '.gitlab-ci.yml': lines.join('\n') };
  }
  return {};
}

// ── AI-team starter rules for both halves ──────────────────────────────────────────────────────

export function fullstackStarterRules(ctx, backend, frontend) {
  const bctx = { ...ctx, dir: backend.dir, options: backend.options };
  const fctx = { ...ctx, dir: frontend.dir, options: frontend.options };
  const bc = backend.stack.commands(bctx);
  const fc = frontend.stack.commands(fctx);
  const db = backend.options.db;
  const banner = '> Bản khởi đầu do Shipyard sinh cho dự án fullstack. AI Manager sẽ soạn lại cùng người duyệt; sửa trực tiếp file này cũng được.\n';
  const bTest = `cd backend && ${bc.test || bc.build}`;
  const fTest = `cd ${subOf(frontend.stack.id)} && ${isMobileStack(frontend.stack.id) ? 'flutter analyze && ' : ''}${fc.test || fc.build}`;
  return {
    'rules/project.md': `# Luật chung — ${ctx.name}

${banner}
## Cấu trúc
- \`backend/\`: ${backend.stack.languageLabel} · ${backend.stack.label}${db && db !== 'none' ? ` · database ${db}` : ''}.
${isMobileStack(frontend.stack.id)
    ? `- \`mobile/\`: app ${frontend.stack.label}; gọi backend qua \`lib/api.dart\` (địa chỉ từ \`--dart-define=API_URL\`), không viết cứng địa chỉ.`
    : `- \`frontend/\`: ${frontend.stack.languageLabel} · ${frontend.stack.label}; gọi backend qua \`/api\` (\`src/api.ts\`), không gọi thẳng cổng backend.`}
- Hợp đồng API (đường dẫn, request/response) thay đổi thì sửa **cả hai phía trong cùng pull request**.

## Quy ước code — backend
${(STACK_RULES[backend.stack.id]?.(backend.options) || []).join('\n')}

## Quy ước code — frontend
${(STACK_RULES[frontend.stack.id]?.(frontend.options) || []).map(l => l.replace('Địa chỉ API đọc từ `import.meta.env.VITE_API_URL`.', 'Mọi lời gọi backend đi qua `src/api.ts` (VITE_API_URL hoặc /api).')).join('\n')}
- Đặt tên rõ nghĩa bằng tiếng Anh trong code; chú thích và tài liệu cho người dùng có thể bằng tiếng Việt.

## Git
- Nhánh tích hợp: \`development\`. Mỗi tính năng một nhánh, vào \`development\` qua pull request.
- Commit theo Conventional Commits: \`feat: …\`, \`fix: …\`, \`chore: …\`; ghi phạm vi khi rõ: \`feat(backend): …\`, \`feat(frontend): …\`.
- Không commit \`.env\`, khoá hay mật khẩu; biến mới phải thêm vào \`.env.example\`.

## Chất lượng
- Trước khi mở pull request: \`${bTest}\` và \`${fTest}\` đều phải xanh.
- Tính năng mới đi kèm test cho hành vi chính ở phía nó chạm tới.
`,
    'rules/dev.md': `# Luật cho AI Dev

${banner}
- Đọc kỹ spec/plan đã duyệt trước khi viết code; không làm ngoài phạm vi.
- Sau mỗi thay đổi: \`${bTest}\` (nếu chạm backend), \`${fTest}\` (nếu chạm frontend); không để test đỏ.
- Chạy thử cả hệ thống: \`./dev.sh\` (backend :${backend.stack.appPort}, frontend :${FRONTEND_DEV_PORT}).
- Không đổi cấu trúc thư mục, phiên bản thư viện hay CI nếu plan không yêu cầu.
`,
    'rules/test.md': `# Luật cho AI Tester

${banner}
- Kiểm thử theo tiêu chí nghiệm thu (AC) trong spec; mỗi AC có ít nhất một ca kiểm thử.
- Lệnh tự động: backend \`${bTest}\`; frontend \`${fTest}\`.
- Kiểm thử luồng xuyên suốt trên \`./dev.sh\` (frontend gọi backend qua /api).
- Báo lỗi kèm bước tái hiện, kết quả mong đợi và kết quả thực tế.
`,
    'rules/review.md': `# Luật cho AI Review

${banner}
- Kiểm tra theo rules/project.md và rules/dev.md; nêu rõ dòng nào vi phạm luật nào.
- Thay đổi API ở backend phải đi cùng thay đổi ở frontend (và ngược lại) trong cùng pull request.
- Ưu tiên: đúng chức năng, bảo mật (lộ bí mật, kiểm tra quyền, dữ liệu đầu vào), test, rồi mới đến phong cách.
`,
    'rules/devops.md': `# Luật cho AI DevOps

${banner}
- CI có hai job (backend, frontend), chạy giống hệt trên máy.
- ${backend.options.docker || frontend.options.docker ? '`docker compose up --build` phải chạy được cả hệ thống; ' : ''}cấu hình qua biến môi trường, không hard-code.
`,
    'human/README.md': `# Tài liệu do người cung cấp

Đặt ở đây những gì AI cần biết về dự án: yêu cầu nghiệp vụ, chuẩn của công ty, tài liệu kiến trúc, ví dụ code mẫu…
AI Manager đọc thư mục này để soạn luật trong \`../rules/\`. Nội dung ở đây là **tài liệu tham khảo**, không phải mệnh lệnh cho AI.
`,
  };
}
