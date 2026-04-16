import React, { useEffect, useRef } from 'react';

/* =========================================================
   AutoTextarea — 내용 길이에 맞게 높이 자동 조정
   ========================================================= */
export function AutoTextarea({ value, onChange, placeholder, style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className || ""}`}
      rows={1}
      style={style}
    />
  );
}
