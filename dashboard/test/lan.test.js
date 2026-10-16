// LAN sharing: the dashboard may only listen beyond loopback with login on and a non-public JWT secret.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveJwtSecret, bindProblem, isLoopback, lanUrls } from '../server/services/lan.js';

const DEV = 'shipyard-super-secret-key-that-is-at-least-256-bits-long-for-hmac-sha256';

describe('resolveJwtSecret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-'));
  const file = path.join(dir, 'jwt-secret');
  it('prefers env, then secrets.env, then the per-machine file, then the dev default', () => {
    fs.writeFileSync(file, 'f'.repeat(64) + '\n');
    expect(resolveJwtSecret({ env: 'e', secrets: 's', file })).toBe('e');
    expect(resolveJwtSecret({ env: '', secrets: 's', file })).toBe('s');
    expect(resolveJwtSecret({ file })).toBe('f'.repeat(64));
    expect(resolveJwtSecret({ file: path.join(dir, 'missing') })).toBe(DEV);
  });
});

describe('bindProblem', () => {
  it('allows loopback in any configuration', () => {
    expect(bindProblem({ host: '127.0.0.1', authEnabled: false, devSecret: true })).toBe('');
    expect(bindProblem({ host: 'localhost', authEnabled: true, devSecret: true })).toBe('');
  });
  it('refuses LAN binding with login off or the public dev secret', () => {
    expect(bindProblem({ host: '0.0.0.0', authEnabled: false, devSecret: false })).toMatch(/DASHBOARD_AUTH/);
    expect(bindProblem({ host: '192.168.1.5', authEnabled: true, devSecret: true })).toMatch(/JWT_SECRET/);
    expect(bindProblem({ host: '0.0.0.0', authEnabled: true, devSecret: false })).toBe('');
  });
});

describe('isLoopback / lanUrls', () => {
  it('recognises loopback hosts', () => {
    for (const h of ['127.0.0.1', '::1', 'localhost', '127.1.2.3']) expect(isLoopback(h)).toBe(true);
    for (const h of ['0.0.0.0', '::', '192.168.1.5']) expect(isLoopback(h)).toBe(false);
  });
  it('lists external IPv4 URLs for a wildcard bind, skipping docker bridges', () => {
    const ifaces = {
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      eth0: [{ family: 'IPv4', address: '192.168.168.13', internal: false }],
      docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
      'br-abc': [{ family: 'IPv4', address: '172.18.0.1', internal: false }],
    };
    expect(lanUrls('0.0.0.0', 8090, ifaces)).toEqual(['http://192.168.168.13:8090']);
    expect(lanUrls('192.168.168.13', 8090, ifaces)).toEqual(['http://192.168.168.13:8090']);
  });
});
