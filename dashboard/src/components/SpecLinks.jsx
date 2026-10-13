import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
const FILES = [['spec.md', 'Spec — yêu cầu & tiêu chí'], ['plan.md', 'Plan — cách làm'], ['tasks.md', 'Tasks — danh sách việc'], ['qc-plan.md', 'QC plan — kịch bản kiểm thử']];
export default function SpecLinks({ lane }) {
  if (!lane.spec_dir) return <p className="empty">Tính năng này chưa có thư mục spec.</p>;
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
