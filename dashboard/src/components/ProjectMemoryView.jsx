import React, { useState } from 'react';
import Tabs from './ui/Tabs.jsx';
import MemoryPanel from './MemoryPanel.jsx';
import ProjectDocsView from './ProjectDocsView.jsx';
import { tr } from '../lib/i18n.js';

/**
 * "Bộ nhớ dự án": the product documents as they stand now (brief, system design with the roadmap, UI with
 * its screens, features), and everything the AI team remembers (searchable, switchable per item).
 */
export default function ProjectMemoryView({ projectId, canManage }) {
  const [tab, setTab] = useState('docs');
  return (
    <div className="pm-mem">
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'docs', label: tr('Tài liệu sản phẩm') },
        { id: 'memory', label: tr('Bộ nhớ AI') },
      ]} />
      {tab === 'docs' ? <ProjectDocsView pid={projectId} embedded /> : <MemoryPanel projectId={projectId} canManage={canManage} />}
    </div>
  );
}
