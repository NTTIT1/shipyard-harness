import React, { forwardRef } from 'react';
const IconButton = forwardRef(function IconButton({ icon: Icon, label, className = '', ...rest }, ref) {
  return (
    <button ref={ref} className={`iconbtn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
});
export default IconButton;
