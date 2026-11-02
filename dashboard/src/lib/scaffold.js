import { authFetch } from './api.js';

// Project wizard client (server: dashboard/server/routes/scaffold.js) + pure helpers for the steps.
import { WORKFLOW_PRESETS, workflowProblem, STEP_LABEL } from './review.js';
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

export const scaffold = {
  catalog: () => call('GET', '/api/scaffold/catalog'),
  start: body => call('POST', '/api/scaffold/jobs', body),
  job: id => call('GET', `/api/scaffold/jobs/${id}`),
  cancel: id => call('POST', `/api/scaffold/jobs/${id}/cancel`),
  retry: id => call('POST', `/api/scaffold/jobs/${id}/retry`),
  providers: () => call('GET', '/api/scaffold/git-providers'),
  saveProvider: (id, body) => call('PUT', `/api/scaffold/git-providers/${id}`, body),
  removeProvider: id => call('DELETE', `/api/scaffold/git-providers/${id}`),
  owners: id => call('GET', `/api/scaffold/git-providers/${id}/owners`),
  discard: id => call('DELETE', `/api/scaffold/jobs/${id}`),
  setup: runId => call('GET', `/api/scaffold/setup/${runId}`),
  retrySetup: runId => call('POST', `/api/scaffold/setup/${runId}/retry`),
  blueprint: runId => call('GET', `/api/scaffold/blueprint/${runId}`),
  advise: requirements => call('POST', '/api/scaffold/advise', { requirements }),
  retryBlueprint: runId => call('POST', `/api/scaffold/blueprint/${runId}/retry`),
  projectBlueprints: projectId => call('GET', `/api/scaffold/blueprints?projectId=${encodeURIComponent(projectId)}`),
};

export const FALLBACK_ROLES = {
  PM:     { label: tr('AI PM (Quản lý sản phẩm)'), desc: tr('Lập kế hoạch, ưu tiên backlog, chia nhỏ user story') },
  BA:     { label: tr('AI BA (Phân tích nghiệp vụ)'), desc: tr('Đặc tả yêu cầu, luồng nghiệp vụ, tiêu chí nghiệm thu') },
  ARCH:   { label: tr('AI Kiến trúc (Architect)'), desc: tr('Thiết kế kiến trúc, database schema, hợp đồng API') },
  DESIGN: { label: tr('AI Thiết kế (UI/UX)'), desc: tr('Thiết kế giao diện, trải nghiệm người dùng, design tokens') },
  DEV:    { label: tr('AI Lập trình (Developer)'), desc: tr('Viết code tính năng, tích hợp DB/API, viết unit test') },
  TEST:   { label: tr('AI Kiểm thử (QA/Tester)'), desc: tr('Kiểm thử tự động, kiểm thử biên, báo cáo chất lượng') },
  REVIEW: { label: 'AI Review Code', desc: tr('Đánh giá code, kiểm tra bảo mật, hiệu năng và chuẩn dự án') },
  DEVOPS: { label: 'AI DevOps', desc: tr('Cấu hình Docker, CI/CD pipeline, biến môi trường và triển khai') },
};

export const FALLBACK_SKILL_CATALOG = [
  { id: 'spring-rest-jpa', label: tr('Spring Boot REST & JPA chuẩn'), desc: tr('Chuẩn Controller → Service → Repository, DTO validation, phân trang và xử lý lỗi tập trung.'), roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['java-spring'] },
  { id: 'spring-security-jwt', label: tr('Bảo mật Spring Security & RBAC'), desc: tr('Kiểm soát phân quyền endpoint, xác thực JWT/Session, chống SQLi/XSS.'), roles: ['DEV', 'ARCH', 'REVIEW', 'TEST'], stacks: ['java-spring'] },
  { id: 'flyway-db-migration', label: tr('Quản lý Migration DB an toàn'), desc: tr('Mọi thay đổi schema phải tạo script migration có thứ tự, tương thích ngược.'), roles: ['ARCH', 'DEV', 'DEVOPS'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs'] },
  { id: 'fastapi-async-pydantic', label: 'FastAPI Async & Pydantic v2', desc: tr('Tách router/service, khai báo schema Pydantic chặt chẽ, dependency injection.'), roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['python-fastapi'] },
  { id: 'nestjs-modular-arch', label: tr('Kiến trúc Module NestJS'), desc: tr('Tách Module, Controller, Injectable Service, DTO class-validator rõ ràng.'), roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['ts-nestjs'] },
  { id: 'impeccable-style', label: 'Impeccable Design System (impeccable.style)', desc: tr('Bộ ngôn ngữ thiết kế UI/UX chuẩn Impeccable (24 lệnh: /impeccable polish, distill, critique, audit, clarify…) chống giao diện AI rập khuôn.'), roles: ['DESIGN', 'DEV', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'apple-design', label: 'Apple Fluid Interface Design (WWDC / Emil Kowalski)', desc: tr('Triết lý thiết kế giao diện mượt mà của Apple (WWDC Fluid Interfaces): phản hồi tức thì trên pointer-down, chuyển động spring có thể ngắt quãng, tính nhất quán không gian và typography chuẩn xác.'), roles: ['DESIGN', 'DEV', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'react-a11y-components', label: 'React Component & Accessibility', desc: tr('Tách component tái sử dụng, quản lý state sạch, hỗ trợ bàn phím và aria-label.'), roles: ['DESIGN', 'DEV', 'TEST'], stacks: ['ts-react', 'ts-react-vite'] },
  { id: 'clean-code-tdd', label: tr('Clean Code & Unit Test bắt buộc'), desc: tr('Mỗi tính năng mới của AI Dev phải kèm тест tự động và không làm gãy test cũ.'), roles: ['DEV', 'TEST', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'api-contract-first', label: tr('Thiết kế API Contract-First'), desc: tr('Thống nhất cấu trúc request/response và mã lỗi HTTP trước khi code.'), roles: ['BA', 'ARCH', 'DEV', 'TEST'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'security-owasp-check', label: tr('Kiểm tra bảo mật OWASP Top 10'), desc: tr('Rà soát lỗ hổng phân quyền, lộ thông tin nhạy cảm, injection và phụ thuộc.'), roles: ['ARCH', 'DEV', 'REVIEW', 'TEST'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
];

export const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/** "Quản lý Kho hàng 2" → "quan-ly-kho-hang-2" (Vietnamese diacritics and đ included). */
export function slugify(name) {
  return (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 40).replace(/-+$/, '');
}

export function findStack(catalog, id) {
  for (const l of catalog?.languages || []) {
    const s = l.stacks.find(x => x.id === id);
    if (s) return { ...s, language: l.id, languageLabel: l.label };
  }
  return null;
}

export function defaultOptions(stack) {
  return Object.fromEntries((stack?.options || []).map(o => [o.id, o.default]));
}

export function defaultRoleSkills(catalog, stackId) {
  if (catalog?.defaultRoleSkills?.[stackId]) {
    return JSON.parse(JSON.stringify(catalog.defaultRoleSkills[stackId]));
  }
  const roles = catalog?.roles || FALLBACK_ROLES;
  const skills = catalog?.skillCatalog || FALLBACK_SKILL_CATALOG;
  const out = {};
  for (const r of Object.keys(roles)) {
    const matched = skills
      .filter(sk => sk.roles.includes(r) && (!stackId || sk.stacks.includes(stackId)))
      .map(sk => sk.id);
    out[r] = { skills: matched, customRule: '' };
  }
  return out;
}

export const KINDS = [
  { id: 'single', label: tr('Một ứng dụng'), desc: tr('Một backend hoặc một frontend, nằm ở thư mục gốc của repo') },
  { id: 'fullstack', label: 'Fullstack: backend + frontend',
    desc: tr('Một repo gồm backend/ và frontend/, nối sẵn qua /api, chạy cả hai bằng ./dev.sh') },
];
/** "Tạo dự án → Từ khung" also offers a phone app: backend + Flutter, sent as a fullstack project. */
export const TEMPLATE_KINDS = [...KINDS,
  { id: 'mobile', label: tr('App mobile: backend + Flutter (Android)'),
    desc: tr('Backend/ và app Flutter trong mobile/; lane build APK và AI kiểm tra trên máy ảo Android') },
];
const MOBILE = ['flutter-android'];

/** Languages offered at the language step: a fullstack project picks its BACKEND language there. */
export function languagesFor(catalog, kind) {
  const langs = catalog?.languages || [];
  // A phone app never stands alone; with one, the language step picks the backend's.
  if (kind !== 'fullstack' && kind !== 'mobile') {
    return langs.map(l => ({ ...l, stacks: l.stacks.filter(s => !MOBILE.includes(s.id)) })).filter(l => l.stacks.length);
  }
  return langs.map(l => ({ ...l, stacks: l.stacks.filter(s => s.role === 'backend') })).filter(l => l.stacks.length);
}

/** Frontend frameworks for the fullstack frontend step. */
export function frontendStacks(catalog, kind = 'fullstack') {
  return (catalog?.languages || []).flatMap(l => l.stacks.filter(s => s.role === 'frontend' && MOBILE.includes(s.id) === (kind === 'mobile'))
    .map(s => ({ ...s, language: l.id, languageLabel: l.label })));
}

/** Wizard steps; the database step disappears for stacks without one (React + Vite). */
export function wizardSteps(stack, kind = 'single') {
  const fullstack = kind === 'fullstack';
  return [
    { id: 'info', label: tr('Thông tin') },
    { id: 'need', label: tr('Yêu cầu & tư vấn AI') },
    { id: 'kind', label: tr('Kiểu dự án') },
    { id: 'language', label: fullstack ? tr('Ngôn ngữ backend') : tr('Ngôn ngữ') },
    { id: 'stack', label: fullstack ? 'Backend' : 'Framework' },
    ...(stack?.noDatabase ? [] : [{ id: 'db', label: 'Database' }]),
    { id: 'options', label: fullstack ? tr('Tuỳ chọn backend') : tr('Tuỳ chọn') },
    ...(fullstack ? [{ id: 'frontend', label: 'Frontend' }] : []),
    { id: 'git', label: 'Kho Git' },
    { id: 'arch', label: tr('Kiến trúc') },
    { id: 'workflow', label: tr('Quy trình') },
    { id: 'team', label: tr('Đội AI & Skill') },
    { id: 'review', label: tr('Xem lại') },
  ];
}

/** Why the user cannot leave this step yet ('' = can continue). */
export function stepProblem(step, form, stack, fstack = null) {
  switch (step) {
    case 'kind': return form.kind ? '' : tr('Chọn kiểu dự án');
    case 'frontend':
      if (!fstack) return tr('Chọn framework cho frontend');
      return fstack.available ? '' : tr('Máy chủ thiếu: {0}', [fstack.missing.map(m => m.tool).join(', ')]);
    case 'info':
      if (!form.name.trim()) return tr('Nhập tên dự án');
      if (!SLUG_RE.test(form.slug)) return tr('Slug: 3–40 ký tự gồm chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ');
      return '';
    case 'language': return form.language ? '' : tr('Chọn ngôn ngữ');
    case 'stack':
      if (!stack) return tr('Chọn framework');
      return stack.available ? '' : tr('Máy chủ thiếu: {0}', [stack.missing.map(m => m.tool).join(', ')]);
    case 'git':
      if (form.git.provider === 'local') return '';
      if (!form.git.owner) return form.git.provider === 'github' ? tr('Chọn tài khoản hoặc tổ chức GitHub') : tr('Chọn group GitLab');
      return '';
    case 'team':
      return (form.brief || '').length > 20000 ? tr('Tài liệu tối đa 20.000 ký tự') : '';
    case 'workflow': return form.workflow ? workflowProblem(form.workflow) : '';
    case 'arch':
      if (!form.archFirst) return '';
      if ((form.requirements || '').trim().length < 20) return tr('Mô tả hệ thống cần xây (ít nhất 20 ký tự) để kiến trúc sư AI làm việc');
      return form.requirements.length > 20000 ? tr('Yêu cầu tối đa 20.000 ký tự') : '';
    case 'options':
      for (const o of stack?.options || []) {
        if (o.type === 'text' && !new RegExp(o.pattern).test(String(form.options[o.id] ?? ''))) return `${o.label}: ${o.help || tr('không hợp lệ')}`;
      }
      return '';
    default: return '';
  }
}

export function choiceLabel(option, value) {
  if (option.type === 'bool') return value ? tr('Có') : tr('Không');
  return option.choices?.find(c => c.id === value)?.label ?? String(value ?? '');
}

/** Summary rows for the review step. */
export function summary(form, stack, catalog, fstack = null) {
  const rows = [[tr('Tên'), form.name], ['Slug', form.slug]];
  if (form.description) rows.push([tr('Mô tả'), form.description]);
  if (form.kind === 'fullstack' && fstack) {
    rows.push([tr('Kiểu dự án'), tr('Fullstack — backend/ + frontend/ trong một repo')]);
    rows.push(['Backend', `${stack.languageLabel} · ${stack.label}`]);
    for (const o of stack.options) rows.push([`Backend · ${o.label}`, choiceLabel(o, form.options[o.id])]);
    rows.push(['Frontend', `${fstack.languageLabel} · ${fstack.label}`]);
    for (const o of fstack.options) rows.push([`Frontend · ${o.label}`, choiceLabel(o, form.frontend?.options?.[o.id])]);
  } else {
    rows.push([tr('Ngôn ngữ'), stack.languageLabel], ['Framework', stack.label]);
    for (const o of stack.options) rows.push([o.label, choiceLabel(o, form.options[o.id])]);
  }
  rows.push(['Kho Git', gitLabel(form.git)]);
  if (form.workflow) rows.push([tr('Quy trình tính năng'), workflowLabel(form.workflow)]);
  rows.push([tr('Kiến trúc'), form.archFirst ? tr('AI soạn kiến trúc → bạn duyệt → rồi mới tạo khung dự án') : tr('Tạo khung ngay (không duyệt kiến trúc trước)')]);
  rows.push([tr('Đội AI'), form.aiTeam === false ? tr('Không (chỉ dùng luật khởi đầu)') : tr('AI Manager soạn luật, bạn duyệt{0}', [form.brief?.trim() ? tr(' · có tài liệu kèm') : ''])]);
  const roleEntries = Object.entries(form.roleSkills || {});
  const customizedRoles = roleEntries.filter(([, cfg]) => (cfg?.skills?.length > 0) || (cfg?.customRule || '').trim());
  if (customizedRoles.length > 0) {
    const roleLabels = customizedRoles.map(([r, cfg]) => {
      const rName = catalog?.roles?.[r]?.label || FALLBACK_ROLES[r]?.label || r;
      const skCount = cfg?.skills?.length || 0;
      const hasCustom = !!(cfg?.customRule || '').trim();
      return `${rName} (${skCount} skill${hasCustom ? tr(' + chỉ dẫn riêng') : ''})`;
    });
    rows.push([tr('Kỹ năng AI (Skills)'), roleLabels.join('; ')]);
  }
  return rows;
}

export const PROVIDER_LABEL = { local: tr('Chỉ trên máy'), github: 'GitHub', gitlab: 'GitLab' };

export function gitLabel(git) {
  if (!git || git.provider === 'local') return tr('Chỉ trên máy (nhánh main + development)');
  const where = git.ownerLabel || git.owner;
  return tr('{0} · {1} · {2} (push main + development, có CI)', [PROVIDER_LABEL[git.provider], where, git.visibility === 'public' ? tr('công khai') : tr('riêng tư')]);
}

export const BLUEPRINT_STATUS = {
  queued: tr('Đang xếp hàng…'), drafting: tr('Kiến trúc sư AI đang soạn kiến trúc…'),
  'awaiting-review': tr('Đã nộp bản kiến trúc — vào "Chờ duyệt" để xem và duyệt'), building: tr('Kiến trúc đã duyệt — đang tạo khung dự án…'),
  done: tr('Kiến trúc đã duyệt, khung dự án đã tạo'), cancelled: tr('Bản kiến trúc đã bị huỷ — dự án chưa có code'), error: tr('Lỗi'),
};

export const SETUP_STATUS = {
  queued: tr('Đang xếp hàng…'), drafting: tr('AI Manager đang soạn luật…'), 'awaiting-review': tr('Đã nộp bộ luật — vào "Chờ duyệt" để xem và duyệt'),
  publishing: tr('Đang commit luật đã duyệt…'), done: tr('Luật đã được duyệt và commit vào development'), cancelled: tr('Đã huỷ'), error: tr('Lỗi'),
};

/** "Plan — Kiến trúc → Lập trình (tự duyệt) → Kiểm thử" for the review step. */
export function workflowLabel(workflow) {
  const shape = w => w.map(x => `${x.step}:${x.mode}`).join();
  const preset = WORKFLOW_PRESETS.find(p => shape(p.steps) === shape(workflow));
  const steps = workflow.filter(w => w.mode !== 'SKIP').map(w => `${STEP_LABEL[w.step]}${w.mode === 'AUTO' ? tr(' (tự duyệt)') : ''}`).join(' → ');
  const tuned = workflow.filter(w => w.mode !== 'SKIP' && w.config && Object.keys(w.config).some(k => w.config[k] !== '' && w.config[k] != null)).length;
  return `${preset ? `${preset.label}: ` : ''}${steps}${tuned ? tr(' · cấu hình riêng ở {0} bước', [tuned]) : ''}`;
}

export const DEFAULT_WORKFLOW = WORKFLOW_PRESETS[0].steps;

/** The wizard fields an AI advice fills in (the human can still change every one of them). */
export function applyAdvice(form, advice, catalog) {
  const preset = WORKFLOW_PRESETS.find(p => p.id === advice.workflow);
  return {
    ...form,
    kind: advice.kind, language: advice.language, stack: advice.stack, options: { ...advice.options },
    frontend: advice.frontend ? { stack: advice.frontend.stack, options: { ...advice.frontend.options } } : { stack: '', options: {} },
    roleSkills: defaultRoleSkills(catalog, advice.stack),
    archFirst: !!advice.archFirst,
    ...(preset ? { workflow: preset.steps } : {}),
  };
}
