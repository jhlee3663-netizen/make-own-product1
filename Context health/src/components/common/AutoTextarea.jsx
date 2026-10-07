import React, { useEffect, useRef } from 'react';

/* =========================================================
   AutoTextarea — 내용 길이에 맞게 높이 자동 조정
   ========================================================= */
export function AutoTextarea({ value, onChange, onBlur, onFocus, autoFocus = false, placeholder, style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value]);
  // 보기 화면에서 다시 편집으로 들어올 때: 바로 키보드를 띄우고 커서를 맨 끝에 둔다
  useEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.focus();
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className || ""}`}
      rows={1}
      style={style}
    />
  );
}
