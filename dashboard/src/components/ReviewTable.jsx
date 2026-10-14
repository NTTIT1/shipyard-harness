import React from 'react';
import { FileText, MessageSquare, CircleCheck, SkipForward, TriangleAlert, Hand, Search, ExternalLink } from 'lucide-react';
import { fmtWhen } from '../lib/format.js';

const ICON = { reviewed: FileText, commented: FileText, responded: MessageSquare, approved: CircleCheck, drafted: FileText, skipped: SkipForward, error: TriangleAlert };

export default function ReviewTable({ reviews, needsAction, config }) {
  const repo = config?.repo || '';

  if (!reviews) return <span className="pf-empty">loading review history…</span>;

  const events = reviews.events || [];

  return (
    <div className="reviews">
      {needsAction && <div className="needs-banner"><Hand size={14} strokeWidth={1.75} aria-hidden="true" /> needs you — {needsAction}</div>}
      {!events.length ? (
        <span className="pf-empty"><Search size={13} strokeWidth={1.75} aria-hidden="true" /> no PR reviews yet — the loop will list them here as it posts feedback</span>
      ) : (
        <table className="rv">
          <thead><tr><th>when</th><th>PR</th><th>action</th><th>detail</th></tr></thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td className="rv-ts">{fmtWhen(e.ts)}</td>
                <td>
                  {repo
                    ? <a href={`https://github.com/${repo}/pull/${e.pr}`} target="_blank" rel="noreferrer">#{e.pr} <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" /></a>
                    : `#${e.pr}`}
                </td>
                <td><span className="rv-act">{(() => { const I = ICON[e.action]; return I ? <I size={13} strokeWidth={1.75} aria-hidden="true" /> : '•'; })()} {e.action}</span></td>
                <td className="rv-d">{e.detail || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
