import React, { useMemo } from 'react';
import { IcSpark } from '../icons/Icons';
import { AutoTextarea } from './AutoTextarea';

function parseMaxWeightFromText(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)];
  if (!matches.length) return null;
  return Math.max(...matches.map(m => parseFloat(m[1])));
}

const WorkoutTaskItem = ({ title, body, onTitleChange, onBodyChange, isAI = false, prevMaxWeight }) => {
  const currentMax = useMemo(() => parseMaxWeightFromText(body), [body]);
  const delta = prevMaxWeight != null && currentMax != null ? currentMax - prevMaxWeight : null;

  return (
    <div className={`group flex flex-col bg-white border-b border-ui-2 transition-all ${isAI ? 'bg-brand/5' : ''}`}>
      {/* 종목 입력 영역 */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="오늘의 운동 종목을 적어주세요"
          className="font-pretendard text-body-m font-semibold text-typo-normal tracking-[-0.4px] leading-lh-xs bg-transparent border-none outline-none w-full p-0 flex-1 placeholder:text-ui-4"
        />
        {delta !== null && (
          <span className={`flex-none px-2 py-0.5 rounded-full text-[11px] font-semibold font-pretendard tracking-[-0.2px] ${
            delta >= 0
              ? 'bg-[#e6f9f0] text-[#1a9e5c]'
              : 'bg-[#ffeef0] text-[#e03e52]'
          }`}>
            저번대비 {delta >= 0 ? '+' : ''}{delta}kg
          </span>
        )}
        <button className={`w-6 h-6 flex-none flex items-center justify-center transition-colors ${isAI ? 'text-brand' : 'text-ui-3 group-hover:text-ui-5'}`}>
          <IcSpark size={18} />
        </button>
      </div>

      {/* 상세 기록 입력 영역 (무게/세트) */}
      <div className="px-4 pt-1 pb-4">
        <AutoTextarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="운동의 무게와 세트수 등 편하게 적어주세요"
          className="font-pretendard text-body-s font-medium text-typo-secondary tracking-[-0.35px] leading-lh-2xs bg-transparent border-none outline-none w-full p-0 placeholder:text-ui-4/70"
        />
      </div>
    </div>
  );
};

export default WorkoutTaskItem;
