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

export const BACKEND_STACKS = ['java-spring', 'python-fastapi', 'ts-nestjs'];
export const FRONTEND_STACKS = ['ts-react-vite'];
export const FRONTEND_DEV_PORT = 5173;

/** Where each backend answers a cheap "are you up" request (the frontend's status badge calls it). */
export const HEALTH_PATH = { 'java-spring': '/actuator/health', 'python-fastapi': '/health', 'ts-nestjs': '/' };

/** The parts of a project: one app at the root, or backend/ + frontend/. */
export function partsOf(spec, root, stackById) {
  if (spec.kind !== 'fullstack') return [{ role: 'app', sub: '', stack: stackById(spec.stack), options: spec.options, dir: root }];
  return [
    { role: 'backend', sub: 'backend', stack: stackById(spec.stack), options: spec.options, dir: path.join(root, 'backend') },
    { role: 'frontend', sub: 'frontend', stack: stackById(spec.frontend.stack), options: spec.frontend.options, dir: path.join(root, 'frontend') },
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

/** Files that make the frontend part talk to the backend part (written after both overlays). */
export function frontendWiring(ctx, backend, frontend) {
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

function readme(ctx, backend, frontend, bc, fc) {
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
      frontend: { dir: 'frontend', stack: frontend.stack.id, options: frontend.options },
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

export function fullstackCiFiles(provider, parts) {
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
  const fTest = `cd frontend && ${fc.test || fc.build}`;
  return {
    'rules/project.md': `# Luật chung — ${ctx.name}

${banner}
## Cấu trúc
- \`backend/\`: ${backend.stack.languageLabel} · ${backend.stack.label}${db && db !== 'none' ? ` · database ${db}` : ''}.
- \`frontend/\`: ${frontend.stack.languageLabel} · ${frontend.stack.label}; gọi backend qua \`/api\` (\`src/api.ts\`), không gọi thẳng cổng backend.
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
