import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { HomeDateRow, HomeTabs, NECK_BREAK, PullGap, SheetCorners, WeekStrip } from '../src/components/home/HomeHeader';
import WorkoutSummary from '../src/components/home/WorkoutSummary';
import { TodayDietCard } from '../src/components/home/DietDay';
import WorkoutCard from '../src/components/dashboard/WorkoutCard';
import { buildStrengthMessage, compareWithPrevious, gradeSession } from '../src/lib/strengthProgress';
import { cardioWeek, dietDay, groupByDate, lastDays, partGrid } from '../src/lib/homeSummary';

/* 홈 화면 미리보기 (더미 데이터). ?tab=workout|diet  ?empty  ?scroll=120(스크롤한 상태)  ?pull(당긴 상태) — 체중 입력 줄은 서버가 필요해 모양만 그린다. */
const params = new URLSearchParams(location.search);
const TODAY = '2026-10-07';
const PULL = Number(params.get('pull') || 0); // ?pull=18 처럼 당긴 거리를 준다
const at = (key, hour = 10) => ({ seconds: Math.floor(new Date(`${key}T${String(hour).padStart(2, '0')}:00:00`).getTime() / 1000) });

const workouts = params.has('empty') ? [] : [
  { docId: 'now', timestamp: { seconds: Math.floor(Date.now() / 1000) }, title: '가슴, 삼두', sections: [{ part: '가슴', items: [{ title: '벤치프레스', body: '• 세트 1: 40kg 10회\n• 세트 2: 80kg 7회\n• 세트 3: 80kg 6회\n• 세트 4: 80kg 5회' }] }], exercises: [{ name: '벤치프레스' }], totalVolume: 4200, overloadMsg: '볼륨 4,200kg, 5% 과부하 성공!', aiStatus: 'done' },
  { docId: 'a', timestamp: at('2026-10-06'), title: '삼두, 이두, 유산소', sections: [{ part: '삼두', items: [{ title: '케이블 푸쉬다운', body: '• 세트 1: 25kg 12회\n• 세트 2: 25kg 11회\n• 세트 3: 25kg 9회' }] }, { part: '이두', items: [{ title: '해머 컬', body: '• 세트 4: 12kg 10회\n• 세트 5: 12kg 10회' }] }, { part: '유산소', items: [{ title: '천국의 계단', body: '30분' }] }], exercises: [{ name: '케이블 푸쉬다운' }, { name: '해머 컬' }, { name: '천국의 계단' }], totalVolume: 3874, cardioMinutes: 30, overloadMsg: '볼륨 3,874kg, 29% 과부하 실패!', aiStatus: 'done' },
  { docId: 'b', timestamp: at('2026-10-05'), title: '유산소', sections: [{ part: '유산소' }], exercises: [{ name: '걷기' }, { name: '천국의 계단' }], totalVolume: 0, cardioMinutes: 30, aiStatus: 'done' },
  { docId: 'c', timestamp: at('2026-10-04'), title: '하체', sections: [{ part: '하체', items: [{ title: '스쿼트', body: '• 세트 1: 60kg 8회\n• 세트 2: 100kg 5회\n• 세트 3: 100kg 5회\n• 세트 4: 100kg 4회' }, { title: '레그 익스텐션', body: '• 세트 5: 50kg 12회\n• 세트 6: 50kg 12회' }] }], exercises: [{ name: '스쿼트' }, { name: '레그 익스텐션' }, { name: '레그 컬' }], totalVolume: 7963, overloadMsg: '볼륨 7,963kg, 4.2% 과부하 성공!', aiStatus: 'done' },
  { docId: 'd', timestamp: at('2026-10-01'), title: '가슴, 유산소', sections: [{ part: '가슴', items: [{ title: '벤치프레스', body: '• 세트 1: 77.5kg 6회\n• 세트 2: 77.5kg 6회\n• 세트 3: 77.5kg 5회' }] }], exercises: [{ name: '벤치프레스' }], totalVolume: 5460, cardioMinutes: 20, aiStatus: 'done' },
];
const meal = (id, name, items) => ({ id, name, items: items.map(([n, kcal]) => ({ name: n, kcal })) });
const diets = params.has('empty') ? [] : [
  { docId: 'x', timestamp: at(params.get('date') || TODAY), kcal: Number(params.get("kcal")) || 1850, carb: 210, protein: 112, fat: 58, sections: [meal('breakfast', '아침', [['그릭요거트', 200], ['바나나', 120]]), meal('lunch', '점심', [['닭가슴살 샐러드', 520], ['아메리카노', 20]]), meal('dinner', '저녁', [['소고기 덮밥', 900], ['된장국', 90]])] },
  { docId: 'y', timestamp: at('2026-10-05'), kcal: 2240, carb: 250, protein: 130, fat: 70, sections: [] },
  { docId: 'z', timestamp: at('2026-10-03'), kcal: 1620, carb: 180, protein: 95, fat: 50, sections: [] },
];

/* 홈 화면과 같은 방식: 직전 같은 종목 대비 탑세트 추정 1RM으로 배지와 요약 줄을 만든다 */
function cardProgress(d) {
  const sorted = [...workouts].sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
  const progress = compareWithPrevious(d.sections || [], sorted.slice(sorted.indexOf(d) + 1));
  return { perfGrade: gradeSession(progress), progressLine: buildStrengthMessage(progress) };
}

function App() {
  const [tab, setTab] = useState(params.get('tab') || 'workout');
  const [dateKey, setDateKey] = useState(params.get('date') || TODAY);
  const days = lastDays(dateKey, 7);
  const wByDate = groupByDate(workouts);
  const dByDate = groupByDate(diets);
  const day = wByDate.get(dateKey) || [];
  const prev = workouts.filter(w => new Date(w.timestamp.seconds * 1000) < new Date(`${dateKey}T00:00:00`));
  const dd = dietDay(dByDate.get(dateKey) || []);
  return (
    <div style={{ width: Number(params.get('w')) || 402, height: Number(params.get('h')) || 874, margin: '0 auto', position: 'relative', overflow: 'hidden' }} className="bg-brand">
      <main ref={el => { if (el && params.get('scroll')) requestAnimationFrame(() => { el.scrollTop = Number(params.get('scroll')); }); }} className="h-full overflow-y-auto overscroll-none">
        <HomeDateRow dateKey={dateKey} todayKey={TODAY} onDateChange={setDateKey} onTodoClick={() => {}} />
        <WeekStrip dateKey={dateKey} todayKey={TODAY} markedDays={new Set((tab === 'workout' ? wByDate : dByDate).keys())} onDateChange={setDateKey} />
        <HomeTabs tab={tab} onTabChange={setTab} pull={PULL} detached={PULL >= NECK_BREAK} />
        <PullGap height={PULL} pull={PULL} detached={PULL >= NECK_BREAK} tabIndex={tab === 'workout' ? 0 : 1} width={Number(params.get('w')) || 402} animate={false}>
          {PULL >= NECK_BREAK && <div className="relative w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />}
        </PullGap>
        <div className="relative z-[15] bg-[#f8f9fa] min-h-full pb-[120px]">
        <SheetCorners />
        <div key={`${tab}-${dateKey}`} className="stagger-in flex flex-col gap-3 pt-[14px]">
          {tab === 'workout' ? (workouts.length === 0 ? (
            <div className="flex flex-col items-center px-8 pt-20 gap-2">
              <p className="font-pretendard font-bold text-[17px] text-typo-strong tracking-[-0.4px]">아직 운동 기록이 없어요</p>
              <p className="font-pretendard text-body-s text-typo-alternative text-center tracking-[-0.3px] leading-relaxed">첫 운동을 기록하면 여기에 차곡차곡 쌓여요</p>
              <button className="mt-3 px-6 py-3 bg-brand text-white rounded-2xl font-pretendard font-bold text-body-s tracking-[-0.35px]">운동 기록하기</button>
            </div>
          ) : (
            <>
              <div className="px-4"><div className="bg-white rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-4 py-3 flex items-center justify-between">
                <p className="font-pretendard font-medium text-[14px] leading-5 text-[#495057] tracking-[-0.35px]">아침 공복 체중</p>
                <div className="flex items-center gap-1.5"><span className="w-14 h-7 rounded-lg border border-brand bg-[#f8f9fa]" /><span className="font-pretendard text-[12px] text-[#868e96]">kg</span></div>
              </div></div>
              <WorkoutSummary days={days} grid={partGrid(wByDate, days)} cardio={cardioWeek(wByDate, days)} />
              {day.length > 0 ? day.map(d => <WorkoutCard key={d.docId} data={d} highlight {...cardProgress(d)} onCardClick={() => {}} />) : (
                <div className="px-4"><div className="rounded-[20px] border border-dashed border-[#dee2e6] px-4 py-3 flex items-center justify-between gap-3">
                  <p className="font-pretendard font-medium text-[14px] leading-5 text-[#868e96] tracking-[-0.35px]">오늘은 아직 운동 기록이 없어요</p>
                  <span className="font-pretendard font-bold text-[13px] text-brand tracking-[-0.325px]">기록하기</span>
                </div></div>
              )}
              <div className="px-5 pt-1.5 flex items-center gap-2"><span className="font-pretendard font-semibold text-[12px] leading-[14px] text-[#868e96] tracking-[-0.3px]">이전 기록</span><span className="flex-1 h-px bg-[#e9ecef]" /></div>
              {prev.map(d => <WorkoutCard key={d.docId} data={d} {...cardProgress(d)} onCardClick={() => {}} />)}
            </>
          )) : (
            <>
              <TodayDietCard intake={{ totals: dd.totals, target: params.has('notarget') ? 0 : 2100, isToday: true, week: days.map(d => ({ ...d, kcal: (dByDate.get(d.key) || []).reduce((s, l) => s + l.kcal, 0) })), onClick: () => {} }} meals={{ meals: dd.meals, editable: true, onOpen: () => {} }} />
            </>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
