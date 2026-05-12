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

function detectUnitType(line) {
  if (/\d+\s*(lbs?|파운드)/i.test(line)) return 'lb';
  if (/\d+\s*칸/i.test(line)) return 'slot';
  return null;
}

const BODY_SET_TYPES = [
  { pattern: /\(드랍(?:\s*세트?)?\)|드랍\s*세트/i, label: '드랍', bg: '#fff3e0', color: '#e65100' },
  { pattern: /\(슈퍼(?:\s*세트?)?\)|슈퍼\s*세트/i, label: '슈퍼세트', bg: '#f3e5f5', color: '#7b1fa2' },
  { pattern: /\(컴파운드(?:\s*세트?)?\)|컴파운드\s*세트/i, label: '컴파운드', bg: '#e3f2fd', color: '#1565c0' },
  { pattern: /\(강제\s*반복\)|강제\s*반복/i, label: '강제반복', bg: '#fce4ec', color: '#c62828' },
  { pattern: /\(저\s*중량\)|저중량/i, label: '저중량고반복', bg: '#e8f5e9', color: '#2e7d32' },
];

function buildBodySegments(body) {
  const lines = (body || '').split('\n').filter(l => l.trim());
  const lineTypes = lines.map(l =>
    l.trim().startsWith('💬') ? [] : BODY_SET_TYPES.filter(t => t.pattern.test(l))
  );
  const hasMark = lineTypes.map(types => types.length > 0);
  const inGroup = lines.map((l, i) => {
    if (l.trim().startsWith('💬')) return false;
    if (hasMark[i]) return true;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim().startsWith('💬')) return hasMark[j];
    }
    return false;
  });

  const segments = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('💬')) {
      segments.push({ type: 'note', line: lines[i] });
      i++;
    } else if (inGroup[i]) {
      const gLines = [], gTypes = [];
      while (i < lines.length && inGroup[i] && !lines[i].trim().startsWith('💬')) {
        gLines.push(lines[i]);
        lineTypes[i].forEach(t => { if (!gTypes.find(gt => gt.label === t.label)) gTypes.push(t); });
        i++;
      }
      segments.push({ type: 'group', lines: gLines, types: gTypes });
    } else {
      segments.push({ type: 'normal', line: lines[i] });
      i++;
    }
  }
  return segments;
}

const WorkoutTaskItem = ({ title, body, onTitleChange, onBodyChange, onBodyBlur, isAI = false, prevMaxWeight, onAiClick, isConverting }) => {
  const currentMax = useMemo(() => parseMaxWeightFromText(body), [body]);
  const delta = prevMaxWeight != null && currentMax != null ? currentMax - prevMaxWeight : null;
  const [suggestions, setSuggestions] = useState([]);
  const [editingBody, setEditingBody] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const hasGroups = useMemo(() =>
    body ? (
      BODY_SET_TYPES.some(t => t.pattern.test(body)) ||
      /\d+\s*(lbs?|파운드)/i.test(body) ||
      /\d+\s*칸/i.test(body)
    ) : false
  , [body]);

  const segments = useMemo(() => buildBodySegments(body), [body]);

  const renderChip = (line, key) => {
    const unitType = detectUnitType(line);
    if (!unitType) return null;
    return (
      <div className="relative flex-none">
        {activeTooltip === key && (
          <>
            <div
              className="fixed inset-0 z-[5]"
              onClick={(e) => { e.stopPropagation(); setActiveTooltip(null); }}
            />
            <div
              className="absolute bottom-full right-0 mb-2 w-[176px] px-3 py-2.5 rounded-2xl text-[11px] font-pretendard leading-relaxed z-[6]"
              style={{ background: '#E5F4EA', color: '#868E96' }}
            >
              {unitType === 'lb'
                ? '1lb ≈ 0.45kg로 계산해서 총 볼륨에 반영해드려요 :)'
                : '한 칸을 5kg으로 계산해서 총 볼륨에 반영해드려요 :)'}
              <div
                className="absolute right-3 w-0 h-0"
                style={{ top: 'calc(100% - 1px)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #E5F4EA' }}
              />
            </div>
          </>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setActiveTooltip(prev => prev === key ? null : key); }}
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-pretendard bg-[#e6f9f0] text-[#1a9e5c] whitespace-nowrap"
        >
          kg 변환 완료
        </button>
      </div>
    );
  };

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
            delta >= 0 ? 'bg-[#e6f9f0] text-[#1a9e5c]' : 'bg-[#ffeef0] text-[#e03e52]'
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

      {/* 상세 기록 입력 영역 */}
      <div className="px-4 pt-1 pb-4 relative">
        {editingBody || !hasGroups ? (
          <AutoTextarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onBlur={() => { setEditingBody(false); onBodyBlur?.(body); }}
            onFocus={() => setEditingBody(true)}
            placeholder="운동의 무게와 세트수 등 편하게 적어주세요"
            className={`font-pretendard text-body-s font-medium tracking-[-0.35px] leading-5 bg-transparent border-none outline-none w-full p-0 placeholder:text-ui-4/70 ${isAI ? 'text-[#0066ff]' : 'text-typo-secondary'}`}
          />
        ) : (
          <div className="flex flex-col gap-0.5 cursor-text" onClick={() => setEditingBody(true)}>
            {segments.map((seg, idx) => {
              if (seg.type === 'note') {
                return (
                  <span key={idx} className="block px-2.5 py-1.5 rounded-lg bg-ui-2 text-[11px] italic text-typo-secondary leading-relaxed">
                    {seg.line}
                  </span>
                );
              }
              if (seg.type === 'group') {
                const mainType = seg.types[0];
                return (
                  <div key={idx} className="relative rounded-xl px-2.5 pt-2 pb-5"
                    style={{ background: mainType?.bg || '#fff3e0', margin: '4px 0' }}>
                    {seg.lines.map((line, li) => (
                      <div key={li} className="flex items-center gap-1.5 py-0.5">
                        <span className="text-[13px] font-pretendard text-typo-secondary leading-5 flex-1">{line}</span>
                        {renderChip(line, `g_${idx}_${li}`)}
                      </div>
                    ))}
                    {mainType && (
                      <span className="absolute bottom-1.5 right-2.5 text-[10px] font-bold font-pretendard"
                        style={{ color: mainType.color }}>{mainType.label}</span>
                    )}
                  </div>
                );
              }
              return (
                <div key={idx} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-[13px] font-pretendard text-typo-secondary leading-5 flex-1">{seg.line}</span>
                  {renderChip(seg.line, `n_${idx}`)}
                </div>
              );
            })}
          </div>
        )}
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
