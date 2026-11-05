import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import Badge from '../ui/Badge.jsx';
import { platform } from '../../lib/platform.js';
import { featureStats, activeAgents, attentionItems, projectCost, recentRuns, FEATURE_BUCKETS } from '../../lib/overview.js';
import { stageLabel, ATTENTION } from '../../lib/laneview.js';
import { STEP_LABEL } from '../../lib/review.js';
import { fmtDur, fmtWhen, prNum } from '../../lib/format.js';
import { fmtVnd, fmtUsd, fmtTokens } from '../../lib/costs.js';
import { tr } from '../../lib/i18n.js';

const BUCKET_LABEL = {
  running: tr('AI đang làm'), waiting: tr('Chờ duyệt'), releasing: tr('Đang phát hành'),
  done: tr('Hoàn tất'), cancelled: tr('Đã huỷ'),
};
const BUCKET_TONE = { running: 'accent', waiting: 'warn', releasing: 'info', done: 'ok', cancelled: 'neutral' };
const RUN_BUCKET = { RUNNING: 'running', WAITING_REVIEW: 'waiting', RELEASING: 'releasing', DONE: 'done', CANCELLED: 'cancelled' };
const REFRESH_MS = 30_000;

/**
 * "Tổng quan dự án": features by status, the AI agents at work now, what needs a person, this
 * month's cost (only when the caller may see it), and the latest features. Members live on their
 * own screen ("Thành viên").
 */
export default function ProjectOverview({ pid, lanes, projectCosts, onOpenRun, onOpenLane }) {
  const [runs, setRuns] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => platform.projectRuns(pid)
      .then(r => { if (live) { setRuns(r || []); setErr(''); } })
      .catch(e => { if (live) setErr(e.message); });
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(t); };
  }, [pid]);

  const stats = useMemo(() => featureStats(runs || []), [runs]);
  const agents = useMemo(() => activeAgents(lanes), [lanes]);
  const attention = useMemo(() => attentionItems(lanes), [lanes]);
  const cost = useMemo(() => projectCost(projectCosts, pid, lanes), [projectCosts, pid, lanes]);
  const recent = useMemo(() => recentRuns(runs || []), [runs]);
  const liveAgents = agents.filter(a => a.live).length;

  return (
    <div className="po">
      {err && <p className="m-err" role="alert">{tr('Không tải được danh sách tính năng: {0}', [err])}</p>}

      <dl className="po-stats">
        <div className="po-stat">
          <dt>{tr('Tính năng')}</dt>
          <dd>
            <strong>{runs ? stats.total : '—'}</strong>
            <span>{runs ? tr('{0} đang mở · {1} hoàn tất', [stats.open, stats.done]) : tr('đang tải…')}</span>
          </dd>
        </div>
        <div className="po-stat">
          <dt>{tr('AI đang làm việc')}</dt>
          <dd>
            <strong>{liveAgents}</strong>
            <span>{tr('trên {0} lane của dự án', [lanes.length])}</span>
          </dd>
        </div>
        <div className="po-stat">
          <dt>{tr('Chờ người duyệt')}</dt>
          <dd>
            <strong className={stats.waiting ? 'is-warn' : ''}>{runs ? stats.waiting : '—'}</strong>
            <span>{attention.length ? tr('{0} việc cần chú ý', [attention.length]) : tr('không có gì vướng')}</span>
          </dd>
        </div>
        {cost && (
          <div className="po-stat">
            <dt>{tr('Chi phí tháng {0}', [cost.month || ''])}</dt>
            <dd>
              <strong>{fmtVnd(cost.vnd)}</strong>
              <span>{fmtUsd(cost.usd)}{cost.tokens ? ` · ${fmtTokens(cost.tokens)} token` : ''}{cost.quotaPct != null ? ` · ${tr('{0}% hạn mức', [cost.quotaPct])}` : ''}</span>
            </dd>
          </div>
        )}
      </dl>

      {runs && stats.total > 0 && (
        <section className="po-block" aria-labelledby="po-h-status">
          <h2 id="po-h-status" className="po-h">{tr('Trạng thái tính năng')}</h2>
          <div className="po-bar" role="img"
            aria-label={FEATURE_BUCKETS.map(b => `${BUCKET_LABEL[b]} ${stats[b]}`).join(', ')}>
            {FEATURE_BUCKETS.filter(b => stats[b]).map(b => (
              <i key={b} className={`po-seg tone-${BUCKET_TONE[b]}`} style={{ flexGrow: stats[b] }} />
            ))}
          </div>
          <ul className="po-legend">
            {FEATURE_BUCKETS.map(b => (
              <li key={b} className={stats[b] ? '' : 'is-zero'}>
                <i className={`po-dot tone-${BUCKET_TONE[b]}`} aria-hidden="true" />
                {BUCKET_LABEL[b]} <b>{stats[b]}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="po-cols">
        <section className="po-block" aria-labelledby="po-h-agents">
          <h2 id="po-h-agents" className="po-h">{tr('AI đang làm việc')}</h2>
          {agents.length === 0 ? (
            <p className="po-empty">{tr('Không lane nào đang chạy tính năng của dự án này.')}</p>
          ) : (
            <ul className="po-list">
              {agents.map(a => (
                <li key={a.lane}>
                  <button type="button" className="po-row" onClick={() => onOpenLane?.(a.lane)}>
                    <span className={`po-live${a.live ? ' on' : ''}`} aria-label={a.live ? tr('đang chạy') : tr('đang chờ')} />
                    <span className="po-row-main">
                      <span className="po-row-title">{a.title || tr('Lane {0}', [a.lane])}</span>
                      <span className="po-row-sub">Lane {a.lane} · {stageLabel(a.stage)}{a.since != null ? ` · ${fmtDur(a.since)}` : ''}</span>
                    </span>
                    {a.attention && <Badge tone={ATTENTION[a.attention][0]}>{ATTENTION[a.attention][1]}</Badge>}
                    {a.progress != null && <span className="po-num">{a.progress}%</span>}
                    <ChevronRight size={14} className="po-chev" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="po-block" aria-labelledby="po-h-attn">
          <h2 id="po-h-attn" className="po-h">{tr('Cần chú ý')}</h2>
          {attention.length === 0 ? (
            <p className="po-empty">{tr('Không có lane nào hỏi, bị chặn hay có PR chờ gộp.')}</p>
          ) : (
            <ul className="po-list">
              {attention.map(i => (
                <li key={`${i.kind}-${i.lane}`}>
                  {i.kind === 'pr' ? (
                    <a className="po-row" href={i.url} target="_blank" rel="noreferrer">
                      <span className="po-tag"><Badge tone="info">{tr('PR chờ gộp')}</Badge></span>
                      <span className="po-row-main">
                        <span className="po-row-title">{i.title || `Lane ${i.lane}`}</span>
                        <span className="po-row-sub">Lane {i.lane} · {prNum(i.url)}</span>
                      </span>
                      <ExternalLink size={13} className="po-chev" aria-hidden="true" />
                    </a>
                  ) : (
                    <button type="button" className="po-row" onClick={() => onOpenLane?.(i.lane)}>
                      <span className="po-tag"><Badge tone={ATTENTION[i.kind][0]}>{ATTENTION[i.kind][1]}</Badge></span>
                      <span className="po-row-main">
                        <span className="po-row-title">{i.title || `Lane ${i.lane}`}</span>
                        <span className="po-row-sub">Lane {i.lane}{i.note ? ` · ${i.note}` : ''}</span>
                      </span>
                      <ChevronRight size={14} className="po-chev" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="po-block" aria-labelledby="po-h-recent">
        <h2 id="po-h-recent" className="po-h">{tr('Tính năng gần đây')}</h2>
        {!runs ? <p className="po-empty">{tr('đang tải…')}</p> : recent.length === 0 ? (
          <p className="po-empty">{tr('Dự án chưa có tính năng nào. Giao việc cho một lane hoặc thêm tính năng trong Chat dự án.')}</p>
        ) : (
          <ul className="po-list">
            {recent.map(r => {
              const b = RUN_BUCKET[r.status];
              return (
                <li key={r.id}>
                  <button type="button" className="po-row" onClick={() => onOpenRun?.(r.id)}>
                    <span className="po-row-main">
                      <span className="po-row-title">{r.title || r.id}</span>
                      <span className="po-row-sub">
                        {r.currentStep && b !== 'done' && b !== 'cancelled' ? `${STEP_LABEL[r.currentStep] || r.currentStep} · ` : ''}
                        {fmtWhen(r.updatedAt || r.createdAt)}
                      </span>
                    </span>
                    <Badge tone={BUCKET_TONE[b] || 'neutral'}>{BUCKET_LABEL[b] || r.status}</Badge>
                    <ChevronRight size={14} className="po-chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
