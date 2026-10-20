import javaSpring from './stacks/java-spring.js';
import pythonFastapi from './stacks/python-fastapi.js';
import tsReactVite from './stacks/ts-react-vite.js';
import tsNestjs from './stacks/ts-nestjs.js';
import { DB_LABEL } from './dbs.js';
import { SLUG_RE } from './util.js';
import { ROLE_META, SKILL_CATALOG, defaultRoleSkillsForStack } from './team.js';

export const STACKS = [javaSpring, pythonFastapi, tsReactVite, tsNestjs];

const TOOL_HINT = {
  java: 'Cài JDK (ví dụ: sudo apt install openjdk-21-jdk)',
  node: 'Cài Node.js 20+ (https://nodejs.org)',
  npm: 'Cài npm cùng Node.js',
  uv: 'Cài uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
  git: 'Cài git (sudo apt install git)',
  unzip: 'Cài unzip (sudo apt install unzip)',
};

const choiceOf = c => (typeof c === 'string' ? { id: c, label: DB_LABEL[c] || c } : c);

/** Catalog for the wizard: languages → stacks → options, with what is missing on this machine. */
export function publicCatalog(tools, stacks = STACKS) {
  const languages = [];
  for (const s of stacks) {
    let lang = languages.find(l => l.id === s.language);
    if (!lang) languages.push(lang = { id: s.language, label: s.languageLabel, stacks: [] });
    const missing = [...new Set(s.requires({}))].filter(t => !tools[t]?.ok);
    lang.stacks.push({
      id: s.id, label: s.label, description: s.description, noDatabase: !!s.noDatabase,
      options: s.options.map(o => ({ ...o, choices: o.choices?.map(choiceOf) })),
      available: missing.length === 0,
      missing: missing.map(t => ({ tool: t, hint: TOOL_HINT[t] || '' })),
      defaultRoleSkills: defaultRoleSkillsForStack(s.id),
    });
  }
  return { languages, roles: ROLE_META, skillCatalog: SKILL_CATALOG };
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

  const given = b.options || {};
  const options = {};
  for (const o of stack.options) {
    const v = given[o.id] ?? o.default;
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

  const missing = [...new Set(stack.requires(options))].filter(t => !tools[t]?.ok);
  if (missing.length) throw bad(`Máy chủ thiếu công cụ: ${missing.join(', ')}. ${missing.map(t => TOOL_HINT[t]).filter(Boolean).join(' · ')}`);
  const problem = stack.check(options, tools);
  if (problem) throw bad(problem);
  const brief = String(b.brief || '').trim();
  if (brief.length > 20000) throw bad('Tài liệu cho AI tối đa 20.000 ký tự (tải thêm file sau)');
  const roleSkills = validateRoleSkills(b.roleSkills);
  return {
    name, slug, description, stack: stack.id, options, git: validateGit(b.git), aiTeam: b.aiTeam !== false, brief,
    ...(roleSkills ? { roleSkills } : {}),
  };
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

