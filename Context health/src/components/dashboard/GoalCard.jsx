import React, { useState } from 'react';

export default function GoalCard({ goal, onComplete, onDismiss }) {
  // goal: { type: 'workout'|'diet', title: string, items: [{name, detail}], timestamp, sourceRoom }
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [isFinishing, setIsFinishing] = useState(false);

  if (!goal || !goal.items) return null;

  const total = goal.items.length;
  const current = checkedIds.size;
  const progress = total > 0 ? (current / total) * 100 : 0;
  const allChecked = total > 0 && current === total;

  function toggleCheck(idx) {
    const next = new Set(checkedIds);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setCheckedIds(next);
  }

  function handleComplete() {
    setIsFinishing(true);
    setTimeout(() => {
      onComplete(goal);
    }, 400); // 딜레이 후 홈 화면에서 삭제 및 저장 처리
  }

  return (
    <div className={`mx-4 mt-4 mb-2 bg-white rounded-2xl border-2 border-brand/20 shadow-card overflow-hidden transition-all duration-300 ${isFinishing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-ui-2 bg-gradient-to-r from-brand/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center flex-shrink-0 text-white text-xs">
            🎯
          </div>
          <span className="font-pretendard font-bold text-caption-l text-brand tracking-[-0.325px]">오늘의 목표</span>
          <span className="font-pretendard font-medium text-caption-m text-typo-alternative ml-1 truncate max-w-[120px]">
            {goal.title}
          </span>
        </div>
        <button onClick={() => onDismiss(goal.id)} className="p-1 text-typo-alternative hover:bg-ui-2 rounded-full transition-all duration-100 active:scale-[0.82] active:opacity-50">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* 내부 리스트 */}
      <div className="p-4 flex flex-col gap-3">
        {goal.items.map((item, idx) => {
          const isChecked = checkedIds.has(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleCheck(idx)}
              className="flex items-center gap-3 text-left w-full group transition-all duration-100 active:scale-[0.985] active:opacity-70"
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-brand border-brand' : 'bg-white border-ui-3 group-hover:border-brand'}`}>
                {isChecked && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-pretendard font-medium text-body-s transition-colors ${isChecked ? 'text-typo-alternative line-through' : 'text-typo-strong'}`}>
                  {item.name}
                </p>
                {item.detail && (
                  <p className={`font-pretendard text-caption-m transition-colors ${isChecked ? 'text-typo-alternative/60' : 'text-primary'}`}>
                    {item.detail}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 하단 진행바 및 완료 버튼 */}
      <div className="px-4 pb-4">
        <div className="h-1.5 w-full bg-ui-2 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-brand transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        
        <button
          onClick={handleComplete}
          disabled={!allChecked}
          className={`w-full py-3 rounded-xl font-pretendard font-bold text-body-s transition-all ${allChecked ? 'bg-brand text-white shadow-md active:scale-[0.98]' : 'bg-ui-2 text-typo-alternative opacity-50'}`}
        >
          {allChecked ? '완료! 기록 저장하기 🎉' : `${current} / ${total} 완료`}
        </button>
      </div>
    </div>
  );
}
