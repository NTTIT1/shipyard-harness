import React from 'react';

/** Fallback while a lazily loaded screen downloads; text, so it still shows with reduced motion. */
export default function ViewLoading({ label = 'Đang tải…' }) {
  return <p className="muted-empty view-loading" role="status">{label}</p>;
}
