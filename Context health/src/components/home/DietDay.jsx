import React from 'react';
import PressCard from '../common/PressCard';
import { kcalBarGradient, kcalRange, kcalScale, kcalVerdict, kcalVerdictColor } from '../../lib/homeSummary';
import { FadeLine } from '../diet/DietParts';

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

export function IntakeCard({ totals, target, week, isToday = false, onClick, onLongPress, bare = false }) {
  const range = kcalRange(target);
  // 지난 기록 카드와 같은 눈금·같은 결과 문구를 쓴다 (오늘은 모자란 양을 "남음"으로 말한다)
  const scaleMax = kcalScale(target);
  const verdict = kcalVerdict(totals.kcal, target, { inProgress: isToday });
  const pct = value => `${Math.min(100, (value / scaleMax) * 100)}%`;
  const maxDay = Math.max(...week.map(day => day.kcal), 1);
  const lastIndex = week.length - 1;
  return (
    <div className={bare ? '' : 'px-4'}>
      <PressCard onClick={onClick} onLongPress={onLongPress} radius={20} className={`${bare ? '' : CARD} cursor-pointer`}>
        <div className="px-4 py-3 flex flex-col gap-4">
          <div className="flex flex-col gap-8">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex flex-col gap-1.5">
                <p className="font-pretendard font-semibold text-[13px] leading-4 text-[#868e96] tracking-[-0.325px]">섭취 칼로리</p>
                {/* 좁은 화면에서는 "/ 목표"가 그래프와 겹치지 않게 아래 줄로 내려간다 */}
                <p className="flex flex-wrap items-end gap-x-1.5">
                  <span className="font-pretendard font-bold text-[26px] leading-[31px] text-[#171a1d] tracking-[-0.65px]">{comma(totals.kcal)}</span>
                  <span className="whitespace-nowrap font-pretendard text-[14px] leading-[22px] text-[#868e96] tracking-[-0.35px]">{target ? `/ ${comma(target)}kcal` : 'kcal'}</span>
                </p>
              </div>
              <div className="flex-none flex items-end gap-[5px]" aria-hidden="true">
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
                    <span className="chart-grow-x block w-full h-full rounded" style={{ background: kcalBarGradient(verdict?.tone) }} />
                  </span>
                )}
              </div>
              {/* 결과 문구는 적정 범위 표시의 가운데 아래에 둔다 */}
              {verdict && (
                <div className="relative h-[14px]">
                  <p
                    className="m-0 absolute top-0 -translate-x-1/2 whitespace-nowrap font-pretendard font-semibold text-[12px] leading-[14px] tracking-[-0.3px]"
                    style={{ left: `calc((${pct(range.min)} + ${pct(range.max)}) / 2)`, color: kcalVerdictColor(verdict.tone) }}
                  >
                    {verdict.text}
                  </p>
                </div>
              )}
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

export function MealList({ meals, editable, onOpen, bare = false }) {
  const rows = MEALS.filter(meal => meal.always || meals.has(meal.id));
  return (
    <div className={bare ? '' : 'px-4'}>
      <div className={bare ? 'px-5 py-2' : `${CARD} rounded-[20px] px-5 py-1.5`}>
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
            <div key={meal.id} className="relative">
              {i > 0 && <FadeLine />}
              {editable
                ? <button type="button" onClick={() => onOpen(meal.id)} aria-label={`${meal.name} 기록하기`} className="w-full flex items-center gap-3 py-3 active:opacity-60">{content}</button>
                : <div className="flex items-center gap-3 py-3">{content}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 홈에서는 섭취 칼로리와 끼니 목록을 한 장의 카드로 합친다 (Figma 1204:6858).
   아래 "최근 기록" 카드들과 모양이 달라져, 오늘(고른 날) 카드가 어느 것인지 헷갈리지 않는다. */
export function TodayDietCard({ intake, meals }) {
  return (
    <div className="px-4">
      <div className="bg-white rounded-[20px] shadow-[0_2px_6px_rgba(3,27,38,0.05)] flex flex-col gap-1">
        <IntakeCard {...intake} bare />
        <MealList {...meals} bare />
      </div>
    </div>
  );
}
