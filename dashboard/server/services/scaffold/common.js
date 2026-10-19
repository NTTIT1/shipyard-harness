import path from 'path';
import { DB_LABEL, dbEnv, dbService, envFile } from './dbs.js';
import { readText } from './util.js';

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

const COMMON_IGNORE = ['.env', '.env.*', '!.env.example', '.idea/', '.vscode/', '*.iml', '.DS_Store', '*.log'];

/** Keep the generator's own .gitignore, add the stack's and the common lines once. */
export function mergeGitignore(existing, stackLines) {
  const have = new Set(existing.split('\n').map(l => l.trim()).filter(Boolean));
  const add = [...stackLines.split('\n'), ...COMMON_IGNORE].map(l => l.trim()).filter(l => l && !have.has(l));
  const uniq = [...new Set(add)];
  if (!uniq.length) return existing;
  const base = existing.trimEnd();
  return `${base}${base ? '\n\n' : ''}# Shipyard\n${uniq.join('\n')}\n`;
}

export function composeFile(ctx, stack) {
  const svc = dbService(ctx.options.db, ctx.slug);
  if (!ctx.options.docker && !svc) return null;
  const lines = ['services:'];
  if (ctx.options.docker) {
    const port = stack.id === 'ts-react-vite' ? 8080 : stack.appPort;
    lines.push('  app:', '    build: .', `    ports: ["${port}:${port}"]`);
    if (!stack.noDatabase) {
      lines.push('    env_file: [.env]');
      const inside = dbEnv(ctx.options.db, ctx.slug, 'db');
      const hostVars = Object.entries(inside).filter(([k]) => /_HOST$|_URI$/.test(k));
      if (hostVars.length) {
        lines.push('    environment:');
        for (const [k, v] of hostVars) lines.push(`      ${k}: ${v}`);
      }
    }
    if (svc) lines.push('    depends_on: [db]');
  }
  if (svc) lines.push(...svc.yaml);
  if (svc && svc.yaml.some(l => l.includes('db-data'))) lines.push('', 'volumes:', '  db-data:');
  return lines.join('\n') + '\n';
}

export function readme(ctx, stack) {
  const c = stack.commands(ctx);
  const o = ctx.options;
  const opts = stack.options
    .filter(x => x.id !== 'db' && x.id !== 'docker')
    .map(x => {
      const v = o[x.id];
      const label = x.type === 'bool' ? (v ? 'có' : 'không') : (x.choices?.map(ch => (typeof ch === 'string' ? { id: ch, label: ch } : ch)).find(ch => ch.id === v)?.label || v);
      return `- ${x.label}: ${label}`;
    });
  const db = stack.noDatabase ? [] : [`- Database: ${DB_LABEL[o.db]}`];
  const svc = dbService(o.db, ctx.slug);
  return `# ${ctx.name}

${ctx.description || ''}

## Công nghệ

- ${stack.languageLabel} · ${stack.label}
${[...db, ...opts].join('\n')}

## Chạy trên máy

\`\`\`bash
cp .env.example .env        # rồi sửa các giá trị change-me
${svc ? 'docker compose up -d db  # khởi động database\n' : ''}${c.install ? `${c.install}\n` : ''}${c.dev}
\`\`\`

## Kiểm thử và build

\`\`\`bash
${c.test ? `${c.test}\n` : ''}${c.build}
\`\`\`
${o.docker ? `
## Docker

\`\`\`bash
docker compose up --build
\`\`\`
` : ''}
## Quy ước

- Nhánh tích hợp: \`development\`. Mọi thay đổi đi qua pull request.
- Biến môi trường mẫu nằm trong \`.env.example\`; **không commit \`.env\`**.

_Khởi tạo bằng Shipyard (${stack.id})._
`;
}

/** Files every project gets, on top of the stack's own overlay. */
export function commonFiles(ctx, stack, generatedAt = new Date().toISOString()) {
  const env = { ...stack.env(ctx), ...dbEnv(ctx.options.db, ctx.slug) };
  return {
    'README.md': readme(ctx, stack),
    '.editorconfig': EDITORCONFIG,
    '.env.example': envFile(env),
    '.gitignore': mergeGitignore(readText(path.join(ctx.dir, '.gitignore')), stack.gitignore(ctx)),
    'docker-compose.yml': composeFile(ctx, stack),
    '.shipyard/project.json': JSON.stringify({
      name: ctx.name, slug: ctx.slug, description: ctx.description,
      stack: stack.id, options: ctx.options, generatedAt, generator: 'shipyard-scaffold/1',
    }, null, 2) + '\n',
  };
}
