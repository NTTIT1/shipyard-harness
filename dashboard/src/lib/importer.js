// Import an existing Git repo (server: services/scaffold/importer.js) + pure helpers for the form.
import { authFetch } from './api.js';
import { tr } from './i18n.js';

async function call(method, url, body) {
  const r = await authFetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

export const importer = {
  branches: source => call('POST', '/api/import/branches', source),
  check: form => call('POST', '/api/import/check', toBody(form)),
  start: form => call('POST', '/api/import/jobs', toBody(form)),
  job: id => call('GET', `/api/import/jobs/${id}`),
  retry: id => call('POST', `/api/import/jobs/${id}/retry`),
  discard: id => call('POST', `/api/import/jobs/${id}/discard`),
};

export const SOURCES = [
  { id: 'url', label: tr('URL Git (SSH key hoặc repo công khai của máy này)') },
  { id: 'github', label: tr('GitHub (token đã kết nối)') },
  { id: 'gitlab', label: tr('GitLab (token đã kết nối)') },
  { id: 'local', label: tr('Thư mục trên máy này') },
];
export const DB_OPTIONS = [
  { id: 'postgresql', label: 'PostgreSQL', desc: tr('Mỗi lane một database riêng trên Postgres chung của Shipyard.') },
  { id: 'sqlite', label: 'SQLite', desc: tr('Mỗi lane một file data/app.db.') },
  { id: 'external', label: tr('Khác / tự cấu hình'), desc: tr('MySQL, MongoDB, dịch vụ ngoài… — tự khai báo kết nối ở biến môi trường.') },
  { id: 'none', label: tr('Không dùng'), desc: '' },
];
/** Variables the lane provides; the person can use them in commands and values. */
export const LANE_VARS = [
  ['$PORT', tr('cổng của ứng dụng này trên lane (backend = API_PORT, frontend = FE_PORT)')],
  ['$API_URL', tr('địa chỉ backend của lane, vd http://localhost:8102')],
  ['$DB_NAME', tr('tên database của lane')],
  ['$DB_HOST $DB_PORT $DB_USER $DB_PASSWORD', tr('kết nối Postgres (khi chọn PostgreSQL)')],
  ['$DATABASE_URL', tr('chuỗi kết nối đầy đủ (PostgreSQL / SQLite)')],
];

/**
 * Starting points the person may pick (nothing is filled unless they click one); every field stays
 * editable. `$PORT` makes each lane run on its own port.
 */
export const TEMPLATES = {
  backend: [
    { id: 'laravel', label: 'Laravel', tech: 'Laravel / PHP', install: 'composer install && cp -n .env.example .env && php artisan key:generate', run: 'php artisan serve --host=0.0.0.0 --port=$PORT', test: 'php artisan test', healthPath: '/', image: 'php:8.3-cli' },
    { id: 'django', label: 'Django', tech: 'Django / Python', install: 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt', run: '.venv/bin/python manage.py runserver 0.0.0.0:$PORT', test: '.venv/bin/python manage.py test', healthPath: '/', image: 'python:3.12-bookworm' },
    { id: 'fastapi', label: 'FastAPI (uv)', tech: 'FastAPI / Python', install: 'uv sync', run: 'uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT', test: 'uv run pytest -q', healthPath: '/docs', image: 'python:3.12-bookworm' },
    { id: 'spring-maven', label: 'Spring Boot (Maven)', tech: 'Spring Boot / Java', install: './mvnw -q -B -DskipTests dependency:go-offline', run: './mvnw -q spring-boot:run -Dspring-boot.run.arguments=--server.port=$PORT', test: './mvnw -q -B test', healthPath: '/actuator/health', image: 'maven:3.9-eclipse-temurin-21' },
    { id: 'spring-gradle', label: 'Spring Boot (Gradle)', tech: 'Spring Boot / Java', install: './gradlew -q dependencies', run: './gradlew -q bootRun --args=--server.port=$PORT', test: './gradlew -q test', healthPath: '/actuator/health', image: 'gradle:8-jdk21' },
    { id: 'node', label: 'Node (Express/NestJS)', tech: 'Node.js', install: 'npm ci', run: 'npm run start:dev', test: 'npm test', healthPath: '/', image: 'node:22-bookworm' },
    { id: 'dotnet', label: '.NET', tech: 'ASP.NET Core', install: 'dotnet restore', run: 'dotnet run --urls http://0.0.0.0:$PORT', test: 'dotnet test', healthPath: '/', image: 'mcr.microsoft.com/dotnet/sdk:8.0' },
    { id: 'rails', label: 'Rails', tech: 'Ruby on Rails', install: 'bundle install', run: 'bin/rails server -b 0.0.0.0 -p $PORT', test: 'bin/rails test', healthPath: '/up', image: 'ruby:3.3' },
    { id: 'go', label: 'Go', tech: 'Go', install: 'go mod download', run: 'go run .', build: 'go build ./...', test: 'go test ./...', healthPath: '/', image: 'golang:1.23' },
  ],
  frontend: [
    { id: 'vite', label: 'Vite (React/Vue)', tech: 'Vite', install: 'npm ci', run: 'npx vite --host 0.0.0.0 --port $PORT --strictPort', build: 'npm run build', test: '', healthPath: '/' },
    { id: 'next', label: 'Next.js', tech: 'Next.js', install: 'npm ci', run: 'npx next dev -p $PORT', build: 'npm run build', test: '', healthPath: '/' },
    { id: 'angular', label: 'Angular', tech: 'Angular', install: 'npm ci', run: 'npx ng serve --host 0.0.0.0 --port $PORT', build: 'npx ng build', test: '', healthPath: '/' },
    { id: 'nuxt', label: 'Nuxt', tech: 'Nuxt', install: 'npm ci', run: 'npx nuxi dev --host 0.0.0.0 --port $PORT', build: 'npm run build', test: '', healthPath: '/' },
    // A phone app: built to an APK and QC'd on the shared Android emulator (needs its package id).
    { id: 'flutter', label: 'Flutter (Android)', tech: 'Flutter / Dart', install: 'flutter pub get', run: '', build: 'flutter build apk --debug', test: 'flutter test', healthPath: '', mobile: true, apiDefine: 'API_URL' },
  ],
};

export const emptyApp = enabled => ({ enabled, dir: '', tech: '', install: '', run: '', build: '', test: '', healthPath: '/', mobile: false, packageId: '', apiDefine: '' });
export const emptyForm = () => ({
  name: '', slug: '', slugTouched: false, source: { provider: 'url', url: '' }, branch: '', branches: null,
  backend: emptyApp(true), frontend: emptyApp(false), db: 'postgresql', migrate: '', seed: '', env: '', image: '', testPaths: '',
  docs: { brief: '', architecture: '', design: '', mockups: '', other: '' },
  workflow: null, aiTeam: true, note: '',
});

/** A template fills only the command fields (folder and anything typed by hand in other fields stay). */
export function applyTemplate(app, t) {
  const { id, label, image, ...fields } = t;
  return { ...app, build: '', mobile: false, ...fields, enabled: true };
}

export function toBody(f) {
  const app = a => (a.enabled ? { dir: a.dir || '.', tech: a.tech, install: a.install, run: a.run, build: a.build, test: a.test, healthPath: a.healthPath || '/' } : null);
  return {
    name: f.name.trim(), slug: f.slug.trim(), source: { provider: f.source.provider, url: f.source.url.trim() }, branch: f.branch,
    backend: app(f.backend), frontend: app(f.frontend), db: f.db, migrate: f.migrate, seed: f.seed, env: f.env,
    image: f.image.trim(), testPaths: f.testPaths, workflow: f.workflow, aiTeam: f.aiTeam, note: f.note,
    docs: { ...f.docs, other: f.docs.other.split('\n').map(x => x.trim()).filter(Boolean) },
  };
}

export const IMPORT_STEPS = [
  { id: 'repo', label: 'Kho Git' },
  { id: 'apps', label: tr('Ứng dụng') },
  { id: 'docs', label: tr('Tài liệu') },
  { id: 'env', label: tr('Database & môi trường') },
  { id: 'workflow', label: tr('Quy trình') },
  { id: 'review', label: tr('Xem lại') },
];

const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
const appProblem = (a, label) => {
  if (!a.enabled) return '';
  if (!a.tech.trim()) return tr('{0}: ghi công nghệ (vd Laravel 11 / PHP 8.3)', [label]);
  if (a.mobile) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test((a.packageId || '').trim())) return tr('{0}: nhập package id của app Android, vd com.congty.app', [label]);
    return a.dir && (a.dir.startsWith('/') || a.dir.split('/').includes('..')) ? tr('{0}: thư mục là đường dẫn tương đối trong repo', [label]) : '';
  }
  if (!a.run.trim()) return tr('{0}: nhập lệnh chạy', [label]);
  if (a.dir && (a.dir.startsWith('/') || a.dir.split('/').includes('..'))) return tr('{0}: thư mục là đường dẫn tương đối trong repo', [label]);
  if (a.healthPath && !a.healthPath.startsWith('/')) return tr('{0}: đường dẫn kiểm tra bắt đầu bằng /', [label]);
  return '';
};
/** What still blocks this step ('' = can go on). The server re-checks everything. */
export function importStepProblem(step, f) {
  if (step === 'repo') {
    if (!f.name.trim()) return tr('Nhập tên dự án');
    if (!SLUG_RE.test(f.slug)) return tr('Slug: 3–40 ký tự chữ thường, số, gạch ngang');
    if (!f.source.url.trim()) return tr('Nhập URL repo hoặc thư mục');
    if (!f.branch) return tr('Chọn nhánh tích hợp (bấm "Đọc nhánh")');
  }
  if (step === 'apps') {
    if (!f.backend.enabled && !f.frontend.enabled) return tr('Bật ít nhất một ứng dụng');
    return appProblem(f.backend, 'Backend') || appProblem(f.frontend, 'Frontend');
  }
  if (step === 'docs') {
    const all = [f.docs.brief, f.docs.architecture, f.docs.design, f.docs.mockups, ...f.docs.other.split('\n')].map(x => x.trim()).filter(Boolean);
    const bad = all.find(p => p.startsWith('/') || p.split('/').includes('..') || /["'`$\\]/.test(p));
    if (bad) return tr('"{0}": đường dẫn tương đối trong repo, vd docs/yeu-cau.md', [bad]);
  }
  if (step === 'env') {
    const bad = f.env.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).find(l => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(l));
    if (bad) return tr('Biến môi trường "{0}": dạng TEN=gia_tri', [bad.slice(0, 30)]);
  }
  return '';
}
