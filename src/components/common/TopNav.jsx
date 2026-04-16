import React from 'react';

export default function TopNav({ title = "할 일" }) {
  return (
    <div className="h-[60px] px-4 flex justify-between items-center bg-white border-b border-ui-3 flex-none">
      <img src="./logo.png" alt="로고" className="w-10 h-10 rounded-lg object-cover" />
      <button className="flex items-center gap-1 text-typo-alternative text-body-m font-semibold tracking-[-0.4px] bg-none border-none outline-none">
        {title}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
    </div>
  );
}
