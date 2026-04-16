import React from 'react';

const COLORS = {
  brand: 'bg-brand-light text-brand',
  cyan: 'bg-cyan/10 text-cyan',
  red: 'bg-[#FF6B6B]/10 text-[#FF6B6B]', // Legacy mapping for "성공"
  gray: 'bg-ui-2 text-typo-secondary',
};

export default function Chip({ 
  children, 
  color = 'brand', 
  className = '' 
}) {
  const baseStyle = 'inline-flex items-center px-2 py-1 rounded-[8px] text-caption-l font-medium tracking-[-0.3px]';
  const colorStyle = COLORS[color] || COLORS.brand;

  return (
    <div className={`${baseStyle} ${colorStyle} ${className}`}>
      {children}
    </div>
  );
}
