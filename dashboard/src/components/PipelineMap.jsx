import React from 'react';
import PipelineEdges from './PipelineEdges.jsx';
import PipelineNodes from './PipelineNodes.jsx';
import { phaseIdx } from '../lib/constants.js';
import { Clock } from 'lucide-react';
import { fmtDur } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

export default function PipelineMap({ lane, config, archived }) {
  const isReview = lane.mode === 'pr-review';
  const hasProgress = phaseIdx(lane.stage) >= 0;
  const showTime = !archived && !isReview && hasProgress && lane.stage_age_sec != null;

  return (
    <div className="mapwrap">
      {(archived || showTime) && (
        <div className="maphead">
          {archived && <span className="pf-prev" title={tr('Đang xem tính năng cũ — bản chụp chỉ đọc')}>{tr('tính năng cũ')}</span>}
          {showTime && (
            <span title={tr('Thời gian ở bước hiện tại')}><Clock size={12} strokeWidth={1.75} aria-hidden="true" /> {tr('ở bước')} <b>{lane.stage}</b>{' '}{tr('được {0}', [fmtDur(lane.stage_age_sec)])}</span>
          )}
          {archived && <span className="hint">{tr('chọn “• hiện tại” để quay lại tính năng đang chạy')}</span>}
        </div>
      )}
      <svg viewBox="0 -12 1390 254" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="ad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M0,0L10,5L0,10z" style={{ fill: 'var(--border-strong)' }} /></marker>
          <marker id="ag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M0,0L10,5L0,10z" style={{ fill: 'var(--ok)' }} /></marker>
          <marker id="ac" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0L10,5L0,10z" style={{ fill: 'var(--text-faint)' }} /></marker>
          <marker id="ab" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0L10,5L0,10z" style={{ fill: 'var(--accent)' }} /></marker>
          <marker id="acr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0L10,5L0,10z" style={{ fill: 'var(--danger)' }} /></marker>
        </defs>
        <PipelineEdges lane={lane} />
        <PipelineNodes lane={lane} config={config} />
      </svg>
      <div className="legend">
        <span><i className="ld g" />{tr('đã xong')}</span>
        <span><i className="ld b" />{tr('đang làm')}</span>
        <span><i className="ld w" />{tr('đã qua nhưng thiếu bằng chứng — kiểm tra lại')}</span>
        <span><i className="ld n" />{tr('chưa tới')}</span>
        <span style={{ color: 'var(--warn-text)' }}>{tr('↻ tự giải quyết rồi chạy tiếp (rê chuột để xem)')}</span>
        <span className="legend-r">{tr('nét đứt đỏ = nhánh lỗi → sửa · xanh = quay lại')}</span>
      </div>
    </div>
  );
}
