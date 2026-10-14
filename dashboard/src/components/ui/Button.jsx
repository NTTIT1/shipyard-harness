import React from 'react';
export default function Button({ variant = 'secondary', size = 'md', icon: Icon, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={1.75} aria-hidden="true" />}
      {children && <span>{children}</span>}
    </button>
  );
}
