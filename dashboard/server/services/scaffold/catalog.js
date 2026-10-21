import javaSpring from './stacks/java-spring.js';
import pythonFastapi from './stacks/python-fastapi.js';
import tsReactVite from './stacks/ts-react-vite.js';
import tsNestjs from './stacks/ts-nestjs.js';
import { DB_LABEL } from './dbs.js';
import { SLUG_RE } from './util.js';
import { ROLE_META, SKILL_CATALOG, defaultRoleSkillsForStack } from './team.js';
import { BACKEND_STACKS, FRONTEND_STACKS } from './fullstack.js';

export const STACKS = [javaSpring, pythonFastapi, tsReactVite, tsNestjs];

const TOOL_HINT = {
  java: 'Cài JDK (ví dụ: sudo apt install openjdk-21-jdk)',
  node: 'Cài Node.js 20+ (https://nodejs.org)',
  npm: 'Cài npm cùng Node.js',
  uv: 'Cài uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
  git: 'Cài git (sudo apt install git)',
  unzip: 'Cài unzip (sudo apt install unzip)',
};

export const choiceOf = c => (typeof c === 'string' ? { id: c, label: DB_LABEL[c] || c } : c);

/** Catalog for the wizard: languages → stacks → options, with what is missing on this machine. */
export function publicCatalog(tools, stacks = STACKS) {
  const languages = [];
  for (const s of stacks) {
    let lang = languages.find(l => l.id === s.language);
    if (!lang) languages.push(lang = { id: s.language, label: s.languageLabel, stacks: [] });
    const missing = [...new Set(s.requires({}))].filter(t => !tools[t]?.ok);
    lang.stacks.push({
      id: s.id, label: s.label, description: s.description, noDatabase: !!s.noDatabase,
      // which half of a fullstack repo this stack can be
      role: BACKEND_STACKS.includes(s.id) ? 'backend' : FRONTEND_STACKS.includes(s.id) ? 'frontend' : null,
      options: s.options.map(o => ({ ...o, choices: o.choices?.map(choiceOf) })),
      available: missing.length === 0,
      missing: missing.map(t => ({ tool: t, hint: TOOL_HINT[t] || '' })),
      defaultRoleSkills: defaultRoleSkillsForStack(s.id),
    });
  }
  return { languages, roles: ROLE_META, skillCatalog: SKILL_CATALOG, kinds: ['single', 'fullstack'] };
}

export function stackById(id, stacks = STACKS) {
  return stacks.find(s => s.id === id) || null;
}

const bad = msg => Object.assign(new Error(msg), { status: 400 });

export function validateRoleSkills(rs) {
  if (!rs || typeof rs !== 'object') return undefined;
  const out = {};
  for (const role of Object.keys(ROLE_META)) {
    const item = rs[role];
    if (!item || typeof item !== 'object') continue;
    const skills = Array.isArray(item.skills)
      ? item.skills.filter(s => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{0,60}$/.test(s))
      : [];
    const customRule = String(item.customRule || '').trim().slice(0, 4000);
    out[role] = { skills, customRule };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validate a wizard submission against the catalog. Unknown keys are dropped; every option is
 * either a listed choice, a boolean, or text matching its pattern, so nothing free-form reaches
 * a command line.
 */
export function validateRequest(body, tools, stacks = STACKS) {
  const b = body || {};
  const name = String(b.name || '').trim();
  const slug = String(b.slug || '').trim();
  const description = String(b.description || '').trim();
  if (!name || name.length > 100) throw bad('Tên dự án bắt buộc, tối đa 100 ký tự');
  if (!SLUG_RE.test(slug)) throw bad('Slug chỉ gồm chữ thường, số và dấu gạch ngang, 3–40 ký tự, bắt đầu bằng chữ');
  if (description.length > 500) throw bad('Mô tả tối đa 500 ký tự');
  if (/[\r\n]/.test(name) || /[\r\n]/.test(description)) throw bad('Tên và mô tả phải trên một dòng');
  const stack = stackById(String(b.stack || ''), stacks);
  if (!stack) throw bad('Framework không hợp lệ');

  const kind = b.kind === 'fullstack' ? 'fullstack' : 'single';
  const options = validateOptions(stack, b.options);
  let frontend = null;
  if (kind === 'fullstack') {
    if (!BACKEND_STACKS.includes(stack.id)) throw bad('Dự án fullstack: phần backend phải là Spring Boot, FastAPI hoặc NestJS');
    const fstack = stackById(String(b.frontend?.stack || ''), stacks);
    if (!fstack || !FRONTEND_STACKS.includes(fstack.id)) throw bad('Dự án fullstack: chọn framework cho frontend');
    frontend = { stack: fstack.id, options: validateOptions(fstack, b.frontend?.options) };
  }
  const parts = [[stack, options], ...(frontend ? [[stackById(frontend.stack, stacks), frontend.options]] : [])];
  const missing = [...new Set(parts.flatMap(([st, o]) => st.requires(o)))].filter(t => !tools[t]?.ok);
  if (missing.length) throw bad(`Máy chủ thiếu công cụ: ${missing.join(', ')}. ${missing.map(t => TOOL_HINT[t]).filter(Boolean).join(' · ')}`);
  for (const [st, o] of parts) {
    const problem = st.check(o, tools);
    if (problem) throw bad(problem);
  }
  const brief = String(b.brief || '').trim();
  if (brief.length > 20000) throw bad('Tài liệu cho AI tối đa 20.000 ký tự (tải thêm file sau)');
  const roleSkills = validateRoleSkills(b.roleSkills);
  const workflow = b.workflow == null ? null : validateWorkflow(b.workflow);
  // Architecture first: an AI architect drafts architecture.md from these requirements and a human
  // approves it before anything is generated.
  const archFirst = b.archFirst === true;
  const requirements = archFirst ? String(b.requirements || '').trim() : '';
  if (archFirst && requirements.length < 20) throw bad('Duyệt kiến trúc trước: mô tả hệ thống cần xây (ít nhất 20 ký tự)');
  if (requirements.length > 20000) throw bad('Yêu cầu cho kiến trúc sư tối đa 20.000 ký tự');
  return {
    name, slug, description, kind, stack: stack.id, options, ...(frontend ? { frontend } : {}),
    git: validateGit(b.git), aiTeam: b.aiTeam !== false, brief, ...(archFirst ? { archFirst, requirements } : {}),
    ...(workflow ? { workflow } : {}),
    ...(roleSkills ? { roleSkills } : {}),
  };
}

/** Every option is a listed choice, a boolean, or text matching its pattern (never free-form to a shell). */
export function validateOptions(stack, given = {}) {
  const options = {};
  for (const o of stack.options) {
    const v = (given || {})[o.id] ?? o.default;
    if (o.type === 'bool') options[o.id] = v === true || v === 'true';
    else if (o.type === 'choice') {
      const ids = o.choices.map(c => choiceOf(c).id);
      if (!ids.includes(String(v))) throw bad(`${o.label}: giá trị không hợp lệ`);
      options[o.id] = String(v);
    } else {
      const s = String(v).trim();
      if (!new RegExp(o.pattern).test(s)) throw bad(`${o.label}: ${o.help || 'không hợp lệ'}`);
      options[o.id] = s;
    }
  }
  if (stack.noDatabase) options.db = 'none';
  return options;
}

const WF_STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
const WF_DOCS = ['PM', 'BA', 'ARCH', 'DESIGN'];
/** The project's feature workflow chosen in the wizard (same rules as the orchestrator). */
export function validateWorkflow(w) {
  if (!Array.isArray(w) || w.length !== WF_STEPS.length) throw bad('Quy trình phải có đủ 6 bước');
  const out = w.map(x => ({ step: String(x?.step || '').toUpperCase(), mode: String(x?.mode || '').toUpperCase() }));
  const order = out.map(x => x.step);
  if (WF_STEPS.some(st => !order.includes(st))) throw bad('Quy trình phải có đủ 6 bước');
  if (out.some(x => !['REQUIRED', 'AUTO', 'SKIP'].includes(x.mode))) throw bad('Chế độ bước phải là REQUIRED, AUTO hoặc SKIP');
  const dev = order.indexOf('DEV');
  if (WF_DOCS.some(st => order.indexOf(st) > dev) || order.indexOf('TEST') < dev) throw bad('Quy trình: các bước tài liệu trước Code, Test sau Code');
  if (out[dev].mode === 'SKIP') throw bad('Không thể bỏ bước Code');
  return out;
}

/** local | github (owner = user/org login) | gitlab (owner = namespace id); private unless asked. */
export function validateGit(g = {}) {
  const provider = String(g?.provider || 'local');
  if (provider === 'local') return { provider };
  if (!['github', 'gitlab'].includes(provider)) throw bad('Nơi lưu repo không hợp lệ');
  const owner = String(g.owner || '').trim();
  const ok = provider === 'github' ? /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) : /^\d{1,12}$/.test(owner);
  if (!ok) throw bad(provider === 'github' ? 'Chọn tài khoản hoặc tổ chức GitHub' : 'Chọn group/namespace GitLab');
  const visibility = g.visibility === 'public' ? 'public' : 'private';
  return { provider, owner, visibility };
}

