import React from 'react';
import Pressable from '../common/Pressable';
import { headerLabel } from '../../lib/homeSummary';

/* 홈 상단 (Figma 📚 스터디 1163:12392): 보라 바탕 위에 날짜, 주간 띠, 폴더 모양 탭.
   날짜 하나가 운동·식단 두 탭을 모두 지배한다. */

const TABS = [{ id: 'workout', label: '운동' }, { id: 'diet', label: '식단' }];

function IcTodo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.5 1.25A3.25 3.25 0 0 0 3.25 4.5v15a3.25 3.25 0 0 0 3.25 3.25h11a3.25 3.25 0 0 0 3.25-3.25V8.6a2 2 0 0 0-.59-1.41l-5.35-5.35a2 2 0 0 0-1.41-.59H6.5Zm1.5 11a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H8Z" fill="#fff" />
    </svg>
  );
}

export default function HomeHeader({ dateKey, todayKey, week, markedDays, tab, onTabChange, onDateChange, onTodoClick }) {
  const tabIndex = Math.max(0, TABS.findIndex(item => item.id === tab));
  return (
    <header className="flex-none flex flex-col z-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-6">
        <label className="relative flex items-center gap-1 cursor-pointer">
          <span className="font-pretendard font-bold text-[20px] leading-6 text-white tracking-[-0.5px] whitespace-nowrap">{headerLabel(dateKey)}</span>
          <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M2 1.5h8L6 6.5 2 1.5Z" fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          {/* 날짜 글자 위에 투명한 날짜 입력을 겹쳐, 누르면 폰의 달력이 뜬다 */}
          <input
            type="date"
            value={dateKey}
            max={todayKey}
            onChange={event => event.target.value && onDateChange(event.target.value)}
            aria-label="날짜 선택"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <Pressable pressScale={0.93} onClick={onTodoClick} className="flex items-center gap-1 opacity-70">
          <span className="font-pretendard font-semibold text-[16px] leading-6 text-white tracking-[-0.4px]">할 일</span>
          <IcTodo />
        </Pressable>
      </div>

      <div className="flex items-start px-2 pb-6">
        {week.map(({ key, day, weekday }) => {
          const on = key === dateKey;
          const future = key > todayKey;
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              onClick={() => onDateChange(key)}
              aria-label={`${day}일 ${weekday}요일`}
              aria-pressed={on}
              className="flex-1 min-w-0 flex flex-col items-center gap-1"
            >
              <span className="font-pretendard font-medium text-[12px] leading-[14px] text-white/70 tracking-[-0.3px]">{weekday}</span>
              <span
                className={`home-day flex items-center justify-center w-8 h-8 rounded-full font-pretendard text-[15px] tracking-[-0.375px] ${on ? 'bg-white text-brand font-bold' : `text-white font-semibold ${future ? 'opacity-40' : ''}`}`}
              >
                {day}
              </span>
              <span className={`w-[5px] h-[5px] rounded-full ${markedDays.has(key) ? 'bg-white' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <div role="tablist" className="relative flex px-6">
        {/* 선택된 탭의 흰 바탕. 탭을 바꾸면 옆으로 미끄러진다. */}
        <span
          aria-hidden="true"
          className="home-tab-slider absolute top-0 bottom-0 left-6 bg-white rounded-t-[24px]"
          style={{ width: 'calc((100% - 48px) / 2)', transform: `translateX(${tabIndex * 100}%)` }}
        />
        {TABS.map(({ id, label }) => {
          const on = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTabChange(id)}
              className="relative flex-1 py-2 grid place-items-center font-pretendard text-[16px] leading-5 tracking-[-0.4px]"
            >
              <span className="tab-label col-start-1 row-start-1 font-medium text-white" style={{ opacity: on ? 0 : 1 }}>{label}</span>
              <span aria-hidden="true" className="tab-label col-start-1 row-start-1 font-bold text-brand" style={{ opacity: on ? 1 : 0 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
