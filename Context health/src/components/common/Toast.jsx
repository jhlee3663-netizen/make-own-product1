import React from 'react';

export default function Toast({ show, message }) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[100px] left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-[13px] font-semibold font-pretendard tracking-[-0.3px] leading-snug text-white max-w-[calc(100vw-48px)] text-center pointer-events-none z-[1000] animate-[toastIn_300ms_ease-out] shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      style={{ background: '#2B2D33' }}
    >
      {message}
    </div>
  );
}
