import React from 'react';

const VARIANTS = {
  primary: 'bg-brand text-white border-none',
  secondary: 'bg-ui-2 text-typo-secondary border-none',
  outline: 'bg-white border-[1.5px] border-ui-3 text-ui-6',
  dashed: 'bg-white border-[1.5px] border-dashed border-ui-4 text-typo-alternative',
  ghost: 'bg-transparent text-typo-normal border-none',
};

const SIZES = {
  xl: 'h-[52px] px-4 rounded-[12px] text-body-m font-semibold tracking-[-0.4px]',
  l: 'h-[48px] px-4 rounded-[12px] text-body-m font-medium tracking-[-0.4px]',
  m: 'h-10 px-4 rounded-lg text-body-s font-semibold tracking-[-0.35px]',
  s: 'h-8 px-3 rounded-md text-caption-l font-medium tracking-[-0.3px]',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'm',
  fullWidth = false,
  className = '',
  disabled = false,
  onClick,
  ...props
}) {
  const baseStyle = 'flex items-center justify-center cursor-pointer transition-colors outline-none';
  const variantStyle = VARIANTS[variant] || VARIANTS.primary;
  const sizeStyle = SIZES[size] || SIZES.m;
  const widthStyle = fullWidth ? 'w-full' : '';
  const disabledStyle = disabled ? 'opacity-50 cursor-not-allowed bg-ui-4 text-typo-secondary border-none' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${widthStyle} ${disabled ? disabledStyle : variantStyle} ${sizeStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
