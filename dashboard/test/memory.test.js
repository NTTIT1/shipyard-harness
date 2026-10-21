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
