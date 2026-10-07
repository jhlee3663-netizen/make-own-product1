import React from 'react';
import PressCard from '../common/PressCard';
import { kcalRange } from '../../lib/homeSummary';

/* 식단 탭: 고른 날짜의 섭취 칼로리 카드와 끼니 목록 (Figma 1163:10037). */

const CARD = 'bg-white shadow-[0_2px_12px_rgba(3,27,38,0.05)]';
const comma = value => Math.round(value).toLocaleString();

// 아침·점심·저녁은 항상 보이고, 간식·야식은 기록이 있을 때만 줄이 생긴다
const MEALS = [
  { id: 'breakfast', name: '아침', always: true },
  { id: 'am_snack', name: '오전 간식' },
  { id: 'lunch', name: '점심', always: true },
  { id: 'pm_snack', name: '오후 간식' },
  { id: 'dinner', name: '저녁', always: true },
  { id: 'night_snack', name: '야식' },
];

function IcPlus() {
  return (
    <span className="flex-none flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(113,113,255,0.1)]" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.5v9M1.5 6h9" stroke="#7171FF" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </span>
  );
}

export function IntakeCard({ totals, target, week, onClick, onLongPress }) {
  const range = kcalRange(target);
  const scaleMax = Math.max(Math.ceil(Math.max(target * 1.45, totals.kcal * 1.05, 1000) / 100) * 100, 1);
  const pct = value => `${Math.min(100, (value / scaleMax) * 100)}%`;
  const maxDay = Math.max(...week.map(day => day.kcal), 1);
  const lastIndex = week.length - 1;
  return (
    <div className="px-4">
      <PressCard onClick={onClick} onLongPress={onLongPress} radius={20} className={`${CARD} cursor-pointer`}>
        <div className="px-4 py-[14px] flex flex-col gap-4">
          <div className="flex flex-col gap-8">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1.5">
                <p className="font-pretendard font-semibold text-[13px] leading-4 text-[#868e96] tracking-[-0.325px]">섭취 칼로리</p>
                <p className="flex items-end gap-1.5">
                  <span className="font-pretendard font-bold text-[26px] leading-[31px] text-[#171a1d] tracking-[-0.65px]">{comma(totals.kcal)}</span>
                  <span className="font-pretendard text-[14px] leading-[22px] text-[#868e96] tracking-[-0.35px]">{target ? `/ ${comma(target)}kcal` : 'kcal'}</span>
                </p>
              </div>
              <div className="flex items-end gap-[5px]" aria-hidden="true">
                {week.map(({ key, day, kcal }, i) => (
                  <span key={key} className="flex flex-col items-center gap-1">
                    <span className="chart-bar w-[7px] rounded" style={{ '--d': `${150 + i * 40}ms`, height: kcal > 0 ? Math.max(4, (kcal / maxDay) * 26) : 2, background: i === lastIndex ? '#7171FF' : 'rgba(113,113,255,0.2)' }} />
                    <span className={`font-pretendard text-[9px] leading-[11px] tracking-[-0.225px] ${i === lastIndex ? 'font-bold text-brand' : 'text-[#adb5bd]'}`}>{day}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="relative h-[14px]">
                <span className="absolute left-0 right-0 top-[3px] h-2 rounded bg-[#f1f3f5]" />
                {range && <span className="absolute top-0 h-[14px] rounded bg-[rgba(113,113,255,0.2)]" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />}
                {totals.kcal > 0 && (
                  <span className="absolute left-0 top-[3px] h-2 overflow-hidden rounded" style={{ width: pct(totals.kcal), minWidth: 8 }}>
                    <span className="chart-grow-x block w-full h-full rounded" style={{ background: 'linear-gradient(90deg, rgba(113,113,255,0.3), #7171FF)' }} />
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between font-pretendard text-[11px] leading-[13px] tracking-[-0.275px]">
                <span className="text-[#adb5bd]">0</span>
                {range && <span className="font-semibold text-brand">적정 {comma(range.min)}~{comma(range.max)}</span>}
                <span className="text-[#adb5bd]">{comma(scaleMax)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4 font-pretendard text-[13px] leading-4 tracking-[-0.325px]">
            {[['탄수', totals.carb], ['단백질', totals.protein], ['지방', totals.fat]].map(([label, value]) => (
              <span key={label} className="flex gap-1">
                <span className="text-[#868e96]">{label}</span>
                <span className="font-bold text-brand">{comma(value)}g</span>
              </span>
            ))}
          </div>
        </div>
      </PressCard>
    </div>
  );
}

export function MealList({ meals, editable, onOpen }) {
  const rows = MEALS.filter(meal => meal.always || meals.has(meal.id));
  return (
    <div className="px-4">
      <div className={`${CARD} rounded-[20px] px-5 py-1.5`}>
        {rows.map((meal, i) => {
          const data = meals.get(meal.id);
          const content = (
            <>
              <span className="flex-none flex flex-col items-center justify-center w-[46px] h-[46px] rounded-full bg-[#f1f3f5]">
                <span className={`font-pretendard font-bold text-[13px] leading-4 tracking-[-0.325px] ${data ? 'text-[#171a1d]' : 'text-[#ced4da]'}`}>{data ? comma(data.kcal) : 0}</span>
                <span className="font-pretendard font-medium text-[9px] leading-[11px] text-[#868e96] tracking-[-0.225px]">kcal</span>
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                <span className="font-pretendard font-bold text-[15px] leading-[18px] text-[#171a1d] tracking-[-0.375px]">{meal.name}</span>
                <span className={`font-pretendard text-[13px] leading-4 tracking-[-0.325px] truncate ${data ? 'text-[#868e96]' : 'text-[#ced4da]'}`}>{data ? data.names.join(', ') : '아직 기록이 없어요'}</span>
              </span>
              {editable && <IcPlus />}
            </>
          );
          return (
            <div key={meal.id} className={i === 0 ? '' : 'border-t border-[#f1f3f5]'}>
              {editable
                ? <button type="button" onClick={onOpen} aria-label={`${meal.name} 기록하기`} className="w-full flex items-center gap-3 py-3 active:opacity-60">{content}</button>
                : <div className="flex items-center gap-3 py-3">{content}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
