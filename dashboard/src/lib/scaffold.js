import { authFetch } from './api.js';

// Project wizard client (server: dashboard/server/routes/scaffold.js) + pure helpers for the steps.
import { WORKFLOW_PRESETS, workflowProblem, STEP_LABEL } from './review.js';

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
  PM:     { label: 'AI PM (Quản lý sản phẩm)', desc: 'Lập kế hoạch, ưu tiên backlog, chia nhỏ user story' },
  BA:     { label: 'AI BA (Phân tích nghiệp vụ)', desc: 'Đặc tả yêu cầu, luồng nghiệp vụ, tiêu chí nghiệm thu' },
  ARCH:   { label: 'AI Kiến trúc (Architect)', desc: 'Thiết kế kiến trúc, database schema, hợp đồng API' },
  DESIGN: { label: 'AI Thiết kế (UI/UX)', desc: 'Thiết kế giao diện, trải nghiệm người dùng, design tokens' },
  DEV:    { label: 'AI Lập trình (Developer)', desc: 'Viết code tính năng, tích hợp DB/API, viết unit test' },
  TEST:   { label: 'AI Kiểm thử (QA/Tester)', desc: 'Kiểm thử tự động, kiểm thử biên, báo cáo chất lượng' },
  REVIEW: { label: 'AI Review Code', desc: 'Đánh giá code, kiểm tra bảo mật, hiệu năng và chuẩn dự án' },
  DEVOPS: { label: 'AI DevOps', desc: 'Cấu hình Docker, CI/CD pipeline, biến môi trường và triển khai' },
};

export const FALLBACK_SKILL_CATALOG = [
  { id: 'spring-rest-jpa', label: 'Spring Boot REST & JPA chuẩn', desc: 'Chuẩn Controller → Service → Repository, DTO validation, phân trang và xử lý lỗi tập trung.', roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['java-spring'] },
  { id: 'spring-security-jwt', label: 'Bảo mật Spring Security & RBAC', desc: 'Kiểm soát phân quyền endpoint, xác thực JWT/Session, chống SQLi/XSS.', roles: ['DEV', 'ARCH', 'REVIEW', 'TEST'], stacks: ['java-spring'] },
  { id: 'flyway-db-migration', label: 'Quản lý Migration DB an toàn', desc: 'Mọi thay đổi schema phải tạo script migration có thứ tự, tương thích ngược.', roles: ['ARCH', 'DEV', 'DEVOPS'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs'] },
  { id: 'fastapi-async-pydantic', label: 'FastAPI Async & Pydantic v2', desc: 'Tách router/service, khai báo schema Pydantic chặt chẽ, dependency injection.', roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['python-fastapi'] },
  { id: 'nestjs-modular-arch', label: 'Kiến trúc Module NestJS', desc: 'Tách Module, Controller, Injectable Service, DTO class-validator rõ ràng.', roles: ['DEV', 'ARCH', 'REVIEW'], stacks: ['ts-nestjs'] },
  { id: 'impeccable-style', label: 'Impeccable Design System (impeccable.style)', desc: 'Bộ ngôn ngữ thiết kế UI/UX chuẩn Impeccable (24 lệnh: /impeccable polish, distill, critique, audit, clarify…) chống giao diện AI rập khuôn.', roles: ['DESIGN', 'DEV', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'apple-design', label: 'Apple Fluid Interface Design (WWDC / Emil Kowalski)', desc: 'Triết lý thiết kế giao diện mượt mà của Apple (WWDC Fluid Interfaces): phản hồi tức thì trên pointer-down, chuyển động spring có thể ngắt quãng, tính nhất quán không gian và typography chuẩn xác.', roles: ['DESIGN', 'DEV', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'react-a11y-components', label: 'React Component & Accessibility', desc: 'Tách component tái sử dụng, quản lý state sạch, hỗ trợ bàn phím và aria-label.', roles: ['DESIGN', 'DEV', 'TEST'], stacks: ['ts-react', 'ts-react-vite'] },
  { id: 'clean-code-tdd', label: 'Clean Code & Unit Test bắt buộc', desc: 'Mỗi tính năng mới của AI Dev phải kèm тест tự động và không làm gãy test cũ.', roles: ['DEV', 'TEST', 'REVIEW'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'api-contract-first', label: 'Thiết kế API Contract-First', desc: 'Thống nhất cấu trúc request/response và mã lỗi HTTP trước khi code.', roles: ['BA', 'ARCH', 'DEV', 'TEST'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
  { id: 'security-owasp-check', label: 'Kiểm tra bảo mật OWASP Top 10', desc: 'Rà soát lỗ hổng phân quyền, lộ thông tin nhạy cảm, injection và phụ thuộc.', roles: ['ARCH', 'DEV', 'REVIEW', 'TEST'], stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react', 'ts-react-vite'] },
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
  { id: 'single', label: 'Một ứng dụng', desc: 'Một backend hoặc một frontend, nằm ở thư mục gốc của repo' },
  { id: 'fullstack', label: 'Fullstack: backend + frontend',
    desc: 'Một repo gồm backend/ và frontend/, nối sẵn qua /api, chạy cả hai bằng ./dev.sh' },
];

/** Languages offered at the language step: a fullstack project picks its BACKEND language there. */
export function languagesFor(catalog, kind) {
  const langs = catalog?.languages || [];
  if (kind !== 'fullstack') return langs;
  return langs.map(l => ({ ...l, stacks: l.stacks.filter(s => s.role === 'backend') })).filter(l => l.stacks.length);
}

/** Frontend frameworks for the fullstack frontend step. */
export function frontendStacks(catalog) {
  return (catalog?.languages || []).flatMap(l => l.stacks.filter(s => s.role === 'frontend')
    .map(s => ({ ...s, language: l.id, languageLabel: l.label })));
}

/** Wizard steps; the database step disappears for stacks without one (React + Vite). */
export function wizardSteps(stack, kind = 'single') {
  const fullstack = kind === 'fullstack';
  return [
    { id: 'info', label: 'Thông tin' },
    { id: 'need', label: 'Yêu cầu & tư vấn AI' },
    { id: 'kind', label: 'Kiểu dự án' },
    { id: 'language', label: fullstack ? 'Ngôn ngữ backend' : 'Ngôn ngữ' },
    { id: 'stack', label: fullstack ? 'Backend' : 'Framework' },
    ...(stack?.noDatabase ? [] : [{ id: 'db', label: 'Database' }]),
    { id: 'options', label: fullstack ? 'Tuỳ chọn backend' : 'Tuỳ chọn' },
    ...(fullstack ? [{ id: 'frontend', label: 'Frontend' }] : []),
    { id: 'git', label: 'Kho Git' },
    { id: 'arch', label: 'Kiến trúc' },
    { id: 'workflow', label: 'Quy trình' },
    { id: 'team', label: 'Đội AI & Skill' },
    { id: 'review', label: 'Xem lại' },
  ];
}

/** Why the user cannot leave this step yet ('' = can continue). */
export function stepProblem(step, form, stack, fstack = null) {
  switch (step) {
    case 'kind': return form.kind ? '' : 'Chọn kiểu dự án';
    case 'frontend':
      if (!fstack) return 'Chọn framework cho frontend';
      return fstack.available ? '' : `Máy chủ thiếu: ${fstack.missing.map(m => m.tool).join(', ')}`;
    case 'info':
      if (!form.name.trim()) return 'Nhập tên dự án';
      if (!SLUG_RE.test(form.slug)) return 'Slug: 3–40 ký tự gồm chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ';
      return '';
    case 'language': return form.language ? '' : 'Chọn ngôn ngữ';
    case 'stack':
      if (!stack) return 'Chọn framework';
      return stack.available ? '' : `Máy chủ thiếu: ${stack.missing.map(m => m.tool).join(', ')}`;
    case 'git':
      if (form.git.provider === 'local') return '';
      if (!form.git.owner) return form.git.provider === 'github' ? 'Chọn tài khoản hoặc tổ chức GitHub' : 'Chọn group GitLab';
      return '';
    case 'team':
      return (form.brief || '').length > 20000 ? 'Tài liệu tối đa 20.000 ký tự' : '';
    case 'workflow': return form.workflow ? workflowProblem(form.workflow) : '';
    case 'arch':
      if (!form.archFirst) return '';
      if ((form.requirements || '').trim().length < 20) return 'Mô tả hệ thống cần xây (ít nhất 20 ký tự) để kiến trúc sư AI làm việc';
      return form.requirements.length > 20000 ? 'Yêu cầu tối đa 20.000 ký tự' : '';
    case 'options':
      for (const o of stack?.options || []) {
        if (o.type === 'text' && !new RegExp(o.pattern).test(String(form.options[o.id] ?? ''))) return `${o.label}: ${o.help || 'không hợp lệ'}`;
      }
      return '';
    default: return '';
  }
}

export function choiceLabel(option, value) {
  if (option.type === 'bool') return value ? 'Có' : 'Không';
  return option.choices?.find(c => c.id === value)?.label ?? String(value ?? '');
}

/** Summary rows for the review step. */
export function summary(form, stack, catalog, fstack = null) {
  const rows = [['Tên', form.name], ['Slug', form.slug]];
  if (form.description) rows.push(['Mô tả', form.description]);
  if (form.kind === 'fullstack' && fstack) {
    rows.push(['Kiểu dự án', 'Fullstack — backend/ + frontend/ trong một repo']);
    rows.push(['Backend', `${stack.languageLabel} · ${stack.label}`]);
    for (const o of stack.options) rows.push([`Backend · ${o.label}`, choiceLabel(o, form.options[o.id])]);
    rows.push(['Frontend', `${fstack.languageLabel} · ${fstack.label}`]);
    for (const o of fstack.options) rows.push([`Frontend · ${o.label}`, choiceLabel(o, form.frontend?.options?.[o.id])]);
  } else {
    rows.push(['Ngôn ngữ', stack.languageLabel], ['Framework', stack.label]);
    for (const o of stack.options) rows.push([o.label, choiceLabel(o, form.options[o.id])]);
  }
  rows.push(['Kho Git', gitLabel(form.git)]);
  if (form.workflow) rows.push(['Quy trình tính năng', workflowLabel(form.workflow)]);
  rows.push(['Kiến trúc', form.archFirst ? 'AI soạn kiến trúc → bạn duyệt → rồi mới tạo khung dự án' : 'Tạo khung ngay (không duyệt kiến trúc trước)']);
  rows.push(['Đội AI', form.aiTeam === false ? 'Không (chỉ dùng luật khởi đầu)' : `AI Manager soạn luật, bạn duyệt${form.brief?.trim() ? ' · có tài liệu kèm' : ''}`]);
  const roleEntries = Object.entries(form.roleSkills || {});
  const customizedRoles = roleEntries.filter(([, cfg]) => (cfg?.skills?.length > 0) || (cfg?.customRule || '').trim());
  if (customizedRoles.length > 0) {
    const roleLabels = customizedRoles.map(([r, cfg]) => {
      const rName = catalog?.roles?.[r]?.label || FALLBACK_ROLES[r]?.label || r;
      const skCount = cfg?.skills?.length || 0;
      const hasCustom = !!(cfg?.customRule || '').trim();
      return `${rName} (${skCount} skill${hasCustom ? ' + chỉ dẫn riêng' : ''})`;
    });
    rows.push(['Kỹ năng AI (Skills)', roleLabels.join('; ')]);
  }
  return rows;
}

export const PROVIDER_LABEL = { local: 'Chỉ trên máy', github: 'GitHub', gitlab: 'GitLab' };

export function gitLabel(git) {
  if (!git || git.provider === 'local') return 'Chỉ trên máy (nhánh main + development)';
  const where = git.ownerLabel || git.owner;
  return `${PROVIDER_LABEL[git.provider]} · ${where} · ${git.visibility === 'public' ? 'công khai' : 'riêng tư'} (push main + development, có CI)`;
}

export const BLUEPRINT_STATUS = {
  queued: 'Đang xếp hàng…', drafting: 'Kiến trúc sư AI đang soạn kiến trúc…',
  'awaiting-review': 'Đã nộp bản kiến trúc — vào "Chờ duyệt" để xem và duyệt', building: 'Kiến trúc đã duyệt — đang tạo khung dự án…',
  done: 'Kiến trúc đã duyệt, khung dự án đã tạo', cancelled: 'Bản kiến trúc đã bị huỷ — dự án chưa có code', error: 'Lỗi',
};

export const SETUP_STATUS = {
  queued: 'Đang xếp hàng…', drafting: 'AI Manager đang soạn luật…', 'awaiting-review': 'Đã nộp bộ luật — vào "Chờ duyệt" để xem và duyệt',
  publishing: 'Đang commit luật đã duyệt…', done: 'Luật đã được duyệt và commit vào development', cancelled: 'Đã huỷ', error: 'Lỗi',
};

/** "Plan — Kiến trúc → Lập trình (tự duyệt) → Kiểm thử" for the review step. */
export function workflowLabel(workflow) {
  const preset = WORKFLOW_PRESETS.find(p => JSON.stringify(p.steps) === JSON.stringify(workflow));
  const steps = workflow.filter(w => w.mode !== 'SKIP').map(w => `${STEP_LABEL[w.step]}${w.mode === 'AUTO' ? ' (tự duyệt)' : ''}`).join(' → ');
  return preset ? `${preset.label}: ${steps}` : steps;
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
