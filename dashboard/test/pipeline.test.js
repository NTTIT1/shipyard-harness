// Lane pipeline after the code: the dashboard's rules match DeliveryConfig.java and bin/delivery.py.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { defaultPipeline, localDemoPipeline, normalizePipeline, pipelineProblem, pipelineSteps } from '../src/lib/pipeline.js';

describe('lane pipeline', () => {
  it('defaults to the old behaviour: every check, a PR, a human merges', () => {
    const p = normalizePipeline(defaultPipeline());
    expect(p).toEqual({ ciGate: true, e2e: true, codeReview: true, qcLocal: true, seniorGate: true, openPr: true,
      merge: 'HUMAN', deployWait: false, testQc: false, ticket: false });
    expect(pipelineSteps(p).join(' → ')).toBe('CI gate → E2E → Review code bằng AI → QC trình duyệt (local) → Kiểm định GO/NO-GO → PR vào nhánh tích hợp → người merge');
  });

  it('keeps it consistent and bounded', () => {
    const p = normalizePipeline({ ...defaultPipeline(), e2e: false, merge: 'AUTO', mergeMethod: 'REBASE', prBase: 'main',
      deployWait: true, deployContext: 'deploy-dev', deployTimeoutMinutes: 999, testQc: true, testUrl: 'http://test.local', testQcOnFail: 'HUMAN' });
    expect(p).toMatchObject({ e2e: false, merge: 'AUTO', mergeMethod: 'REBASE', prBase: 'main', deployTimeoutMinutes: 240, testQcOnFail: 'HUMAN' });
    expect(pipelineSteps(p)).toContain('lane tự merge (rebase)');
    // no PR: nothing to merge or verify after
    const np = normalizePipeline({ ...p, openPr: false });
    expect(np).toMatchObject({ openPr: false, merge: 'HUMAN', deployWait: false, testQc: false });
    expect(pipelineSteps(np).at(-1)).toBe('đẩy nhánh (không mở PR)');
    const demo = normalizePipeline(localDemoPipeline());
    expect(demo).toMatchObject({ openPr: false, localMerge: true, e2e: false, merge: 'HUMAN' });
    expect(pipelineSteps(demo).at(-1)).toContain('gộp vào nhánh tích hợp trên máy');
    expect(normalizePipeline({ ...defaultPipeline(), localMerge: true }).localMerge).toBeUndefined();   // only without a PR
  });

  it('refuses what would be unsafe or unusable', () => {
    expect(pipelineProblem({ prBase: '--force' })).toMatch(/Nhánh/);
    expect(pipelineProblem({ deployWait: true, deployContext: '' })).toMatch(/trạng thái CI/);
    expect(pipelineProblem({ testQc: true, testUrl: 'javascript:alert(1)' })).toMatch(/http/);
    expect(() => normalizePipeline({ testQc: true, testUrl: 'x' })).toThrow();
    expect(pipelineProblem({ openPr: false, testQc: true, testUrl: '' })).toBe('');   // ignored without a PR
  });

  it('what the dashboard saves for a lane is what the lane runs (bin/delivery.py)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'));
    const saved = normalizePipeline({ ...defaultPipeline(), codeReview: false, merge: 'AUTO', testQc: true, testUrl: 'http://t.local' });
    fs.writeFileSync(path.join(tmp, 'lane.json'), JSON.stringify(saved));
    const r = spawnSync('python3', [path.resolve('../bin/delivery.py'), 'show', path.join(tmp, 'none.json'), path.join(tmp, 'lane.json')],
      { encoding: 'utf8', env: { ...process.env, INTEGRATION_BRANCH: 'develop', DEV_QC_ENABLED: '0' } });
    const eff = JSON.parse(r.stdout);
    expect(eff).toMatchObject({ source: 'lane', codeReview: false, merge: 'AUTO', testQc: true, testUrl: 'http://t.local', prBase: 'develop' });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
