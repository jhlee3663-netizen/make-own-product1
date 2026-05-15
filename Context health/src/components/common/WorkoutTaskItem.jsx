import React, { useMemo, useRef, useState } from 'react';
import { IcSpark } from '../icons/Icons';
import { AutoTextarea } from './AutoTextarea';
import { filterExercises } from '../../utils/exerciseData';
import Pressable from './Pressable';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const BODY_SET_TYPES = [
  { pattern: /\(드랍(?:\s*세트?)?\)|드랍\s*세트/i, label: '드랍', color: '#d47800', bg: 'rgba(212,120,0,0.09)' },
  { pattern: /\(슈퍼(?:\s*세트?)?\)|슈퍼\s*세트/i, label: '슈퍼세트', color: '#008dcf', bg: 'rgba(0,141,207,0.1)' },
  { pattern: /\(컴파운드(?:\s*세트?)?\)|컴파운드\s*세트/i, label: '컴파운드', color: '#1565c0', bg: 'rgba(21,101,192,0.08)' },
  { pattern: /\(강제\s*반복\)|강제\s*반복/i, label: '강제반복', color: '#c62828', bg: 'rgba(198,40,40,0.08)' },
  { pattern: /\(저\s*중량\)|저중량/i, label: '저중량고반복', color: '#2e7d32', bg: 'rgba(46,125,50,0.08)' },
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

const WorkoutTaskItem = ({ title, body, onTitleChange, onBodyChange, onBodyBlur, isAI = false, prevMaxWeight, onAiClick, aiActive = false, isConverting, suppressSupersetBadge = false }) => {
  const currentMax = useMemo(() => parseMaxWeightFromText(body), [body]);
  const delta = prevMaxWeight != null && currentMax != null ? currentMax - prevMaxWeight : null;
  const [suggestions, setSuggestions] = useState([]);
  const [editingBody, setEditingBody] = useState(false);
  const [editingTitle, setEditingTitle] = useState(!title);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const titleInputRef = useRef(null);

  const hasGroups = useMemo(() =>
    body ? (
      BODY_SET_TYPES.some(t => t.pattern.test(body)) ||
      /\d+\s*(lbs?|파운드)/i.test(body) ||
      /\d+\s*칸/i.test(body)
    ) : false
  , [body]);

  const segments = useMemo(() => buildBodySegments(body), [body]);

  const renderKgChip = (line, key, variant = 'inline') => {
    const unitType = detectUnitType(line);
    if (!unitType) return null;
    return (
      <div className="relative flex-none">
        {activeTooltip?.key === key && (
          <>
            <div
              className="fixed inset-0 z-[5]"
              onClick={(e) => { e.stopPropagation(); setActiveTooltip(null); }}
            />
            <div
              className="fixed px-3 py-2.5 rounded-2xl text-[11px] font-pretendard leading-relaxed z-[6]"
              style={{
                background: '#E5F4EA',
                color: '#868E96',
                left: activeTooltip.left,
                top: activeTooltip.top,
                width: activeTooltip.width,
              }}
            >
              {unitType === 'lb'
                ? '1lb ≈ 0.45kg로 계산해서 총 볼륨에 반영해드려요 :)'
                : '한 칸을 5kg으로 계산해서 총 볼륨에 반영해드려요 :)'}
              <div
                className="absolute w-0 h-0"
                style={{
                  left: activeTooltip.arrowLeft,
                  top: 'calc(100% - 1px)',
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '6px solid #E5F4EA'
                }}
              />
            </div>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (activeTooltip?.key === key) {
              setActiveTooltip(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            const width = Math.min(280, window.innerWidth - 32);
            const center = rect.left + rect.width / 2;
            const left = clamp(center - width / 2, 16, window.innerWidth - width - 16);
            setActiveTooltip({
              key,
              width,
              left,
              top: Math.max(16, rect.top - 84),
              arrowLeft: clamp(center - left - 5, 12, width - 22),
            });
          }}
          className={`${variant === 'group' ? 'bg-white' : 'bg-[rgba(72,173,0,0.1)]'} inline-flex h-6 items-center justify-center px-3 rounded-full text-[11px] font-normal font-pretendard leading-4 tracking-[-0.275px] text-[#48ad00] whitespace-nowrap`}
        >
          kg 변환 완료
        </button>
      </div>
    );
  };

  const renderTypeChip = (type) => (
    <span
      key={type.label}
      className="bg-white inline-flex h-6 items-center justify-center px-3 rounded-full text-[11px] font-normal font-pretendard leading-4 tracking-[-0.275px] whitespace-nowrap"
      style={{ color: type.color }}
    >
      {type.label}
    </span>
  );

  return (
    <div className={`group flex flex-col bg-white border-b border-ui-2 transition-all ${isAI ? 'bg-brand/5' : ''}`}>
      {/* 종목 입력 영역 */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="flex flex-1 min-w-0 items-center gap-2 flex-wrap">
          {editingTitle || !title ? (
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => {
                onTitleChange(e.target.value);
                setSuggestions(filterExercises(e.target.value));
              }}
              onBlur={() => {
                setEditingTitle(false);
                setTimeout(() => setSuggestions([]), 150);
              }}
              placeholder="오늘의 운동 종목을 적어주세요"
              className="font-pretendard text-body-m font-semibold text-typo-normal tracking-[-0.4px] leading-lh-xs bg-transparent border-none outline-none p-0 placeholder:text-ui-4 w-full flex-1 min-w-[120px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingTitle(true);
                requestAnimationFrame(() => titleInputRef.current?.focus());
              }}
              className="font-pretendard text-body-m font-semibold text-typo-normal tracking-[-0.4px] leading-lh-xs bg-transparent border-none outline-none p-0 text-left max-w-full truncate"
            >
              {title}
            </button>
          )}
          {delta !== null && (
            <span className={`flex-none px-3 py-1 rounded-[12px] text-[11px] font-medium font-pretendard leading-4 tracking-[-0.275px] ${
              delta >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'
            }`}>
              저번대비 {delta >= 0 ? '+' : ''}{delta}kg
            </span>
          )}
        </div>
        <Pressable
          pressScale={0.88}
          onClick={onAiClick}
          className={`w-6 h-6 flex-none flex items-center justify-center ${isAI ? 'text-brand' : 'text-ui-3 group-hover:text-ui-5'}`}
        >
          <IcSpark active={aiActive} />
        </Pressable>
      </div>

      {/* 종목 자동완성 칩 */}
      {suggestions.length > 0 && (
        <div className="flex overflow-x-auto gap-2 px-4 pt-0.5 pb-1 scrollbar-hide">
          {suggestions.map(s => (
            <Pressable
              key={s}
              pressScale={0.94}
              onMouseDown={e => { e.preventDefault(); onTitleChange(s); setSuggestions([]); }}
              className="flex-none px-3 py-1 rounded-full bg-ui-2 text-typo-secondary text-[13px] font-medium font-pretendard tracking-[-0.3px] whitespace-nowrap"
            >
              {s}
            </Pressable>
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
          <div className="flex flex-col gap-1 cursor-text" onClick={() => setEditingBody(true)}>
            {segments.map((seg, idx) => {
              if (seg.type === 'note') {
                return (
                  <span key={idx} className="block px-2.5 py-1.5 rounded-lg bg-ui-2 text-[11px] italic text-typo-secondary leading-relaxed">
                    {seg.line}
                  </span>
                );
              }
              if (seg.type === 'group') {
                const hasUnitChip = seg.lines.some(line => detectUnitType(line));
                const visibleTypes = suppressSupersetBadge
                  ? seg.types.filter(t => t.label !== '슈퍼세트')
                  : seg.types;
                const hasBadges = visibleTypes.length > 0 || hasUnitChip;
                return (
                  <div key={idx} className={`rounded-[16px] px-2 ${hasBadges ? 'pt-4 pb-3' : 'py-3'} my-1 flex flex-col gap-4`} style={{ background: seg.types[0]?.bg ?? 'rgba(212,120,0,0.09)' }}>
                    {seg.lines.map((line, li) => (
                      <div key={li} className="text-[14px] font-medium font-pretendard text-[#646d76] leading-[22px] tracking-[-0.35px]">{line}</div>
                    ))}
                    {(visibleTypes.length > 0 || hasUnitChip) && (
                      <div className="flex items-start gap-1 flex-wrap">
                        {visibleTypes.map(renderTypeChip)}
                        {hasUnitChip && renderKgChip(seg.lines.find(line => detectUnitType(line)), `g_${idx}_kg`, 'group')}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={idx} className="flex items-center gap-2 py-2">
                  <span className="text-[14px] font-medium font-pretendard text-[#646d76] leading-5 tracking-[-0.35px] flex-1">{seg.line}</span>
                  {renderKgChip(seg.line, `n_${idx}`)}
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
