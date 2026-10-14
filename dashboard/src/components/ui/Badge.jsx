import React from 'react';
export default function Badge({ tone = 'neutral', dot = false, children, title }) {
  return <span className={`bdg bdg-${tone}`} title={title}>{dot && <i className="bdg-dot" />}{children}</span>;
}
