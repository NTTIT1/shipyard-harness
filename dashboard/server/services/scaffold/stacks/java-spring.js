import fs from 'fs';
import path from 'path';
import { readText } from '../util.js';
import { isSql } from '../dbs.js';

const INITIALIZR = 'https://start.spring.io';

export function springDependencies(o) {
  const deps = ['web', 'actuator', 'validation'];
  if (isSql(o.db)) deps.push('data-jpa', o.db);
  if (o.db === 'mongodb') deps.push('data-mongodb');
  if (o.db === 'redis') deps.push('data-redis');
  if (o.auth === 'jwt') deps.push('security', 'oauth2-resource-server');
  if (o.auth === 'oauth2') deps.push('security', 'oauth2-client');
  return deps;
}

export function javaPackage(groupId, slug) {
  return `${groupId}.${slug.replace(/-/g, '')}`.replace(/\.\d/g, m => `._${m.slice(1)}`);
}

export function initializrUrl(ctx) {
  const o = ctx.options;
  const q = new URLSearchParams({
    type: o.build === 'gradle' ? 'gradle-project' : 'maven-project',
    language: 'java', javaVersion: o.javaVersion, packaging: 'jar',
    groupId: o.groupId, artifactId: ctx.slug, name: ctx.slug, description: ctx.description || ctx.name,
    packageName: javaPackage(o.groupId, ctx.slug), baseDir: path.basename(ctx.dir || ctx.slug),
    dependencies: springDependencies(o).join(','),
  });
  return `${INITIALIZR}/starter.zip?${q}`;
}

/** Main config reads the shared env names; tests run on in-memory H2 so `verify` needs no database. */
export function springProperties(ctx) {
  const o = ctx.options;
  const lines = [`spring.application.name=${ctx.slug}`, 'server.port=${PORT:8080}'];
  if (isSql(o.db)) {
    const proto = o.db === 'postgresql' ? 'postgresql' : 'mysql';
    const port = o.db === 'postgresql' ? 5432 : 3306;
    lines.push(
      `spring.datasource.url=jdbc:${proto}://\${DB_HOST:localhost}:\${DB_PORT:${port}}/\${DB_NAME:${ctx.slug.replace(/-/g, '_')}}`,
      `spring.datasource.username=\${DB_USER:${ctx.slug.replace(/-/g, '_')}}`, 'spring.datasource.password=${DB_PASSWORD:}',
      'spring.jpa.open-in-view=false');
  }
  if (o.db === 'mongodb') lines.push(`spring.mongodb.uri=\${MONGODB_URI:mongodb://localhost:27017/${ctx.slug.replace(/-/g, '_')}}`);
  if (o.db === 'redis') lines.push('spring.data.redis.host=${REDIS_HOST:localhost}', 'spring.data.redis.port=${REDIS_PORT:6379}');
  if (o.auth === 'jwt') lines.push('# Bật khi đã có máy chủ cấp token:', '# spring.security.oauth2.resourceserver.jwt.issuer-uri=${JWT_ISSUER_URI}');
  lines.push('management.endpoints.web.exposure.include=health,info');
  return lines.join('\n') + '\n';
}

function testProperties(ctx) {
  const mode = ctx.options.db === 'mysql' ? 'MySQL' : 'PostgreSQL';
  return [
    `spring.application.name=${ctx.slug}`,
    `spring.datasource.url=jdbc:h2:mem:test;MODE=${mode};DB_CLOSE_DELAY=-1`,
    'spring.datasource.username=sa', 'spring.datasource.password=',
    'spring.jpa.hibernate.ddl-auto=create-drop',
  ].join('\n') + '\n';
}

/** Add H2 in test scope (Initializr's "h2" also pulls the console into the app). */
export function addTestH2(buildFile, text) {
  if (text.includes('com.h2database')) return text;
  if (buildFile === 'pom.xml') {
    const dep = '\t\t<dependency>\n\t\t\t<groupId>com.h2database</groupId>\n\t\t\t<artifactId>h2</artifactId>\n\t\t\t<scope>test</scope>\n\t\t</dependency>\n';
    const i = text.indexOf('\t</dependencies>');
    if (i < 0) throw new Error('pom.xml không có <dependencies>');
    return text.slice(0, i) + dep + text.slice(i);
  }
  const m = /dependencies\s*\{\n/.exec(text);
  if (!m) throw new Error('build.gradle không có khối dependencies');
  const at = m.index + m[0].length;
  return text.slice(0, at) + "\ttestRuntimeOnly 'com.h2database:h2'\n" + text.slice(at);
}

function dockerfile(o) {
  const build = o.build === 'gradle'
    ? "RUN ./gradlew --no-daemon bootJar -x test && find build/libs -name '*.jar' ! -name '*-plain.jar' -exec cp {} app.jar \\;"
    : 'RUN ./mvnw -B -q package -DskipTests && cp target/*.jar app.jar';
  return [
    `FROM eclipse-temurin:${o.javaVersion}-jdk AS build`,
    'WORKDIR /src',
    'COPY . .',
    build,
    '',
    `FROM eclipse-temurin:${o.javaVersion}-jre`,
    'WORKDIR /app',
    'RUN useradd --system --uid 10001 app',
    'COPY --from=build /src/app.jar app.jar',
    'USER app',
    'EXPOSE 8080',
    'ENTRYPOINT ["java", "-jar", "/app/app.jar"]',
    '',
  ].join('\n');
}

export default {
  id: 'java-spring',
  language: 'java', languageLabel: 'Java',
  label: 'Spring Boot', description: 'REST API với Spring Boot (sinh từ start.spring.io)',
  appPort: 8080,
  options: [
    { id: 'build', label: 'Công cụ build', type: 'choice', default: 'maven',
      choices: [{ id: 'maven', label: 'Maven' }, { id: 'gradle', label: 'Gradle' }] },
    { id: 'javaVersion', label: 'Phiên bản Java', type: 'choice', default: '21',
      choices: [{ id: '25', label: 'Java 25' }, { id: '21', label: 'Java 21' }, { id: '17', label: 'Java 17' }] },
    { id: 'groupId', label: 'Group ID', type: 'text', default: 'com.example',
      pattern: '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$', help: 'Dạng tên miền ngược, ví dụ com.congty' },
    { id: 'db', label: 'Database', type: 'choice', default: 'postgresql', group: 'db',
      choices: ['postgresql', 'mysql', 'mongodb', 'redis', 'none'] },
    { id: 'auth', label: 'Xác thực', type: 'choice', default: 'none',
      choices: [{ id: 'none', label: 'Không' }, { id: 'jwt', label: 'JWT (resource server)' }, { id: 'oauth2', label: 'OAuth2 login' }] },
    { id: 'docker', label: 'Dockerfile + docker-compose', type: 'bool', default: true },
  ],
  requires: o => ['java', 'unzip', 'git'],
  check(o, tools) {
    if (tools.java?.ok && tools.java.major < Number(o.javaVersion)) {
      return `Máy đang có Java ${tools.java.major}, thấp hơn Java ${o.javaVersion} đã chọn`;
    }
    return '';
  },

  async generate(ctx) {
    const url = initializrUrl(ctx);
    ctx.log(`Tải khung từ start.spring.io (${springDependencies(ctx.options).join(', ')})`);
    const r = await ctx.fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`start.spring.io trả về HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const zip = path.join(ctx.parentDir, `.${ctx.slug}-initializr.zip`);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    await ctx.run('unzip', ['-q', zip, '-d', ctx.parentDir]);
    fs.rmSync(zip, { force: true });
    fs.rmSync(path.join(ctx.dir, 'HELP.md'), { force: true });
  },

  overlay(ctx) {
    const o = ctx.options;
    const files = { 'src/main/resources/application.properties': springProperties(ctx) };
    if (isSql(o.db)) {
      const bf = o.build === 'gradle' ? 'build.gradle' : 'pom.xml';
      files[bf] = addTestH2(bf, readText(path.join(ctx.dir, bf)));
      files['src/test/resources/application.properties'] = testProperties(ctx);
    }
    if (o.docker) files.Dockerfile = dockerfile(o);
    files['.dockerignore'] = o.docker ? 'target/\nbuild/\n.gradle/\n.env\n.git/\n' : null;
    return files;
  },

  env(ctx) {
    return { PORT: '8080' };
  },

  commands(ctx) {
    const g = ctx.options.build === 'gradle';
    return {
      dev: g ? './gradlew bootRun' : './mvnw spring-boot:run',
      test: g ? './gradlew test' : './mvnw test',
      build: g ? './gradlew build' : './mvnw package',
    };
  },

  async verify(ctx) {
    if (ctx.options.build === 'gradle') await ctx.run('./gradlew', ['--no-daemon', '-q', 'build'], { cwd: ctx.dir });
    else await ctx.run('./mvnw', ['-B', '-q', 'verify'], { cwd: ctx.dir });
  },

  gitignore: () => 'target/\nbuild/\n.gradle/\n*.class\n',
};

