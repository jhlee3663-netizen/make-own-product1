import React, { useState } from 'react';
import Pressable from './Pressable';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_ROUTINE = {
  '0': '', '1': '가슴·삼두', '2': '등·이두',
  '3': '어깨', '4': '하체', '5': '전신', '6': '',
};
const MEAL_SLOTS = [
  { id: 'breakfast', label: '아침' },
  { id: 'am_snack', label: '오전간식' },
  { id: 'lunch', label: '점심' },
  { id: 'pm_snack', label: '오후간식' },
  { id: 'dinner', label: '저녁' },
];

function isToday(ts) {
  if (!ts?.seconds) return false;
  const d = new Date(ts.seconds * 1000);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function CheckCircle({ done }) {
  return (
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none transition-colors ${done ? 'bg-brand border-brand' : 'border-ui-3'}`}>
      {done && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ui-4 flex-none">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function RoutineSheet({ onClose, workoutLogs, dietLogs, onNavigateToMemo, onNavigateToDiet }) {
  const [routine, setRoutine] = useState(() => {
    try { return { ...DEFAULT_ROUTINE, ...JSON.parse(localStorage.getItem('weekly_routine') || '{}') }; }
    catch { return DEFAULT_ROUTINE; }
  });
  const [editingDay, setEditingDay] = useState(null);
  const [editValue, setEditValue] = useState('');

  const today = new Date();
  const dayOfWeek = String(today.getDay());
  const todayLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 (${DAY_LABELS[today.getDay()]})`;

  const todayWorkout = workoutLogs?.find(l => isToday(l.timestamp));
  const todayDietLogs = dietLogs?.filter(l => isToday(l.timestamp)) || [];
  const completedMeals = new Set(
    todayDietLogs.flatMap(l =>
      (l.sections || []).filter(s => s.items?.length > 0).map(s => s.id)
    )
  );
  const todayPart = routine[dayOfWeek];

  function saveRoutine(day, value) {
    const next = { ...routine, [day]: value };
    setRoutine(next);
    localStorage.setItem('weekly_routine', JSON.stringify(next));
    setEditingDay(null);
  }

  return (
    <>
      <div className="fixed inset-0 z-[50] bg-black/40" onClick={onClose} />
      <div
        className="fixed top-0 left-0 right-0 z-[51] bg-white rounded-b-[24px] shadow-[0_14px_40px_rgba(0,0,0,0.16)]"
        style={{
          maxHeight: '88dvh',
          overflowY: 'auto',
          paddingTop: 'env(safe-area-inset-top)',
          animation: 'topSheetDown 0.3s cubic-bezier(.2,.8,.2,1) forwards',
        }}
      >
        <div className="px-5 pt-5 pb-5 flex flex-col gap-7">
          {/* 오늘의 할 일 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-pretendard font-bold text-[17px] text-typo-normal tracking-[-0.4px]">오늘의 할 일</h2>
              <span className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">{todayLabel}</span>
            </div>

            <div className="flex flex-col gap-2">
              {/* 운동 */}
              <Pressable
                pressScale={0.97}
                onClick={() => { onClose(); onNavigateToMemo(); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-ui-1"
              >
                <CheckCircle done={!!todayWorkout} />
                <div className="flex-1 min-w-0">
                  <p className={`font-pretendard text-[14px] font-semibold tracking-[-0.35px] ${todayWorkout ? 'text-typo-alternative line-through' : 'text-typo-normal'}`}>
                    {todayPart ? `${todayPart} 운동` : '운동 기록'}
                  </p>
                  {todayWorkout && (
                    <p className="font-pretendard text-[12px] text-brand tracking-[-0.3px] mt-0.5">오늘 완료 ✓</p>
                  )}
                </div>
                {!todayWorkout && <ChevronRight />}
              </Pressable>

              {/* 식단 슬롯 */}
              {MEAL_SLOTS.map(({ id, label }) => {
                const done = completedMeals.has(id);
                return (
                  <Pressable
                    key={id}
                    pressScale={0.97}
                    onClick={() => { onClose(); onNavigateToDiet(todayDietLogs[0] || null); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-ui-1"
                  >
                    <CheckCircle done={done} />
                    <p className={`flex-1 font-pretendard text-[14px] font-semibold tracking-[-0.35px] ${done ? 'text-typo-alternative line-through' : 'text-typo-normal'}`}>
                      {label} 기록
                    </p>
                    {!done && <ChevronRight />}
                  </Pressable>
                );
              })}
            </div>
          </div>

          {/* 이번 주 루틴 */}
          <div>
            <h2 className="font-pretendard font-bold text-[17px] text-typo-normal tracking-[-0.4px] mb-3">이번 주 루틴</h2>
            <div className="flex flex-col gap-1.5">
              {DAY_LABELS.map((day, idx) => {
                const key = String(idx);
                const isCurrentDay = key === dayOfWeek;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${isCurrentDay ? 'ring-1 ring-brand/30' : ''}`}
                    style={{ background: isCurrentDay ? 'rgba(52,118,238,0.06)' : 'rgba(0,0,0,0.03)' }}
                  >
                    <span className={`w-5 text-center font-pretendard text-[13px] font-bold tracking-[-0.3px] flex-none ${isCurrentDay ? 'text-brand' : 'text-typo-alternative'}`}>
                      {day}
                    </span>
                    {editingDay === key ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => saveRoutine(key, editValue)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRoutine(key, editValue);
                          if (e.key === 'Escape') setEditingDay(null);
                        }}
                        placeholder="운동 부위 입력"
                        className="flex-1 font-pretendard text-[14px] font-medium tracking-[-0.35px] bg-transparent outline-none text-typo-normal"
                      />
                    ) : (
                      <button
                        className="flex-1 text-left"
                        onClick={() => { setEditingDay(key); setEditValue(routine[key] || ''); }}
                      >
                        {routine[key]
                          ? <span className={`font-pretendard text-[14px] font-medium tracking-[-0.35px] ${isCurrentDay ? 'text-brand font-semibold' : 'text-typo-normal'}`}>{routine[key]}</span>
                          : <span className="font-pretendard text-[14px] font-medium tracking-[-0.35px] text-ui-4">미설정</span>
                        }
                      </button>
                    )}
                    {editingDay !== key && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ui-4 flex-none">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-center pt-2 pb-3 bg-white/90 backdrop-blur-sm rounded-b-[24px]">
          <div className="w-9 h-1 rounded-full bg-ui-3" />
        </div>
      </div>
    </>
  );
}
