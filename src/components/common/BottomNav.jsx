import React from 'react';
import { IcHome, IcGrid, IcUser } from '../icons/Icons';

export default function BottomNav({ activeId = 'home', onChange }) {
  const tabs = [
    { id: 'home', label: '홈', Icon: IcHome },
    { id: 'analytics', label: '분석', Icon: IcGrid },
    { id: 'my', label: '마이', Icon: IcUser },
  ];

  return (
    <nav className="fixed bottom-0 w-full bg-white border-t border-ui-3 rounded-t-[16px] h-[68px] flex justify-around items-center z-20 shadow-[0_-6px_16px_rgba(3,7,19,0.10)]">
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeId === id;
        return (
          <button 
            key={id} 
            onClick={() => onChange && onChange(id)}
            className={`flex flex-col items-center gap-0.5 flex-1 py-2 bg-none border-none outline-none ${
              isActive ? 'text-brand' : 'text-ui-6'
            }`}
          >
            <Icon active={isActive} size={24} />
            <span className="text-caption-l font-medium leading-normal tracking-[-0.3px]">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
