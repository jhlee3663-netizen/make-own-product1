/* 개발용 미리보기: 가짜 기록으로 분석 탭 카드와 새 하단 네비를 그린다. 운영 빌드에 포함되지 않는다. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import BottomNav from '../src/components/common/BottomNav';
import AnalysisTabsView from '../src/components/analysis/AnalysisTabs';
import { computeDietTrend, computeMaintenance, computeStrength, computeWeeklyWorkout, computeWeekSummary, computeWeightTrend } from '../src/lib/analysis';
import { parseVolume } from '../src/utils/utils';
import { localDateKey } from '../src/lib/bodyLogs';

const DAY = 86400000;
const now = Date.now();
const ts = daysAgo => ({ seconds: Math.floor((now - daysAgo * DAY) / 1000) });
const noise = i => Math.sin(i * 12.9898) * 0.35;

const weights = Array.from({ length: 40 }, (_, i) => i)
  .filter(i => i % 6 !== 4)
  .map(i => ({ date: localDateKey(new Date(now - i * DAY)), weightKg: Math.round((72.1 + i * 0.045 + noise(i)) * 10) / 10 }));

const dietLogs = Array.from({ length: 28 }, (_, i) => i)
  .filter(i => i % 5 !== 3)
  .map(i => ({ type: 'diet', timestamp: ts(i), kcal: 2100 + Math.round(noise(i) * 400), protein: 112 + Math.round(noise(i + 3) * 40) }));

const set = (w, r) => `• 세트 1: ${w}kg ${r}회\n• 세트 2: ${w}kg ${r}회\n• 세트 3: ${w}kg ${r - 1}회`;
const workoutLogs = [
  [49, 60, 8, 90, 5], [42, 62.5, 8, 95, 5], [35, 65, 7, 100, 5], [28, 65, 8, 100, 5],
  [21, 65, 8, 102.5, 5], [14, 65, 8, 105, 5], [7, 65, 7, 107.5, 5], [1, 65, 8, 110, 5],
].flatMap(([d, bench, br, squat, sr]) => [
  { type: 'workout', timestamp: ts(d), sections: [
    { part: '가슴', items: [{ title: '벤치프레스', body: set(bench, br) }, { title: '인클라인 덤벨프레스', body: set(22 + (49 - d) / 14, 10) }] },
    { part: '어깨', items: [{ title: '오버헤드프레스', body: set(37.5 + (d < 20 ? 2.5 : 0), 8) }] },
  ] },
  { type: 'workout', timestamp: ts(d + 2), sections: [
    { part: '하체', items: [{ title: '스쿼트', body: set(squat, sr) }] },
    { part: '등', items: [{ title: '바벨로우', body: set(60 + (49 - d) / 7, 8) }] },
  ] },
]);

workoutLogs.forEach((log) => { log.totalVolume = parseVolume(log.sections, 72); });

const report = {
  headline: '스쿼트는 신기록, 벤치프레스는 4주째 제자리예요.',
  good: '스쿼트가 110kg × 5회로 신기록이에요. 하체 볼륨도 지난주보다 6% 늘었어요.',
  improve: '벤치프레스가 4주째 65kg에 머물러 있어요. 세트 구성을 바꿔볼 때예요.',
  suggestion: '다음 주엔 벤치를 60kg × 10회 4세트로 낮춰 볼륨을 먼저 채워보세요.',
};

const params = new URLSearchParams(location.search);

function Frame({ children }) {
  return <div style={{ width: 402, height: Number(params.get('h')) || 874, position: 'relative', overflow: 'hidden', background: '#f8f9fa', margin: '0 auto' }}>{children}</div>;
}

function App() {
  const [navTab, setNavTab] = useState('analysis');
  const empty = params.has('empty');
  const w = empty ? weights.slice(0, 1) : params.has('shortweight') ? weights.slice(0, 6) : weights;
  const d = empty ? dietLogs.slice(0, 1) : dietLogs;
  const wo = empty ? [] : workoutLogs;
  const model = {
    trend: computeWeightTrend(w, 70),
    maintenance: computeMaintenance(d, empty ? [] : w),
    strength: computeStrength(wo, 72),
    diet: computeDietTrend(d, 72),
    weekly: computeWeeklyWorkout(wo),
    week: computeWeekSummary(wo, d),
  };
  return (
    <Frame>
      <AnalysisTabsView
        model={model}
        report={report}
        reportStatus={empty ? 'empty' : 'ready'}
        initialTab={params.get('tab') || 'summary'}
        onAskCoach={() => {}}
        onRecord={() => {}}
      />
      <BottomNav activeId={navTab} onChange={setNavTab} onMemo={() => {}} />
    </Frame>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if (params.has('memo')) {
  setTimeout(() => document.querySelector('[aria-label="기록 추가"]')?.click(), 300);
}
if (params.has('open')) {
  setTimeout(() => [...document.querySelectorAll('button')].find(b => b.textContent === '자세히 보기')?.click(), 300);
}
if (params.has('menu')) {
  setTimeout(() => document.querySelector('[aria-label="더보기"]')?.click(), 300);
}
if (params.has('guide')) {
  setTimeout(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('숫자 계산 기준'))?.click(), 700);
}
