import React from 'react';
export default function StatusDot({ tone = 'neutral', pulse = false, title }) {
  return <i className={`sdot sdot-${tone}${pulse ? ' sdot-pulse' : ''}`} title={title} aria-hidden={!title} />;
}
