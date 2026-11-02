import { describe, it, expect } from 'vitest';
import { memoryFeature, memoryLabel, memoryPreview } from '../src/lib/memory.js';

describe('memory rows', () => {
  it('finds the feature and a short label for each kind', () => {
    const a = { kind: 'ARTIFACT', title: 'Đăng nhập — ARCH — plan.md' };
    expect([memoryFeature(a), memoryLabel(a)]).toEqual(['Đăng nhập', 'ARCH · plan.md']);
    const setup = { kind: 'ARTIFACT', title: 'Thiết lập đội AI — HRM-GMS — MANAGER — design.md' };
    expect([memoryFeature(setup), memoryLabel(setup)]).toEqual(['Thiết lập đội AI — HRM-GMS', 'MANAGER · design.md']);
    const d = { kind: 'DECISION', title: 'Quyết định kiến trúc — Đăng nhập' };
    expect([memoryFeature(d), memoryLabel(d)]).toEqual(['Đăng nhập', 'Quyết định kiến trúc']);
    const s = { kind: 'FEATURE_SUMMARY', title: 'Tính năng: Đăng nhập' };
    expect(memoryFeature(s)).toBe('Đăng nhập');
    const f = { kind: 'FEEDBACK', title: 'Góp ý của TECH_LEAD — ARCH — Đăng nhập' };
    expect([memoryFeature(f), memoryLabel(f)]).toEqual(['Đăng nhập', 'Góp ý của TECH_LEAD · ARCH']);
    const h = { kind: 'HUMAN_EDIT', title: 'BA sửa ba.md — BA — Đăng nhập' };
    expect([memoryFeature(h), memoryLabel(h)]).toEqual(['Đăng nhập', 'BA sửa ba.md · BA']);
  });
  it('previews the first real line', () => {
    expect(memoryPreview('---\ntitle: "x"\ncreated: 2026\n---\n# Luật cho AI Dev\n\nMẫu chuẩn')).toBe('Luật cho AI Dev');
    expect(memoryPreview('1. **MUST** — mỗi nhận xét')).toBe('MUST — mỗi nhận xét');
    expect(memoryPreview('x'.repeat(200))).toHaveLength(140);
    expect(memoryPreview('')).toBe('');
    expect(memoryPreview('{\n  "version": 1,')).toBe('"version": 1,');
  });
});

describe('memory groups', () => {
  const it_ = (id, runId, title, createdAt, kind = 'ARTIFACT') => ({ id, runId, title, createdAt, kind });
  it('puts what the project chat approved at creation first, then newest feature first', async () => {
    const { memoryGroups } = await import('../src/lib/memory.js');
    const items = [
      it_('a', 'run_1', 'Luật dự án — Web — MANAGER — dev.md', '2026-11-02T08:00:00Z'),
      it_('b', 'chat:stu_1', 'Tạo dự án — Web — PM — product-brief.md', '2026-11-02T07:00:00Z'),
      it_('c', 'chat:stu_1', 'Tạo dự án — Web — ARCH — architecture.md', '2026-11-02T07:00:01Z'),
      it_('d', 'run_2', 'Đăng nhập — ARCH — plan.md', '2026-11-02T09:00:00Z'),
    ];
    const g = memoryGroups(items, '');
    expect(g.map(x => [x.name, x.pinned])).toEqual([['Tạo dự án — Web', true], ['Đăng nhập', false], ['Luật dự án — Web', false]]);
    expect(g[0].items.map(x => x.id)).toEqual(['b', 'c']);
    expect(memoryGroups(items, 'DECISION')).toEqual([]);
  });
  it('names chat documents by what they are', async () => {
    const { memoryLabel } = await import('../src/lib/memory.js');
    expect(memoryLabel(it_('b', 'chat:stu_1', 'Tạo dự án — Web — PM — product-brief.md'))).toBe('Yêu cầu sản phẩm');
    expect(memoryLabel(it_('c', 'chat:stu_1', 'Tạo dự án — Web — ARCH — architecture.md'))).toBe('Thiết kế hệ thống');
    expect(memoryLabel(it_('e', 'chat:stu_1', 'Tạo dự án — Web — DESIGN — design.md'))).toBe('Thiết kế giao diện');
  });
});
