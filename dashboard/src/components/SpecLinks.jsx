import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { tr } from '../lib/i18n.js';
const FILES = [['spec.md', tr('Spec — yêu cầu & tiêu chí')], ['plan.md', tr('Plan — cách làm')], ['tasks.md', tr('Tasks — danh sách việc')], ['qc-plan.md', tr('QC plan — kịch bản kiểm thử')]];
export default function SpecLinks({ lane }) {
  if (!lane.spec_dir) return <p className="muted-empty">{tr('Tính năng này chưa có thư mục spec.')}</p>;
  return (
    <div className="speclinks">
      <p className="faint mono">{lane.spec_dir}</p>
      {FILES.map(([f, label]) => (
        <a key={f} className="speclink" href={`/spec/${lane.lane}/${lane.spec_dir}/${f}`} target="_blank" rel="noreferrer">
          <FileText size={16} strokeWidth={1.75} aria-hidden="true" /><span>{label}</span><ExternalLink size={13} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
