import React, { useMemo, useState } from 'react';
import { IcSpark } from '../icons/Icons';
import { AutoTextarea } from './AutoTextarea';
import { filterExercises } from '../../utils/exerciseData';

function parseMaxWeightFromText(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)];
  if (!matches.length) return null;
  return Math.max(...matches.map(m => parseFloat(m[1])));
}

const SET_TYPES = [
  { pattern: /\(드랍\s*세트?\)|드랍\s*세트/gi, label: '드랍', bg: '#fff3e0', color: '#e65100' },
  { pattern: /\(슈퍼\s*세트?\)|슈퍼\s*세트/gi, label: '슈퍼세트', bg: '#f3e5f5', color: '#7b1fa2' },
  { pattern: /\(컴파운드\s*세트?\)|컴파운드\s*세트/gi, label: '컴파운드', bg: '#e3f2fd', color: '#1565c0' },
  { pattern: /\(강제\s*반복\)|강제\s*반복/gi, label: '강제반복', bg: '#fce4ec', color: '#c62828' },
  { pattern: /\(저\s*중량\)|저중량/gi, label: '저중량고반복', bg: '#e8f5e9', color: '#2e7d32' },
];

function detectSetTypes(text) {
  if (!text) return [];
  return SET_TYPES.filter(t => { t.pattern.lastIndex = 0; return t.pattern.test(text); });
}

const WorkoutTaskItem = ({ title, body, onTitleChange, onBodyChange, onBodyBlur, isAI = false, prevMaxWeight, onAiClick, isConverting }) => {
  const currentMax = useMemo(() => parseMaxWeightFromText(body), [body]);
  const delta = prevMaxWeight != null && currentMax != null ? currentMax - prevMaxWeight : null;
  const [suggestions, setSuggestions] = useState([]);
  const setTypeBadges = useMemo(() => detectSetTypes(body), [body]);

  return (
    <div className={`group flex flex-col bg-white border-b border-ui-2 transition-all ${isAI ? 'bg-brand/5' : ''}`}>
      {/* 종목 입력 영역 */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <input
          value={title}
          onChange={(e) => {
            onTitleChange(e.target.value);
            setSuggestions(filterExercises(e.target.value));
          }}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
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
        <button
          onClick={onAiClick}
          className={`w-6 h-6 flex-none flex items-center justify-center transition-all duration-100 active:scale-[0.80] active:opacity-60 ${isAI ? 'text-brand' : 'text-ui-3 group-hover:text-ui-5'}`}
        >
          <IcSpark size={18} />
        </button>
      </div>

      {/* 세트 타입 뱃지 */}
      {setTypeBadges.length > 0 && (
        <div className="flex gap-1.5 px-4 pb-1">
          {setTypeBadges.map(t => (
            <span
              key={t.label}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-pretendard tracking-[-0.2px]"
              style={{ background: t.bg, color: t.color }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* 종목 자동완성 칩 */}
      {suggestions.length > 0 && (
        <div className="flex overflow-x-auto gap-2 px-4 pt-0.5 pb-1 scrollbar-hide">
          {suggestions.map(s => (
            <button
              key={s}
              onMouseDown={e => { e.preventDefault(); onTitleChange(s); setSuggestions([]); }}
              className="flex-none px-3 py-1 rounded-full bg-ui-2 text-typo-secondary text-[13px] font-medium font-pretendard tracking-[-0.3px] whitespace-nowrap transition-all duration-100 active:scale-[0.94] active:bg-ui-3"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 상세 기록 입력 영역 (무게/세트) */}
      <div className="px-4 pt-1 pb-4 relative">
        <AutoTextarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onBlur={() => onBodyBlur?.(body)}
          placeholder="운동의 무게와 세트수 등 편하게 적어주세요"
          className={`font-pretendard text-body-s font-medium tracking-[-0.35px] leading-5 bg-transparent border-none outline-none w-full p-0 placeholder:text-ui-4/70 ${isAI ? 'text-[#0066ff]' : 'text-typo-secondary'}`}
        />
        {isConverting && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded">
            <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkoutTaskItem;
