import React, { useEffect, useState } from 'react';
import { IcHome, IcGenerate, IcUser, IcAnalysis, IcPencil } from '../icons/Icons';
import Pressable from './Pressable';

const TABS = [
  { id: 'home',     label: '홈',   Icon: IcHome },
  { id: 'coach',    label: '코치', Icon: IcGenerate },
  null, // 가운데 메모 버튼 자리
  { id: 'analysis', label: '분석', Icon: IcAnalysis },
  { id: 'my',       label: '마이', Icon: IcUser },
];

export default function BottomNav({ activeId = 'home', onChange, onMemo }) {
  const [memoOpen, setMemoOpen] = useState(false);

  useEffect(() => { setMemoOpen(false); }, [activeId]);

  function pickMemo(type) {
    setMemoOpen(false);
    onMemo?.(type);
  }

  return (
    <>
      {memoOpen && (
        <div onClick={() => setMemoOpen(false)} className="absolute inset-0 bg-black/40 z-[35]" />
      )}

      <nav className="absolute bottom-0 w-full h-[60px] bg-white border border-ui-3 rounded-t-[16px] flex items-center z-20 shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
        {TABS.map((item, index) => {
          if (!item) return <div key={`slot-${index}`} className="flex-1 h-full" aria-hidden="true" />;
          const { id, label, Icon } = item;
          const isActive = activeId === id;
          return (
            <Pressable
              key={id}
              pressScale={0.88}
              onClick={() => onChange && onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 flex-1 p-2 bg-none border-none outline-none select-none ${
                isActive ? 'text-brand' : 'text-ui-6'
              }`}
            >
              <Icon active={isActive} size={24} />
              <span className="font-pretendard font-medium text-[12px] leading-[1.5]">{label}</span>
            </Pressable>
          );
        })}
      </nav>

      <div
        role="menu"
        aria-hidden={!memoOpen}
        className={`absolute bottom-[78px] left-1/2 -translate-x-1/2 z-[40] memo-menu${memoOpen ? ' open' : ''} flex items-center rounded-lg shadow-[0_0_6px_rgba(0,0,0,0.04)] bg-[linear-gradient(164deg,#228bed_0%,#c509d6_100%)]`}
      >
        <button role="menuitem" tabIndex={memoOpen ? 0 : -1} onClick={() => pickMemo('workout')} className="px-5 py-2 font-pretendard font-semibold text-body-m text-white tracking-[-0.4px] whitespace-nowrap active:opacity-60">운동</button>
        <span className="w-px h-5 bg-white" aria-hidden="true" />
        <button role="menuitem" tabIndex={memoOpen ? 0 : -1} onClick={() => pickMemo('diet')} className="px-5 py-2 font-pretendard font-semibold text-body-m text-white tracking-[-0.4px] whitespace-nowrap active:opacity-60">식단</button>
      </div>

      <Pressable
        pressScale={0.90}
        onClick={() => setMemoOpen(open => !open)}
        aria-label="기록 추가"
        aria-expanded={memoOpen}
        className="absolute bottom-[16px] left-1/2 -ml-[28px] z-[40] w-[56px] h-[56px] bg-brand rounded-full flex items-center justify-center shadow-[0_0_17px_rgba(0,0,0,0.04)] border-none"
      >
        <IcPencil size={22} color="#f8f9fa" />
      </Pressable>
    </>
  );
}
