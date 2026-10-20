// Per-project AI team (spec 2026-10-19 §5): team.json + starter rules written into every new
// project. bin/team_rules.py injects the files each role `reads` into that role's prompt.
// The starters are deliberately short and concrete; the AI Manager step (P4) rewrites them
// with the human reviewers.

const ROLES = {
  MANAGER: { label: 'AI Manager', reads: [] },
  PM: { label: 'AI PM', reads: ['rules/project.md'] },
  BA: { label: 'AI BA', reads: ['rules/project.md'] },
  ARCH: { label: 'AI Kiến trúc', reads: ['rules/project.md', 'rules/dev.md'] },
  DESIGN: { label: 'AI Thiết kế', reads: ['rules/project.md'] },
  DEV: { label: 'AI Dev', reads: ['rules/project.md', 'rules/dev.md'] },
  REVIEW: { label: 'AI Review', reads: ['rules/project.md', 'rules/dev.md', 'rules/review.md'] },
  TEST: { label: 'AI Tester', reads: ['rules/project.md', 'rules/dev.md', 'rules/test.md'] },
  DEVOPS: { label: 'AI DevOps', reads: ['rules/project.md', 'rules/devops.md'] },
};

export function teamJson() {
  return JSON.stringify({
    version: 1,
    note: 'Mỗi vai trò AI chỉ nhận các file trong "reads" (đọc từ nhánh development). Sửa file này để đổi ai đọc luật nào.',
    roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, { label: v.label, reads: v.reads, skills: [] }])),
  }, null, 2) + '\n';
}

const STACK_RULES = {
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
export function teamFiles(ctx, stack) {
  const files = { '.shipyard/team.json': teamJson(), 'CLAUDE.md': claudeMd(ctx) };
  for (const [rel, text] of Object.entries(starterRules(ctx, stack))) files[`.shipyard/${rel}`] = text;
  return files;
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
