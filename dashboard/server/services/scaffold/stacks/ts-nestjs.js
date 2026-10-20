import path from 'path';
import { readText, npmInstallArgs } from '../util.js';
import { isSql } from '../dbs.js';

export const NEST_CLI = '@nestjs/cli@12.0.8';

export function nestPackages(o) {
  const pk = ['@nestjs/config'];
  if (isSql(o.db) || o.db === 'sqlite') pk.push('@nestjs/typeorm', 'typeorm');
  if (o.db === 'postgresql') pk.push('pg');
  if (o.db === 'mysql') pk.push('mysql2');
  if (o.db === 'sqlite') pk.push('better-sqlite3');
  if (o.db === 'mongodb') pk.push('@nestjs/mongoose', 'mongoose');
  if (o.db === 'redis') pk.push('ioredis');
  if (o.auth === 'jwt') pk.push('@nestjs/jwt');
  return pk;
}

/** Module imports registered in AppModule, all configured from env via ConfigService. */
export function nestImports(o) {
  const imports = [`import { ConfigModule, ConfigService } from '@nestjs/config';`];
  const mods = ['ConfigModule.forRoot({ isGlobal: true })'];
  if (isSql(o.db)) {
    imports.push(`import { TypeOrmModule } from '@nestjs/typeorm';`);
    mods.push(`TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: '${o.db === 'postgresql' ? 'postgres' : 'mysql'}',
        host: c.get('DB_HOST', 'localhost'),
        port: Number(c.get('DB_PORT', ${o.db === 'postgresql' ? 5432 : 3306})),
        database: c.get('DB_NAME'),
        username: c.get('DB_USER'),
        password: c.get('DB_PASSWORD'),
        autoLoadEntities: true,
      }),
    })`);
  }
  if (o.db === 'sqlite') {
    imports.push(`import { TypeOrmModule } from '@nestjs/typeorm';`);
    mods.push(`TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        type: 'better-sqlite3',
        database: c.get('SQLITE_PATH', './data/app.db'),
        autoLoadEntities: true,
      }),
    })`);
  }
  if (o.db === 'mongodb') {
    imports.push(`import { MongooseModule } from '@nestjs/mongoose';`);
    mods.push(`MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ uri: c.get('MONGODB_URI') }),
    })`);
  }
  if (o.auth === 'jwt') {
    imports.push(`import { JwtModule } from '@nestjs/jwt';`);
    mods.push(`JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.get('JWT_SECRET'), signOptions: { expiresIn: '15m' } }),
    })`);
  }
  return { imports, mods };
}

/** Rewrites the CLI's AppModule: adds the imports above, keeps its controller/service. */
export function patchAppModule(src, o) {
  const { imports, mods } = nestImports(o);
  const lastImport = src.lastIndexOf('import ');
  const eol = src.indexOf('\n', lastImport);
  let out = `${src.slice(0, eol + 1)}${imports.join('\n')}\n${src.slice(eol + 1)}`;
  if (!/imports:\s*\[\s*\]/.test(out)) throw new Error('app.module.ts không đúng dạng mong đợi (imports: [])');
  out = out.replace(/imports:\s*\[\s*\]/, `imports: [\n    ${mods.join(',\n    ')},\n  ]`);
  return out;
}

const REDIS_TS = `import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS = Symbol('REDIS');

/** Inject with @Inject(REDIS) private readonly redis: Redis. Connects lazily on first command. */
@Global()
@Module({
  providers: [{
    provide: REDIS,
    inject: [ConfigService],
    useFactory: (c: ConfigService) => new Redis({
      host: c.get('REDIS_HOST', 'localhost'),
      port: Number(c.get('REDIS_PORT', 6379)),
      lazyConnect: true,
    }),
  }],
  exports: [REDIS],
})
export class RedisModule {}
`;

const DOCKERFILE = `FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/package*.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
`;

export default {
  id: 'ts-nestjs',
  language: 'typescript', languageLabel: 'TypeScript',
  label: 'NestJS', description: 'REST API với NestJS (sinh bằng Nest CLI)',
  appPort: 3000,
  options: [
    { id: 'db', label: 'Database', type: 'choice', default: 'postgresql', group: 'db',
      choices: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'none'] },
    { id: 'auth', label: 'Xác thực', type: 'choice', default: 'none',
      choices: [{ id: 'none', label: 'Không' }, { id: 'jwt', label: 'JWT (@nestjs/jwt)' }] },
    { id: 'docker', label: 'Dockerfile + docker-compose', type: 'bool', default: true },
  ],
  requires: () => ['node', 'npm', 'git'],
  check: (_o, tools) => (tools.node?.ok && tools.node.major < 20 ? `Cần Node 20 trở lên (máy đang có ${tools.node.version})` : ''),

  async generate(ctx) {
    await ctx.run('npm', ['exec', '--yes', '--', NEST_CLI, 'new', ctx.slug, '--skip-git', '--skip-install',
      '--package-manager', 'npm'], { cwd: ctx.parentDir });
    await ctx.run('npm', npmInstallArgs(ctx.tools), { cwd: ctx.dir });
    await ctx.run('npm', npmInstallArgs(ctx.tools, nestPackages(ctx.options)), { cwd: ctx.dir });
  },

  overlay(ctx) {
    const o = ctx.options;
    const modPath = path.join(ctx.dir, 'src', 'app.module.ts');
    let mod = patchAppModule(readText(modPath), o);
    const files = {};
    if (o.db === 'redis') {
      files['src/redis.module.ts'] = REDIS_TS;
      mod = mod.replace(/(import \{ ConfigModule[^\n]*\n)/, `$1import { RedisModule } from './redis.module.js';\n`)
        .replace(/imports: \[\n/, 'imports: [\n    RedisModule,\n');
    }
    files['src/app.module.ts'] = mod;
    if (o.db === 'sqlite') files['data/.gitkeep'] = '';
    if (o.docker) {
      files.Dockerfile = DOCKERFILE;
      files['.dockerignore'] = 'node_modules/\ndist/\n.env\n.git/\ndata/\n';
    }
    return files;
  },

  env: ctx => ({ PORT: '3000', ...(ctx.options.auth === 'jwt' ? { JWT_SECRET: 'change-me' } : {}) }),

  commands: () => ({ install: 'npm install', dev: 'npm run start:dev', test: 'npm test', build: 'npm run build' }),

  async verify(ctx) {
    await ctx.run('npm', ['run', 'build'], { cwd: ctx.dir });
    await ctx.run('npm', ['test'], { cwd: ctx.dir });
  },

  gitignore: () => 'node_modules/\ndist/\ncoverage/\ndata/*.db\n',
};
