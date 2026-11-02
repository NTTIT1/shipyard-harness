// The Costs → Tính năng toolbar: search, lane filter, sort.
import { describe, it, expect } from 'vitest';
import { featureView, featureLanes } from '../src/lib/costs.js';

const fs = [
  { key: 'a', title: 'Đăng ký tài khoản', lane: 2, vnd: 100, ratio: 0.2, runId: 'run_abc' },
  { key: 'b', title: 'Báo cáo', lane: 4, vnd: 500, ratio: 0.1 },
  { key: 'c', title: 'Cài đặt gói vay', lane: 4, vnd: 300, ratio: null },
];

describe('feature list view', () => {
  it('sorts by cost by default', () => expect(featureView(fs).map(f => f.key)).toEqual(['b', 'c', 'a']));
  it('searches without accents, by title or run id', () => {
    expect(featureView(fs, { q: 'dang ky' }).map(f => f.key)).toEqual(['a']);
    expect(featureView(fs, { q: 'ABC' }).map(f => f.key)).toEqual(['a']);
  });
  it('filters by lane and sorts by ratio (no estimate last) or title', () => {
    expect(featureView(fs, { lane: '4' }).map(f => f.key)).toEqual(['b', 'c']);
    expect(featureView(fs, { sort: 'ratio' }).map(f => f.key)).toEqual(['a', 'b', 'c']);
    expect(featureView(fs, { sort: 'title' }).map(f => f.key)).toEqual(['b', 'c', 'a']);
  });
  it('counts features per lane', () => expect(featureLanes(fs)).toEqual([{ lane: 2, count: 1 }, { lane: 4, count: 2 }]));
});
