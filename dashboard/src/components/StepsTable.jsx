import React from 'react';
import Badge from './ui/Badge.jsx';
import { mergeSteps } from '../lib/laneview.js';
import { fmtWhen } from '../lib/format.js';

const LABEL = { 'plan-critic': 'Phản biện plan', 'impl-worker': 'Code song song', 'code-review': 'Code review',
  'qc-local': 'QC local', 'senior-gate': 'Senior gate', ticketer: 'Ticket', 'dev-qc': 'Dev-QC' };

export default function StepsTable({ steps }) {
  const rows = mergeSteps(steps).slice(-12).reverse();
  if (!rows.length) return <p className="muted-empty">Chưa có bước con nào chạy.</p>;
  return (
    <table className="steps">
      <thead><tr><th>Bước</th><th>AI</th><th>Kết quả</th><th>Lúc</th></tr></thead>
      <tbody>
        {rows.map(s => (
          <tr key={s.id}>
            <td>{LABEL[s.step] || s.step}</td>
            <td className="mono">{String(s.model || '').replace(/^claude:claude-/, '')}</td>
            <td title={s.error || s.verdict || ''}>
              {s.event !== 'end' ? <Badge tone="accent" dot>đang chạy</Badge>
                : s.exit === 0 ? <Badge tone="ok">{s.verdict || 'xong'}</Badge>
                : <Badge tone="danger">lỗi {s.exit}{s.error ? `: ${s.error}` : ''}</Badge>}
            </td>
            <td className="faint">{s.started ? fmtWhen(s.started) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
