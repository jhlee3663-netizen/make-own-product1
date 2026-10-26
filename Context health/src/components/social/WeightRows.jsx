import React, { useEffect, useState } from 'react';
import { buildWeightRows, formatPlan, lastTopByExercise, loadMyRecentLogs, rowWeight } from '../../lib/importPlan';
import { FadeLine, Skeleton, Tag } from './ui';
import { IcGrip } from './SocialIcons';

/* 무게 맞추기 목록 (Figma 08 시트 · 06 정리 결과). 세트·횟수는 그대로, 무게만 내 기록에 맞춘다. */

export function Segmented({ options, value, onChange }) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="relative flex h-[42px] p-1 rounded-[12px] bg-ui-2">
      <span
        className="absolute top-1 bottom-1 rounded-[9px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.3,1.2,0.45,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`relative flex-1 min-w-0 px-1 truncate whitespace-nowrap font-pretendard text-[13px] min-[360px]:text-[14px] tracking-[-0.35px] transition-colors ${o.id === value ? 'font-semibold text-typo-strong' : 'font-medium text-typo-alternative'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* 내 기록을 불러와 행을 만든다 */
export function useWeightPlan(uid, items, { sourceWeights, sourceName }) {
  const [mine, setMine] = useState(null);
  useEffect(() => {
    let alive = true;
    /* 오프라인이면 Firestore가 답을 미루므로 5초 뒤에는 기록 없이 진행한다 */
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    Promise.race([loadMyRecentLogs(uid), timeout]).then((logs) => alive && setMine({ logs, map: lastTopByExercise(logs) })).catch(() => alive && setMine({ logs: [], map: new Map() }));
    return () => { alive = false; };
  }, [uid]);
  const rows = mine && items ? buildWeightRows(items, { sourceWeights, sourceName, mine: mine.map }) : null;
  return { rows, myLogs: mine?.logs || null };
}

function WeightChip({ row, weight, editing, onEdit, onCommit, emptyMode }) {
  const [value, setValue] = useState(weight ?? '');
  useEffect(() => { setValue(weight ?? ''); }, [weight, editing]);
  if (editing) {
    return (
      <span className="flex items-center gap-1 h-[34px] px-2 rounded-[10px] bg-brand-light">
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => onCommit(value === '' ? null : Math.round(Number(value) * 10) / 10)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-12 bg-transparent text-right font-pretendard font-semibold text-[14px] text-brand outline-none"
          aria-label={`${row.name} 무게`}
        />
        <span className="font-pretendard font-semibold text-[13px] text-brand">kg</span>
      </span>
    );
  }
  /* 무게가 없을 때 '직접 입력'은 상자 없이 글자만 둔다 (위쪽 '피드에 올리기'보다 눈에 덜 띄게) */
  if (!weight && !emptyMode) {
    return <button type="button" onClick={onEdit} className="flex-none h-[34px] px-1 font-pretendard font-semibold text-[14px] text-brand">직접 입력</button>;
  }
  return (
    <button type="button" onClick={onEdit} className="flex-none h-[34px] px-2 rounded-[10px] bg-brand-light font-pretendard font-semibold text-[14px] text-brand">
      {formatPlan(weight, row)}
    </button>
  );
}

export function WeightRowList({ rows, mode, overrides, setOverrides, showGrip = false }) {
  const [editing, setEditing] = useState(null);
  if (!rows) {
    return <div className="flex flex-col gap-4 py-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  }
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => {
        const weight = rowWeight(row, mode, overrides);
        return (
          <React.Fragment key={row.id}>
            {i > 0 && <FadeLine />}
            <div className="flex items-center gap-2 py-3">
              {showGrip && <span className="text-ui-5 flex-none"><IcGrip /></span>}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-pretendard font-semibold text-[15px] leading-5 text-typo-strong truncate">{row.name}</span>
                  {row.estimated && mode === 'mine' && overrides[row.id] === undefined && <Tag tone="gray">추정</Tag>}
                </div>
                <span className="font-pretendard text-[12px] leading-[17px] text-typo-alternative">{row.sub}</span>
              </div>
              <WeightChip
                row={row}
                weight={weight}
                editing={editing === row.id}
                emptyMode={mode === 'empty'}
                onEdit={() => setEditing(row.id)}
                onCommit={(v) => { setOverrides((o) => ({ ...o, [row.id]: v })); setEditing(null); }}
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
