// The quota guard as people read it: lane chat card, the admin's board, the lane list.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { quotaAmounts, quotaTitle, quotaState, grantSteps, grantLabel, resetScopeNote } from '../src/lib/quota.js';
import { laneAttention, primaryActions } from '../src/lib/laneview.js';
import { QuotaRow, GrantActions } from '../src/components/quota/QuotaParts.jsx';
import QuotaBoard from '../src/components/quota/QuotaBoard.jsx';

const h = React.createElement;
const noop = () => {};
const lane = { id: 'lane:3', scope: 'lane', key: '3', unit: 'usd', used: 10.5, limit: 10, pct: 105, level: 'blocked', enforced: true, resettable: true, grantable: true };
const plan = { id: 'plan:five_hour', scope: 'plan', key: 'five_hour', unit: 'pct', used: 100, limit: 100, pct: 100, level: 'blocked', resetsAt: '2026-11-20T05:00:00Z', grantable: false, resettable: false };

describe('quota labels', () => {
  it('names the limit and its amounts in its own unit', () => {
    expect(quotaTitle(lane)).toBe('Lane 3');
    expect(quotaTitle({ scope: 'project', key: 'p1' }, () => 'HRM')).toBe('Dự án HRM');
    expect(quotaTitle(plan)).toBe('Gói Claude · 5 giờ');
    expect(quotaAmounts(lane)).toBe('$10.50 / $10.00');
    expect(quotaAmounts({ ...lane, unit: 'vnd', used: 150000, limit: 100000 })).toBe('150.000 đ / 100.000 đ');
    expect(quotaAmounts({ ...lane, enforced: false, used: 2 })).toBe('$2.00 · chưa đặt riêng');
  });
  it('states: stopped, near, fine, not set', () => {
    expect(quotaState(lane)).toEqual({ tone: 'danger', label: 'Đã chặn' });
    expect(quotaState({ ...lane, level: 'warn' }).label).toBe('Sắp chạm');
    expect(quotaState({ ...lane, level: 'ok' }).label).toBe('Ổn');
    expect(quotaState({ ...lane, enforced: false }).label).toBe('Theo hạn mức chung');
  });
  it('quick grants in the unit, and says how wide a reset reaches', () => {
    expect(grantSteps(lane)).toEqual([5, 20, 50]);
    expect(grantLabel({ unit: 'vnd' }, 200000)).toBe('+200.000 đ');
    expect(resetScopeNote({ scope: 'month' })).toMatch(/mọi lane/);
  });
});

describe('quota components', () => {
  it('a blocked limit offers grants and a reset; the Claude plan offers waiting or another model', () => {
    const html = renderToStaticMarkup(h(QuotaRow, { c: lane }, h(GrantActions, { c: lane, onGrant: noop, onReset: noop })));
    expect(html).toContain('Lane 3');
    expect(html).toContain('+$5.00');
    expect(html).toContain('Đặt lại về 0');
    expect(html).toContain('aria-valuenow="100"');
    const p = renderToStaticMarkup(h(GrantActions, { c: plan, onGrant: noop, onReset: noop }));
    expect(p).toContain('đổi model');
    expect(p).not.toContain('+$5.00');
  });
  it('the board puts the stopped lanes first, then every limit group', () => {
    const board = { warnPct: 80, rows: { month: [{ ...lane, id: 'month:all', scope: 'month', key: 'all', level: 'ok', pct: 20 }], project: [], lane: [lane], model: [], plan: [] },
      held: [{ lane: 3, at: 'x', checks: [lane], feature: 'Đăng nhập', projectId: '' }] };
    const html = renderToStaticMarkup(h(QuotaBoard, { board, settings: {}, onSaved: noop, onOpenLane: noop }));
    expect(html.indexOf('1 lane đang dừng vì hết hạn mức')).toBeGreaterThan(-1);
    expect(html.indexOf('1 lane đang dừng')).toBeLessThan(html.indexOf('Hạn mức chung tháng'));
    expect(html).toContain('Chưa có dự án nào dùng AI tháng này.');
    expect(html).toContain('Cảnh báo ở 80%');
  });
});

describe('lane list', () => {
  it('a held lane asks for attention and offers no Resume/Assign', () => {
    const l = { lane: 3, status: 'blocked', quota_hold: { at: 'x', checks: [lane] }, session_resumable: true };
    expect(laneAttention(l)).toBe('quota');
    expect(primaryActions(l)).toEqual([]);
  });
});
