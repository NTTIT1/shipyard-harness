import { describe, it, expect } from 'vitest';
import { describeEvent } from '../server/services/scaffold/activity.js';

const ev = content => JSON.stringify({ type: 'assistant', message: { content } });

describe('describeEvent', () => {
  it('turns stream-json lines into short steps', () => {
    expect(describeEvent(JSON.stringify({ type: 'system', subtype: 'init', model: 'gemini/gemini-3.5-flash' }))).toEqual(['Đã kết nối — model gemini/gemini-3.5-flash']);
    expect(describeEvent(ev([{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b/architecture.md' } },
      { type: 'tool_use', name: 'Edit', input: { file_path: 'mockups/01.html' } }]))).toEqual(['Đọc architecture.md', 'Sửa 01.html']);
    expect(describeEvent(ev([{ type: 'text', text: 'Xin chào\nROLE-STEP: DONE chat' }]))).toEqual(['Viết trả lời: Xin chào']);
    expect(describeEvent(ev([{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.md' } }]))).toEqual(['Tìm tệp **/*.md']);
  });
  it('ignores everything else', () => {
    expect(describeEvent('$ claude -p hi')).toEqual([]);
    expect(describeEvent('{not json')).toEqual([]);
    expect(describeEvent(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } }))).toEqual([]);
    expect(describeEvent(JSON.stringify({ type: 'result', result: 'x' }))).toEqual([]);
  });
});
