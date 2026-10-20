// CI pipeline for the chosen remote: GitHub Actions or GitLab CI. Same build + test as the
// wizard's verify stage, so a project that was green at creation stays green on its first push.

function plan(stack, o) {
  switch (stack) {
    case 'java-spring': {
      const gradle = o.build === 'gradle';
      return {
        kind: 'java', version: o.javaVersion, cache: gradle ? 'gradle' : 'maven',
        image: `eclipse-temurin:${o.javaVersion}-jdk`,
        script: [gradle ? './gradlew --no-daemon build' : './mvnw -B verify'],
      };
    }
    case 'python-fastapi':
      return { kind: 'python', version: o.python, image: `ghcr.io/astral-sh/uv:python${o.python}-bookworm-slim`,
        script: ['uv sync', 'uv run pytest -q'] };
    case 'ts-react-vite':
    case 'ts-nestjs':
      return { kind: 'node', version: '22', image: 'node:22',
        script: ['npm ci', 'npm run build', ...(stack === 'ts-react-vite' && !o.tests ? [] : ['npm test'])] };
    default:
      throw new Error(`no CI plan for ${stack}`);
  }
}

export function githubWorkflow(stack, options) {
  const p = plan(stack, options);
  const setup = {
    java: ['      - uses: actions/setup-java@v4', '        with:', '          distribution: temurin',
      `          java-version: '${p.version}'`, `          cache: ${p.cache}`],
    python: ['      - uses: astral-sh/setup-uv@v5', '        with:', `          python-version: '${p.version}'`],
    node: ['      - uses: actions/setup-node@v4', '        with:', `          node-version: '${p.version}'`, '          cache: npm'],
  }[p.kind];
  return [
    'name: CI',
    '',
    'on:',
    '  push:',
    '    branches: [main, development]',
    '  pull_request:',
    '',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...setup,
    ...p.script.map(s => `      - run: ${s}`),
    '',
  ].join('\n');
}

export function gitlabCi(stack, options) {
  const p = plan(stack, options);
  const cache = { java: p.cache === 'gradle' ? '.gradle/' : '.m2/repository/', python: '.cache/uv/', node: '.npm/' }[p.kind];
  const vars = { java: p.cache === 'gradle' ? ['  GRADLE_USER_HOME: "$CI_PROJECT_DIR/.gradle"'] : ['  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"'],
    python: ['  UV_CACHE_DIR: "$CI_PROJECT_DIR/.cache/uv"'], node: ['  npm_config_cache: "$CI_PROJECT_DIR/.npm"'] }[p.kind];
  return [
    'stages: [test]',
    '',
    'variables:',
    ...vars,
    '',
    'build-test:',
    '  stage: test',
    `  image: ${p.image}`,
    '  cache:',
    '    key: $CI_COMMIT_REF_SLUG',
    `    paths: [${cache}]`,
    '  script:',
    ...p.script.map(s => `    - ${s}`),
    '  rules:',
    '    - if: $CI_PIPELINE_SOURCE == "merge_request_event"',
    '    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "development"',
    '',
  ].join('\n');
}

/** Files to add for the provider ({} for local-only projects). */
export function ciFiles(provider, stack, options) {
  if (provider === 'github') return { '.github/workflows/ci.yml': githubWorkflow(stack, options) };
  if (provider === 'gitlab') return { '.gitlab-ci.yml': gitlabCi(stack, options) };
  return {};
}
