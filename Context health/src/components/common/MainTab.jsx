import React from 'react';

/* 아래 막대는 하나만 두고 선택된 탭 위치로 미끄러지게 한다(살짝 지나쳤다 돌아오는 탄성).
   글자는 선택/비선택 두 겹을 겹쳐 놓고 투명도만 바꿔, 굵기와 색이 뚝 바뀌지 않고 부드럽게 넘어간다. */
export default function MainTab({
  tabs = [],
  activeId,
  onChange,
  labelClass = 'text-body-m tracking-[-0.4px]',
  activeClass = 'font-semibold text-brand',
  inactiveClass = 'font-medium text-typo-alternative',
  barClass = 'bg-brand',
}) {
  const index = Math.max(0, tabs.findIndex(tab => tab.id === activeId));
  return (
    <div role="tablist" className="relative flex bg-white flex-none">
      {tabs.map((tab) => {
        const on = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange && onChange(tab.id)}
            className={`flex-1 pt-2 pb-[10px] grid place-items-center text-center bg-transparent outline-none select-none ${labelClass}`}
          >
            <span className={`tab-label col-start-1 row-start-1 ${inactiveClass}`} style={{ opacity: on ? 0 : 1 }}>{tab.label}</span>
            <span aria-hidden="true" className={`tab-label col-start-1 row-start-1 ${activeClass}`} style={{ opacity: on ? 1 : 0 }}>{tab.label}</span>
          </button>
        );
      })}
      {tabs.length > 0 && (
        <span
          aria-hidden="true"
          className={`tab-bar absolute bottom-0 left-0 h-[2px] ${barClass}`}
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${index * 100}%)` }}
        />
      )}
    </div>
  );
}
