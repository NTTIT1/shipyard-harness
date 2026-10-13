import React from 'react';
export default function IconButton({ icon: Icon, label, className = '', ...rest }) {
  return (
    <button className={`iconbtn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
