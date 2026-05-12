import React from 'react';

export default function Toast({ show, message }) {
  return (
    <div
      className={`fixed bottom-[100px] left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-[13px] font-semibold font-pretendard tracking-[-0.3px] leading-snug text-white max-w-[calc(100vw-48px)] text-center pointer-events-none z-[1000] transition-all duration-300 ease-out shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${show ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
      style={{ background: '#2B2D33' }}
    >
      {message}
    </div>
  );
}
