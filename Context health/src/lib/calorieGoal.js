import { localDateKey } from './bodyLogs';
import { logDateKey } from './homeSummary';

/* 목표 칼로리는 "바꾼 날부터" 적용된다.
   - 기록된 식단 문서에는 그날의 목표가 goal 필드로 박혀 있다(스냅샷). 그게 1순위.
   - 문서에 없으면 프로필의 변경 이력(targetKcalHistory)에서 그 날짜에 쓰던 값을 찾는다.
   이력 형태: [{ from: 'YYYY-MM-DD', kcal: 1850 }, ...] (from 오름차순) */

function historyOf(profile) {
  const raw = Array.isArray(profile?.targetKcalHistory) ? profile.targetKcalHistory : [];
  return raw
    .filter(entry => typeof entry?.from === 'string' && Number(entry.kcal) > 0)
    .map(entry => ({ from: entry.from, kcal: Number(entry.kcal) }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function goalKcalForDate(profile, dateKey) {
  const history = historyOf(profile);
  if (history.length === 0) return Number(profile?.targetKcal) || 0;
  const applied = history.filter(entry => entry.from <= dateKey).pop();
  // 이력보다 더 과거인 날짜는 알고 있는 가장 오래된 목표로 본다.
  return (applied || history[0]).kcal;
}

/* 식단 기록 하나의 기준 목표. 문서에 박힌 값 > 그 날짜의 이력 값 */
export function logGoalKcal(log, profile) {
  const stored = Number(log?.goal) || 0;
  if (stored) return stored;
  return goalKcalForDate(profile, log ? logDateKey(log) : localDateKey());
}

/* 목표를 바꿀 때 이력에 한 줄 더한다. 같은 날 여러 번 바꾸면 그 날 줄만 덮어쓴다(과거는 그대로). */
export function withTargetKcalHistory(prevProfile, nextProfile, effectiveDate = localDateKey()) {
  const next = Number(nextProfile?.targetKcal) || 0;
  const history = historyOf(prevProfile);
  const prev = Number(prevProfile?.targetKcal) || 0;
  if (!next) return { ...nextProfile, targetKcalHistory: history };
  if (next === prev && history.length > 0) return { ...nextProfile, targetKcalHistory: history };
  // 이력이 아직 없는 계정: 지금까지 쓰던 값이 과거 전체에 적용되고 있었다고 본다.
  const seeded = history.length === 0 && prev && prev !== next
    ? [{ from: '1970-01-01', kcal: prev }]
    : history;
  const merged = [...seeded.filter(entry => entry.from !== effectiveDate), { from: effectiveDate, kcal: next }]
    .sort((a, b) => a.from.localeCompare(b.from));
  return { ...nextProfile, targetKcalHistory: merged };
}
