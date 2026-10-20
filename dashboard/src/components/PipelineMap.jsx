import React from 'react';
import PipelineEdges from './PipelineEdges.jsx';
import PipelineNodes from './PipelineNodes.jsx';
import { phaseIdx } from '../lib/constants.js';
import { Clock } from 'lucide-react';
import { fmtDur } from '../lib/format.js';

export default function PipelineMap({ lane, config, archived }) {
  const isReview = lane.mode === 'pr-review';
  const hasProgress = phaseIdx(lane.stage) >= 0;
  const showTime = !archived && !isReview && hasProgress && lane.stage_age_sec != null;

  return (
    <div className="mapwrap">
      {(archived || showTime) && (
        <div className="maphead">
          {archived && <span className="pf-prev" title="viewing a past feature — read-only snapshot">past feature</span>}
          {showTime && (
            <span title="time on current phase"><Clock size={12} strokeWidth={1.75} aria-hidden="true" /> on <b>{lane.stage}</b> for {fmtDur(lane.stage_age_sec)}</span>
          )}
          {archived && <span className="hint">pick “• current” to return to the live feature</span>}
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
        <span><i className="ld g" />done</span>
        <span><i className="ld b" />current</span>
        <span><i className="ld w" />passed without evidence — check it</span>
        <span><i className="ld n" />pending</span>
        <span style={{ color: 'var(--warn-text)' }}>{'↻ self-resolves & continues (hover)'}</span>
        <span className="legend-r">{'red dashed = fail paths → fix · blue = re-entry'}</span>
      </div>
    </div>
  );
}
