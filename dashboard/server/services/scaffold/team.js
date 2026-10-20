import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from '../config.js';
import { SLUG_RE } from './util.js';

const ROLES = {
  MANAGER: { label: 'AI Manager', desc: 'Tổng hợp tài liệu người dùng và cập nhật bộ luật dự án', reads: [] },
  PM: { label: 'AI PM', desc: 'Viết PRD, User Story, phạm vi tính năng và tiêu chí nghiệm thu', reads: ['rules/project.md'] },
  BA: { label: 'AI BA', desc: 'Phân tích nghiệp vụ, luồng dữ liệu, edge cases và quy tắc domain', reads: ['rules/project.md'] },
  ARCH: { label: 'AI Kiến trúc', desc: 'Thiết kế kiến trúc tầng, database schema, hợp đồng API và bảo mật', reads: ['rules/project.md', 'rules/dev.md'] },
  DESIGN: { label: 'AI Thiết kế', desc: 'Thiết kế giao diện UI/UX, trạng thái màn hình và responsive', reads: ['rules/project.md'] },
  DEV: { label: 'AI Dev', desc: 'Trực tiếp lập trình tính năng, viết unit/integration test và tuân thủ kiến trúc', reads: ['rules/project.md', 'rules/dev.md'] },
  REVIEW: { label: 'AI Review', desc: 'Kiểm tra code, bắt lỗi bảo mật, hiệu năng và đối chiếu luật dự án', reads: ['rules/project.md', 'rules/dev.md', 'rules/review.md'] },
  TEST: { label: 'AI Tester', desc: 'Kiểm thử tự động, đối chiếu từng tiêu chí nghiệm thu (AC) và báo cáo lỗi', reads: ['rules/project.md', 'rules/dev.md', 'rules/test.md'] },
  DEVOPS: { label: 'AI DevOps', desc: 'Đóng gói Docker, cấu hình CI/CD, biến môi trường và triển khai', reads: ['rules/project.md', 'rules/devops.md'] },
};

export const ROLE_META = ROLES;

export const SKILL_CATALOG = [
  {
    id: 'spring-layered-dto',
    label: 'Spring Boot Layered & DTO',
    stacks: ['java-spring'],
    roles: ['ARCH', 'DEV', 'REVIEW'],
    desc: 'Phân tầng Controller → Service → Repository, tách biệt Entity và Request/Response DTO, dùng Jakarta Validation.',
    content: `# Skill: Spring Boot Layered Architecture & DTO\n- Tuyệt đối không trả trực tiếp JPA @Entity ra REST Controller.\n- Luôn tạo Request/Response DTO rõ ràng với @Valid, @NotNull, @NotBlank.\n- Dùng Constructor Injection thay vì @Autowired trên field.\n- Xử lý ngoại lệ tập trung qua @RestControllerAdvice.`,
  },
  {
    id: 'jpa-transaction-safety',
    label: 'An toàn Transaction & JPA/SQL',
    stacks: ['java-spring'],
    roles: ['ARCH', 'DEV', 'REVIEW', 'TEST'],
    desc: 'Kiểm soát @Transactional, tránh lỗi N+1 query, tối ưu index và viết integration test với H2.',
    content: `# Skill: JPA & Transaction Safety\n- Đặt @Transactional(readOnly = true) cho các truy vấn đọc và @Transactional ở tầng Service cho thao tác ghi.\n- Tránh lỗi N+1 query bằng @EntityGraph hoặc JOIN FETCH.`,
  },
  {
    id: 'fastapi-clean-pydantic',
    label: 'FastAPI Clean Router & Pydantic v2',
    stacks: ['python-fastapi'],
    roles: ['ARCH', 'DEV', 'REVIEW'],
    desc: 'Tổ chức router theo miền nghiệp vụ, Pydantic v2 schema chặt chẽ, quản lý DB session qua Depends(get_db).',
    content: `# Skill: FastAPI Clean Router & Pydantic v2\n- Tách riêng Pydantic schema khỏi SQLAlchemy model.\n- Sử dụng Depends(get_db) cho mọi thao tác cơ sở dữ liệu.`,
  },
  {
    id: 'nestjs-modular-dto',
    label: 'NestJS Modular & DTO Validation',
    stacks: ['ts-nestjs'],
    roles: ['ARCH', 'DEV', 'REVIEW'],
    desc: 'Thiết kế theo Module độc lập, dùng class-validator/class-transformer và ConfigService.',
    content: `# Skill: NestJS Modular Architecture\n- Mỗi miền nghiệp vụ tách thành một Module riêng (Module, Controller, Service, DTO).\n- Không sử dụng kiểu any; đọc cấu hình qua ConfigService.`,
  },
  {
    id: 'react-modern-ui',
    label: 'React Hooks, A11y & Clean State',
    stacks: ['ts-react-vite'],
    roles: ['DESIGN', 'DEV', 'REVIEW', 'TEST'],
    desc: 'Tách biệt UI component và API client, hỗ trợ đầy đủ trạng thái loading/empty/error và khả năng truy cập (a11y).',
    content: `# Skill: React Modern UI & State\n- Mỗi màn hình phải xử lý đủ 4 trạng thái: Loading, Empty, Error, và Success.\n- Tách logic gọi API sang thư mục lib/ hoặc custom hooks.`,
  },
  {
    id: 'prd-acceptance-criteria',
    label: 'Chuẩn PRD & Acceptance Criteria (Gherkin)',
    stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react-vite'],
    roles: ['PM', 'BA', 'TEST'],
    desc: 'Viết tài liệu yêu cầu với tiêu chí nghiệm thu Given/When/Then rõ ràng để AI Dev và AI Tester đối chiếu.',
    content: `# Skill: PRD & Acceptance Criteria chuẩn Gherkin\n- Mỗi tính năng phải liệt kê rõ danh sách Tiêu chí nghiệm thu (AC-1, AC-2...) theo cấu trúc Given / When / Then.`,
  },
  {
    id: 'api-contract-security',
    label: 'Thiết kế Hợp đồng API & Bảo mật OWASP',
    stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react-vite'],
    roles: ['BA', 'ARCH', 'DEV', 'REVIEW'],
    desc: 'Chuẩn hóa RESTful API, phân trang, xác thực/phân quyền và chống SQLi/XSS/IDOR.',
    content: `# Skill: API Contract & Bảo mật OWASP\n- Mọi API thay đổi dữ liệu phải kiểm tra quyền sở hữu tài nguyên và xác thực hợp lệ.\n- Không lộ stack trace, mật khẩu hoặc token trong log hay phản hồi lỗi.`,
  },
  {
    id: 'ac-driven-testing',
    label: 'Kiểm thử bám sát AC & Regression Test',
    stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react-vite', 'ts-react'],
    roles: ['DEV', 'TEST', 'REVIEW'],
    desc: 'Mỗi tiêu chí nghiệm thu (AC) phải có ít nhất 1 test tự động kiểm chứng cả luồng chính lẫn luồng lỗi.',
    content: `# Skill: AC-Driven Automated Testing\n- Với mỗi tiêu chí nghiệm thu (AC) trong spec, phải có ít nhất 1 test case tự động tương ứng.\n- Kiểm tra cả happy path (2xx) và validation/error path (4xx).`,
  },
  {
    id: 'impeccable-style',
    label: 'Impeccable Design System (impeccable.style)',
    stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react-vite', 'ts-react'],
    roles: ['DESIGN', 'DEV', 'REVIEW'],
    desc: 'Bộ ngôn ngữ thiết kế UI/UX chuẩn Impeccable (24 lệnh: /impeccable polish, distill, critique, audit, clarify…) chống giao diện AI rập khuôn.',
    content: `# Skill: Impeccable Design System (impeccable.style)\n- Áp dụng tiêu chuẩn thiết kế Impeccable: phân cấp thị giác rõ ràng (distill), loại bỏ các dấu hiệu AI slop (cards lồng trong cards, chữ xám trên nền màu, lạm dụng gradient tím-xanh).\n- Hỗ trợ 24 lệnh thiết kế (/impeccable init, craft, polish, critique, audit, distill, clarify, typeset, layout, animate, harden).\n- Luôn đảm bảo độ tương phản chuẩn, khoảng cách có nhịp điệu (visual rhythm), và trải nghiệm bàn phím/accessibility đầy đủ.`,
  },
  {
    id: 'apple-design',
    label: 'Apple Fluid Interface Design (WWDC / Emil Kowalski)',
    stacks: ['java-spring', 'python-fastapi', 'ts-nestjs', 'ts-react-vite', 'ts-react'],
    roles: ['DESIGN', 'DEV', 'REVIEW'],
    desc: 'Triết lý thiết kế giao diện mượt mà của Apple (WWDC Fluid Interfaces): phản hồi tức thì trên pointer-down, chuyển động spring có thể ngắt quãng, tính nhất quán không gian, vật liệu mờ (backdrop-filter), và typography chuẩn xác.',
    content: `# Skill: Apple Fluid Interface Design (apple-design)\n- Phản hồi tức thì ngay khi nhấn (pointer-down scale 0.97 / 100ms ease-out), loại bỏ mọi độ trễ không cần thiết.\n- Chuyển động có thể ngắt quãng (interruptible) và định hướng lại bất kỳ lúc nào; ưu tiên spring critically damped (damping 1.0, response 0.35s-0.4s).\n- Tính nhất quán không gian (spatial consistency): thành phần xuất hiện từ đâu thì đóng về đúng hướng đó; neo transform-origin tại nút kích hoạt.\n- Độ sâu & Vật liệu (Materials): dùng backdrop-filter blur kèm saturate(180%), viền hairline 1px tinh tế, tôn trọng prefers-reduced-motion (chuyển sang cross-fade 150ms).\n- Typography kiểu Apple: font-variant-numeric: tabular-nums cho mọi con số động, tracking chặt hơn cho tiêu đề lớn (-0.02em) và thoáng hơn cho chữ nhỏ.`,
  },
];

export function defaultRoleSkillsForStack(stackId = 'java-spring') {
  const out = {};
  for (const role of Object.keys(ROLES)) {
    const matched = SKILL_CATALOG.filter(s => s.stacks.includes(stackId) && s.roles.includes(role)).map(s => s.id);
    out[role] = { skills: matched, customRule: '' };
  }
  return out;
}

const ROLE_RULE_FILE = {
  PM: 'rules/pm.md',
  BA: 'rules/ba.md',
  ARCH: 'rules/arch.md',
  DESIGN: 'rules/design.md',
  DEV: 'rules/dev.md',
  REVIEW: 'rules/review.md',
  TEST: 'rules/test.md',
  DEVOPS: 'rules/devops.md',
};

export function teamJson(roleSkills = null) {
  const roles = {};
  for (const [k, v] of Object.entries(ROLES)) {
    const custom = roleSkills?.[k];
    const reads = [...v.reads];
    const extraRule = ROLE_RULE_FILE[k];
    if (custom?.customRule?.trim() && extraRule && !reads.includes(extraRule)) {
      reads.push(extraRule);
    }
    const skills = Array.isArray(custom?.skills)
      ? custom.skills.filter(s => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(s))
      : [];
    roles[k] = { label: v.label, reads, skills };
  }
  return JSON.stringify({
    version: 1,
    note: 'Mỗi vai trò AI chỉ nhận các file trong "reads" (đọc từ nhánh development). Sửa file này để đổi ai đọc luật nào.',
    roles,
  }, null, 2) + '\n';
}

export const STACK_RULES = {
  'java-spring': o => [
    `- Java ${o.javaVersion}, Spring Boot. Code trong package gốc đã sinh; chia theo tầng \`controller\` → \`service\` → \`repository\`, DTO riêng cho request/response (không trả entity ra API).`,
    '- Inject bằng constructor (không dùng field injection). Cấu hình qua biến môi trường như trong `application.properties`.',
    '- Lỗi trả về theo một định dạng chung qua `@RestControllerAdvice`.',
  ],
  'python-fastapi': () => [
    '- Python có type hint đầy đủ; router theo từng nhóm chức năng trong `src/<package>/`, schema Pydantic riêng cho request/response.',
    '- Cấu hình chỉ đọc qua `config.get_settings()`; không đọc `os.environ` rải rác.',
    '- Truy cập DB qua dependency `get_db()`; không giữ session toàn cục.',
  ],
  'ts-react-vite': () => [
    '- React + TypeScript, function component và hooks; không dùng `any`.',
    '- Mỗi component một file, tên PascalCase; logic gọi API tách khỏi component.',
    '- Địa chỉ API đọc từ `import.meta.env.VITE_API_URL`.',
  ],
  'ts-nestjs': () => [
    '- NestJS theo module: mỗi chức năng một module (controller + service + DTO).',
    '- DTO kiểm tra đầu vào; cấu hình chỉ qua `ConfigService`.',
    '- Không dùng `any`; lỗi trả về bằng exception có sẵn của Nest.',
  ],
};

export function starterRules(ctx, stack) {
  const c = stack.commands(ctx);
  const o = ctx.options;
  const banner = '> Bản khởi đầu do Shipyard sinh theo framework đã chọn. AI Manager sẽ soạn lại cùng người duyệt; sửa trực tiếp file này cũng được.\n';
  return {
    'rules/project.md': `# Luật chung — ${ctx.name}

${banner}
## Công nghệ
- ${stack.languageLabel} · ${stack.label}${o.db && o.db !== 'none' ? ` · database ${o.db}` : ''}

## Quy ước code
${(STACK_RULES[stack.id]?.(o) || []).join('\n')}
- Đặt tên rõ nghĩa bằng tiếng Anh trong code; chú thích và tài liệu cho người dùng có thể bằng tiếng Việt.

## Git
- Nhánh tích hợp: \`development\`. Mỗi tính năng một nhánh, vào \`development\` qua pull request.
- Commit theo Conventional Commits: \`feat: …\`, \`fix: …\`, \`chore: …\`.
- Không commit \`.env\`, khoá hay mật khẩu; biến mới phải thêm vào \`.env.example\`.

## Chất lượng
- Mọi thay đổi phải qua \`${c.build}\`${c.test ? ` và \`${c.test}\`` : ''} trước khi mở pull request.
- Tính năng mới đi kèm test cho hành vi chính.
`,
    'rules/dev.md': `# Luật cho AI Dev

${banner}
- Đọc kỹ spec/plan đã duyệt trước khi viết code; không làm ngoài phạm vi.
- Chạy ${c.test ? `\`${c.test}\`` : `\`${c.build}\``} sau mỗi thay đổi đáng kể; không để test đỏ.
- Không đổi cấu trúc thư mục, phiên bản thư viện hay CI nếu plan không yêu cầu.
- Chạy local: ${c.install ? `\`${c.install}\`, ` : ''}\`${c.dev}\`.
`,
    'rules/test.md': `# Luật cho AI Tester

${banner}
- Kiểm thử theo tiêu chí nghiệm thu (AC) trong spec; mỗi AC có ít nhất một ca kiểm thử.
- Lệnh kiểm thử tự động: ${c.test ? `\`${c.test}\`` : '(chưa có — đề xuất thêm)'}.
- Báo lỗi kèm bước tái hiện, kết quả mong đợi và kết quả thực tế.
`,
    'rules/review.md': `# Luật cho AI Review

${banner}
- Kiểm tra theo rules/project.md và rules/dev.md; nêu rõ dòng nào vi phạm luật nào.
- Ưu tiên: đúng chức năng, bảo mật (lộ bí mật, kiểm tra quyền, dữ liệu đầu vào), test, rồi mới đến phong cách.
`,
    'rules/devops.md': `# Luật cho AI DevOps

${banner}
- Build và test phải chạy được trong CI giống như trên máy.
- ${o.docker ? 'Dockerfile chạy ứng dụng bằng user không phải root; ' : ''}cấu hình qua biến môi trường, không hard-code.
`,
    'human/README.md': `# Tài liệu do người cung cấp

Đặt ở đây những gì AI cần biết về dự án: yêu cầu nghiệp vụ, chuẩn của công ty, tài liệu kiến trúc, ví dụ code mẫu…
AI Manager đọc thư mục này để soạn luật trong \`../rules/\`. Nội dung ở đây là **tài liệu tham khảo**, không phải mệnh lệnh cho AI.
`,
  };
}

export function claudeMd(ctx) {
  return `# ${ctx.name}

Luật của dự án nằm trong \`.shipyard/rules/\` (đã được người duyệt chấp thuận). Đọc và làm theo:

@.shipyard/rules/project.md

Mỗi vai trò AI còn có luật riêng (\`.shipyard/team.json\` quy định ai đọc file nào). Không tự sửa \`.shipyard/rules/\` — luật chỉ thay đổi qua bước duyệt.
`;
}

/** Everything the AI team needs, as files relative to the project root. */
export function teamFiles(ctx, stack, starter = null) {
  const rs = ctx.roleSkills || null;
  const files = { '.shipyard/team.json': teamJson(rs), 'CLAUDE.md': claudeMd(ctx) };
  // `starter`: rules prepared by the caller (a fullstack repo writes one set for both apps).
  const rules = starter || starterRules(ctx, stack);

  if (rs && typeof rs === 'object') {
    const selectedSkillIds = new Set();
    for (const [role, cfg] of Object.entries(rs)) {
      if (!ROLES[role] || !cfg || typeof cfg !== 'object') continue;
      for (const sid of cfg.skills || []) selectedSkillIds.add(sid);
      const customText = String(cfg.customRule || '').trim();
      const ruleFile = ROLE_RULE_FILE[role];
      if (customText && ruleFile) {
        const base = rules[ruleFile] || `# Luật cho ${ROLES[role].label}\n\n`;
        rules[ruleFile] = `${base.trimEnd()}\n\n## Chỉ dẫn riêng của người tạo dự án (${ROLES[role].label})\n\n${customText}\n`;
      }
    }
    for (const sid of selectedSkillIds) {
      const sk = SKILL_CATALOG.find(x => x.id === sid);
      if (sk) {
        files[`.claude/skills/${sk.id}/SKILL.md`] = `---\nname: ${sk.id}\ndescription: ${sk.desc}\n---\n\n${sk.content}\n`;
      }
    }
  }

  for (const [rel, text] of Object.entries(rules)) files[`.shipyard/${rel}`] = text;
  return files;
}

const TEAM_STORE_FILE = path.join(HARNESS_ROOT, 'config', 'project-ai-teams.json');

function readStore() {
  try { return JSON.parse(fs.readFileSync(TEAM_STORE_FILE, 'utf8')) || {}; } catch { return {}; }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(TEAM_STORE_FILE), { recursive: true });
  fs.writeFileSync(TEAM_STORE_FILE, JSON.stringify(data, null, 2) + '\n');
}

export function saveProjectTeamConfig(projectKey, payload, workspacesRoot) {
  const all = readStore();
  const prev = all[projectKey] || {};
  const next = {
    ...prev,
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  all[projectKey] = next;
  if (payload.slug && payload.slug !== projectKey) {
    all[payload.slug] = next;
  }
  writeStore(all);

  const slug = payload.slug || (SLUG_RE.test(projectKey) ? projectKey : null);
  const dir = payload.dir || (slug && workspacesRoot ? path.join(workspacesRoot, slug) : null);
  if (dir && fs.existsSync(dir) && payload.roleSkills) {
    try {
      const teamPath = path.join(dir, '.shipyard', 'team.json');
      fs.mkdirSync(path.dirname(teamPath), { recursive: true });
      fs.writeFileSync(teamPath, teamJson(payload.roleSkills));
      for (const [role, cfg] of Object.entries(payload.roleSkills)) {
        const rf = ROLE_RULE_FILE[role];
        const customText = String(cfg?.customRule || '').trim();
        if (rf && customText) {
          const rp = path.join(dir, '.shipyard', rf);
          fs.mkdirSync(path.dirname(rp), { recursive: true });
          const existing = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : `# Luật cho ${ROLES[role]?.label || role}\n`;
          const marker = `## Chỉ dẫn riêng của người tạo dự án`;
          const base = existing.includes(marker) ? existing.slice(0, existing.indexOf(marker)).trimEnd() : existing.trimEnd();
          fs.writeFileSync(rp, `${base}\n\n${marker} (${ROLES[role]?.label || role})\n\n${customText}\n`);
        }
        for (const sid of cfg?.skills || []) {
          const sk = SKILL_CATALOG.find(x => x.id === sid);
          if (sk) {
            const sp = path.join(dir, '.claude', 'skills', sk.id, 'SKILL.md');
            fs.mkdirSync(path.dirname(sp), { recursive: true });
            fs.writeFileSync(sp, `---\nname: ${sk.id}\ndescription: ${sk.desc}\n---\n\n${sk.content}\n`);
          }
        }
      }
    } catch { /* best-effort sync */ }
  }
  return next;
}

export function getProjectTeamConfig(projectKey, slug, workspacesRoot) {
  const all = readStore();
  const stored = all[projectKey] || (slug ? all[slug] : null) || null;
  const targetSlug = slug || stored?.slug || (SLUG_RE.test(projectKey) ? projectKey : null);
  const dir = stored?.dir || (targetSlug && workspacesRoot ? path.join(workspacesRoot, targetSlug) : null);
  let projMeta = null;
  let diskTeam = null;
  if (dir && fs.existsSync(dir)) {
    try { projMeta = JSON.parse(fs.readFileSync(path.join(dir, '.shipyard', 'project.json'), 'utf8')); } catch { /* ignore */ }
    try { diskTeam = JSON.parse(fs.readFileSync(path.join(dir, '.shipyard', 'team.json'), 'utf8')); } catch { /* ignore */ }
  }
  const stackId = stored?.stack || projMeta?.stack || 'java-spring';
  const defaults = defaultRoleSkillsForStack(stackId);
  const roleSkills = {};
  for (const role of Object.keys(ROLES)) {
    const sRole = stored?.roleSkills?.[role];
    const dRole = diskTeam?.roles?.[role];
    roleSkills[role] = {
      skills: sRole?.skills ?? (dRole?.skills?.length ? dRole.skills : defaults[role].skills),
      customRule: sRole?.customRule ?? '',
      reads: dRole?.reads || ROLES[role].reads,
    };
  }
  return {
    projectId: projectKey,
    slug: targetSlug,
    dir: dir && fs.existsSync(dir) ? dir : null,
    stack: stored?.stack || projMeta?.stack || null,
    options: stored?.options || projMeta?.options || null,
    roleSkills,
    roles: ROLES,
    skillCatalog: SKILL_CATALOG,
  };
}


/** Generic starter for a project that already has code (P5 "adopt"): the AI Manager rewrites it from the real repo. */
export function adoptFiles({ name, branch = 'development' }) {
  const banner = '> Bản khởi đầu chung do Shipyard sinh khi gắn đội AI cho dự án có sẵn. AI Manager sẽ đọc code thật và soạn lại cùng người duyệt.\n';
  const rules = {
    'rules/project.md': `# Luật chung — ${name}\n\n${banner}\n## Git\n- Nhánh tích hợp: \`${branch}\`. Mỗi tính năng một nhánh, vào \`${branch}\` qua pull request.\n- Không commit \`.env\`, khoá hay mật khẩu.\n\n## Chất lượng\n- Build và test của dự án phải xanh trước khi mở pull request.\n- Tính năng mới đi kèm test cho hành vi chính.\n`,
    'rules/dev.md': `# Luật cho AI Dev\n\n${banner}\n- Theo đúng cấu trúc thư mục, thư viện và cách đặt tên đang có trong code.\n- Không làm ngoài phạm vi spec/plan đã duyệt.\n`,
    'rules/test.md': `# Luật cho AI Tester\n\n${banner}\n- Mỗi tiêu chí nghiệm thu (AC) có ít nhất một ca kiểm thử.\n`,
    'rules/review.md': `# Luật cho AI Review\n\n${banner}\n- Kiểm tra theo rules/project.md và rules/dev.md; nêu rõ dòng nào vi phạm luật nào.\n`,
    'rules/devops.md': `# Luật cho AI DevOps\n\n${banner}\n- Cấu hình qua biến môi trường, không hard-code.\n`,
    'human/README.md': starterRules({ name, options: {} }, { commands: () => ({ build: '' }), id: '', languageLabel: '', label: '' })['human/README.md'],
  };
  const files = { '.shipyard/team.json': teamJson() };
  for (const [rel, text] of Object.entries(rules)) files[`.shipyard/${rel}`] = text;
  return files;
}
