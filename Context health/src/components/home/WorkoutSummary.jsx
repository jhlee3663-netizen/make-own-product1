import React from 'react';
import { formatCardioDuration } from '../../utils/utils';

/* 운동 탭 맨 위 요약 두 칸 (Figma 1163:12392): 헬스 · 최근 7일 | 유산소 · 최근 7일 */

const CARD = 'flex-1 min-w-0 bg-white rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] p-4 flex flex-col gap-4';
const TITLE = 'font-pretendard font-semibold text-[13px] leading-4 text-[#868e96] tracking-[-0.325px]';
const DAY_LABEL = 'font-pretendard text-[9px] leading-[11px] text-[#adb5bd] tracking-[-0.225px]';

export default function WorkoutSummary({ days, grid, cardio }) {
  const maxMinutes = Math.max(...cardio.minutes, 1);
  const lastIndex = days.length - 1;
  return (
    <div className="px-4 flex gap-3 items-stretch">
      <section className={CARD} aria-label="헬스 최근 7일">
        <h3 className={TITLE}>헬스 · 최근 7일</h3>
        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center">
            <span className="w-[30px] h-[14px] flex-none" />
            {days.map(({ key, day }) => <span key={key} className={`flex-1 text-center ${DAY_LABEL}`}>{day}</span>)}
          </div>
          {grid.map(({ part, done }) => (
            <div key={part} className="flex items-center">
              <span className="w-[30px] h-[14px] flex-none flex items-center font-pretendard text-[11px] text-[#868e96] tracking-[-0.275px]">{part}</span>
              {done.map((on, i) => (
                <span key={days[i].key} className="flex-1 flex justify-center">
                  <span className="chart-dot-in w-[9px] h-[9px] rounded-full" style={{ background: on ? '#7171FF' : '#F1F3F5', '--d': `${150 + i * 35}ms` }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={CARD} aria-label="유산소 최근 7일">
        <h3 className={TITLE}>유산소 · 최근 7일</h3>
        <div className="flex-1 flex flex-col justify-between gap-4">
          <p className="flex items-end gap-1">
            <span className="font-pretendard font-bold text-[22px] leading-[26px] text-[#171a1d] tracking-[-0.55px]">{cardio.total >= 100 ? formatCardioDuration(cardio.total) : `${cardio.total}분`}</span>
            <span className="font-pretendard font-medium text-[12px] leading-[18px] text-[#868e96] tracking-[-0.3px]">{cardio.sessions}회</span>
          </p>
          <div className="flex items-end gap-1.5">
            {cardio.minutes.map((value, i) => (
              <span key={days[i].key} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span
                  className="chart-bar w-full rounded-t"
                  style={{ '--d': `${150 + i * 45}ms`, height: value > 0 ? Math.max(6, (value / maxMinutes) * 30) : 2, background: value > 0 && i === lastIndex ? '#7171FF' : 'rgba(113,113,255,0.2)' }}
                />
                <span className={DAY_LABEL}>{days[i].day}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
