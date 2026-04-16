import React from 'react';

export default function Toast({ show, message }) {
  return (
    <div className={`fixed bottom-[100px] left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-body-s font-medium text-white bg-typo-strong/90 transition-all duration-300 z-[1000] whitespace-nowrap pointer-events-none ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {message}
    </div>
  );
}
