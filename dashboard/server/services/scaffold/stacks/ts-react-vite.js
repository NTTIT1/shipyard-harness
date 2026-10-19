import path from 'path';
import fs from 'fs';
import { readText, npmInstallArgs } from '../util.js';

export const CREATE_VITE = 'create-vite@9.3.0';

const APP_TEST = `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders', () => {
    render(<App />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
`;

const NGINX = `server {
  listen 8080;
  root /usr/share/nginx/html;
  location / {
    try_files $uri /index.html;
  }
}
`;

const DOCKERFILE = `FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
`;

/** Wire Vitest into vite.config.ts and package.json (create-vite ships neither). */
export function withVitest(viteConfig, pkgJson) {
  const pkg = JSON.parse(pkgJson);
  pkg.scripts = { ...pkg.scripts, test: 'vitest run' };
  let cfg = viteConfig;
  if (!cfg.includes('vitest/config')) {
    cfg = `/// <reference types="vitest/config" />\n${cfg}`;
    cfg = cfg.replace(/plugins:\s*\[([^\]]*)\],?/, m => `${m.replace(/,?$/, ',')}\n  test: { environment: 'jsdom' },`);
  }
  return { viteConfig: cfg, pkgJson: JSON.stringify(pkg, null, 2) + '\n' };
}

export default {
  id: 'ts-react-vite',
  language: 'typescript', languageLabel: 'TypeScript',
  label: 'React + Vite', description: 'Ứng dụng web React (TypeScript) dựng bằng Vite',
  appPort: 5173,
  noDatabase: true,
  options: [
    { id: 'tests', label: 'Kiểm thử bằng Vitest + Testing Library', type: 'bool', default: true },
    { id: 'docker', label: 'Dockerfile (build tĩnh, phục vụ bằng nginx)', type: 'bool', default: true },
  ],
  requires: () => ['node', 'npm', 'git'],
  check: (_o, tools) => (tools.node?.ok && tools.node.major < 20 ? `Cần Node 20 trở lên (máy đang có ${tools.node.version})` : ''),

  async generate(ctx) {
    await ctx.run('npm', ['exec', '--yes', '--', CREATE_VITE, ctx.slug, '--template', 'react-ts', '--no-interactive'],
      { cwd: ctx.parentDir });
    await ctx.run('npm', npmInstallArgs(ctx.tools), { cwd: ctx.dir });
    if (ctx.options.tests) {
      await ctx.run('npm', npmInstallArgs(ctx.tools, ['-D', 'vitest', 'jsdom', '@testing-library/react', '@testing-library/dom']),
        { cwd: ctx.dir });
    }
  },

  overlay(ctx) {
    const files = {};
    if (ctx.options.tests) {
      const cfgName = fs.existsSync(path.join(ctx.dir, 'vite.config.ts')) ? 'vite.config.ts' : 'vite.config.js';
      const w = withVitest(readText(path.join(ctx.dir, cfgName)), readText(path.join(ctx.dir, 'package.json')));
      files[cfgName] = w.viteConfig;
      files['package.json'] = w.pkgJson;
      files['src/App.test.tsx'] = APP_TEST;
    }
    if (ctx.options.docker) {
      files.Dockerfile = DOCKERFILE;
      files['nginx.conf'] = NGINX;
      files['.dockerignore'] = 'node_modules/\ndist/\n.env\n.git/\n';
    }
    return files;
  },

  env: () => ({ VITE_API_URL: 'http://localhost:8080' }),

  commands: ctx => ({
    install: 'npm install', dev: 'npm run dev', build: 'npm run build',
    ...(ctx.options.tests ? { test: 'npm test' } : {}),
  }),

  async verify(ctx) {
    await ctx.run('npm', ['run', 'build'], { cwd: ctx.dir });
    if (ctx.options.tests) await ctx.run('npm', ['test'], { cwd: ctx.dir });
  },

  gitignore: () => 'node_modules/\ndist/\n*.local\n',
};
