import React from 'react';
import { tr } from '../../lib/i18n.js';

/** Fallback while a lazily loaded screen downloads; text, so it still shows with reduced motion. */
export default function ViewLoading({ label = tr('Đang tải…') }) {
  return <p className="muted-empty view-loading" role="status">{label}</p>;
}
