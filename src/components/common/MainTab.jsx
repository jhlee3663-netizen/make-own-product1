import React from 'react';

export default function MainTab({ tabs = [], activeId, onChange }) {
  return (
    <div className="flex bg-white flex-none">
      {tabs.map((tab) => (
        <button 
          key={tab.id} 
          onClick={() => onChange && onChange(tab.id)}
          className={`flex-1 py-2 text-center text-body-m transition-all border-b-2 bg-none border-x-none border-t-none outline-none ${
            activeId === tab.id 
              ? 'font-semibold text-brand border-brand' 
              : 'font-medium text-typo-alternative border-transparent'
          } tracking-[-0.4px]`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
