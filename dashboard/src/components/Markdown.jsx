import React, { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown.js';

export default function Markdown({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
