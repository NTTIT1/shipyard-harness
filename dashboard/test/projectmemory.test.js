// Approved chat documents go to the context-service as a STEP_APPROVED event.
import { describe, it, expect } from 'vitest';
import { memoryClient } from '../server/services/projectmemory.js';

describe('project memory client', () => {
  it('posts a STEP_APPROVED event with the service token', async () => {
    const calls = [];
    const m = memoryClient({ url: 'http://ctx', token: () => 'tok', fetchImpl: async (u, o) => { calls.push([u, o]); return { ok: true, json: async () => ({ success: true, data: { processed: true } }) }; } });
    await m.approved({ eventId: 'chat:stu_1:PM', projectId: 'proj_9', runId: 'chat:stu_1', runTitle: 'Tạo dự án — X', step: 'PM', documents: { 'product-brief.md': '# X' } });
    expect(calls[0][0]).toBe('http://ctx/internal/v1/memory/events');
    expect(calls[0][1].headers['X-Service-Token']).toBe('tok');
    expect(JSON.parse(calls[0][1].body)).toEqual({ eventId: 'chat:stu_1:PM', type: 'STEP_APPROVED',
      payload: { projectId: 'proj_9', runId: 'chat:stu_1', runTitle: 'Tạo dự án — X', step: 'PM', revisionNo: 1, documents: { 'product-brief.md': '# X' } } });
  });
  it('fails on an error answer so the chat retries later', async () => {
    const m = memoryClient({ url: 'http://ctx', token: () => 't', fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    await expect(m.approved({ eventId: 'e', projectId: 'p', runId: 'r', step: 'PM', documents: {} })).rejects.toThrow(/503/);
  });
});
