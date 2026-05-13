import React, { useState } from 'react';
import Pressable from '../common/Pressable';

export default function GoalCard({ goal, onComplete, onDismiss }) {
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [isFinishing, setIsFinishing] = useState(false);

  if (!goal || !goal.items) return null;

  const total = goal.items.length;
  const current = checkedIds.size;
  const progress = total > 0 ? (current / total) * 100 : 0;
  const allChecked = total > 0 && current === total;
  const isDiet = goal.type === 'diet';
  const kcalTotal = isDiet
    ? goal.items.reduce((sum, item) => {
        const match = String(item.detail || '').match(/(\d[\d,]*)\s*kcal/i);
        return sum + (match ? Number(match[1].replace(/,/g, '')) : 0);
      }, 0)
    : 0;

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
    }, 400);
  }

  return (
    <div className={`mx-4 mt-4 mb-2 bg-white rounded-[24px] border border-[#e9ecef] shadow-[0_8px_24px_rgba(23,26,29,0.08)] overflow-hidden transition-all duration-300 ${isFinishing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
      {/* 헤더 */}
      <div className={`flex items-start justify-between px-4 pt-4 pb-3 border-b border-ui-2 ${isDiet ? 'bg-[#f8fffb]' : 'bg-[#f8faff]'}`}>
        <div className="flex items-start gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] ${isDiet ? 'bg-[#e8f8ef]' : 'bg-brand text-white'}`}>
            {isDiet ? '🥗' : '🎯'}
          </div>
          <div className="min-w-0">
            <span className={`font-pretendard font-bold text-caption-l tracking-[-0.325px] ${isDiet ? 'text-[#1a9e5c]' : 'text-brand'}`}>
              {isDiet ? '오늘의 식단 목표' : '오늘의 목표'}
            </span>
            <p className="font-pretendard font-semibold text-body-s text-[#171719] tracking-[-0.35px] mt-0.5 truncate">
              {goal.title}
            </p>
            {isDiet && kcalTotal > 0 && (
              <p className="font-pretendard text-caption-m text-[#868e96] tracking-[-0.3px] mt-0.5">총 {kcalTotal.toLocaleString()} kcal</p>
            )}
          </div>
        </div>
        <Pressable
          pressScale={0.85}
          onClick={() => onDismiss(goal.id)}
          className="p-1 text-typo-alternative hover:bg-ui-2 rounded-full"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Pressable>
      </div>

      {/* 내부 리스트 */}
      <div className="p-4 flex flex-col gap-3">
        {goal.items.map((item, idx) => {
          const isChecked = checkedIds.has(idx);
          return (
            <Pressable
              key={idx}
              pressScale={0.985}
              onClick={() => toggleCheck(idx)}
              className="flex items-center gap-3 text-left w-full group"
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? (isDiet ? 'bg-[#1a9e5c] border-[#1a9e5c]' : 'bg-brand border-brand') : 'bg-white border-ui-3 group-hover:border-brand'}`}>
                {isChecked && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-pretendard font-medium text-body-s transition-colors ${isChecked ? 'text-typo-alternative line-through' : 'text-typo-strong'}`}>
                  {isDiet && item.meal ? <span className="text-[#1a9e5c] font-semibold mr-1.5">{item.meal}</span> : null}
                  {item.name}
                </p>
                {item.detail && (
                  <p className={`font-pretendard text-caption-m transition-colors ${isChecked ? 'text-typo-alternative/60' : 'text-primary'}`}>
                    {item.detail}
                  </p>
                )}
              </div>
            </Pressable>
          );
        })}
      </div>

      {/* 하단 진행바 및 완료 버튼 */}
      <div className="px-4 pb-4">
        <div className="h-1.5 w-full bg-ui-2 rounded-full overflow-hidden mb-3">
          <div className={`h-full transition-all duration-300 ${isDiet ? 'bg-[#1a9e5c]' : 'bg-brand'}`} style={{ width: `${progress}%` }} />
        </div>
        <Pressable
          pressScale={allChecked ? 0.97 : 1}
          onClick={handleComplete}
          disabled={!allChecked}
          className={`w-full py-3 rounded-xl font-pretendard font-bold text-body-s transition-colors ${allChecked ? (isDiet ? 'bg-[#1a9e5c] text-white shadow-md' : 'bg-brand text-white shadow-md') : 'bg-ui-2 text-typo-alternative opacity-50'}`}
        >
          {allChecked ? (isDiet ? '식단 완료! 기록 저장하기' : '완료! 기록 저장하기 🎉') : `${current} / ${total} 완료`}
        </Pressable>
      </div>
    </div>
  );
}
