import { parseVolume } from '../utils/utils';
import { localDateKey } from './bodyLogs';

/* 분석 탭 계산. 화면·네트워크와 무관한 순수 함수만 둔다. */

const DAY_MS = 24 * 60 * 60 * 1000;
const KCAL_PER_KG = 7700;

function dayIndex(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function logDateKey(log) {
  return log.timestamp?.seconds ? localDateKey(new Date(log.timestamp.seconds * 1000)) : null;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* 최소제곱 기울기 (y / day) */
function slope(points) {
  const mx = mean(points.map(p => p.x));
  const my = mean(points.map(p => p.y));
  const denom = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (denom === 0) return 0;
  return points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denom;
}

function weightSlope(points, today, windowDays, minPoints, minSpan) {
  const recent = points.filter(p => p.x > today - windowDays);
  if (recent.length < minPoints) return null;
  if (recent[recent.length - 1].x - recent[0].x < minSpan) return null;
  return slope(recent);
}

/* ── 공복 체중 추이와 목표 도달 예상 ── */
export function computeWeightTrend(weights, goalWeight, todayKey = localDateKey()) {
  const today = dayIndex(todayKey);
  const points = weights
    .map(w => ({ x: dayIndex(w.date), y: Number(w.weightKg), date: w.date }))
    .filter(p => Number.isFinite(p.y) && p.x <= today && p.x > today - 56)
    .sort((a, b) => a.x - b.x);

  if (points.length < 3) return { ready: false, need: 3 - points.length };

  const series = points.map(p => ({
    ...p,
    avg: mean(points.filter(q => q.x <= p.x && q.x > p.x - 7).map(q => q.y)),
  }));
  const last = series[series.length - 1];
  const prevWeek = points.filter(p => p.x <= last.x - 7 && p.x > last.x - 14).map(p => p.y);
  const weeklyDelta = prevWeek.length ? last.avg - mean(prevWeek) : null;

  const perDay = weightSlope(points, today, 28, 5, 10);
  const ratePerWeek = perDay === null ? null : perDay * 7;

  const goal = Number(goalWeight) || null;
  let eta = null; // { status: 'reached' | 'on-track' | 'away' | 'flat', date? }
  if (goal) {
    const gap = goal - last.avg;
    if (Math.abs(gap) < 0.3) eta = { status: 'reached' };
    else if (ratePerWeek === null) eta = null;
    else if (Math.abs(ratePerWeek) < 0.05) eta = { status: 'flat' };
    else if (Math.sign(gap) !== Math.sign(ratePerWeek)) eta = { status: 'away' };
    else {
      const days = Math.ceil(gap / perDay);
      eta = days <= 365
        ? { status: 'on-track', date: localDateKey(new Date(Date.now() + days * DAY_MS)), days }
        : { status: 'flat' };
    }
  }

  return { ready: true, series, current: last.avg, latest: last.y, weeklyDelta, ratePerWeek, goal, eta };
}

/* ── 실측 유지 칼로리: 평균 섭취 − (체중 변화 × 7700kcal/kg) ── */
export function computeMaintenance(dietLogs, weights, todayKey = localDateKey()) {
  const WINDOW = 28;
  const MIN_DIET_DAYS = 10;
  const today = dayIndex(todayKey);

  const kcalByDay = new Map();
  dietLogs.forEach((log) => {
    const key = logDateKey(log);
    if (!key) return;
    const x = dayIndex(key);
    if (x > today || x <= today - WINDOW) return;
    kcalByDay.set(x, (kcalByDay.get(x) || 0) + Number(log.kcal || 0));
  });
  const loggedDays = [...kcalByDay.values()].filter(v => v > 0);

  const points = weights
    .map(w => ({ x: dayIndex(w.date), y: Number(w.weightKg) }))
    .filter(p => Number.isFinite(p.y) && p.x <= today)
    .sort((a, b) => a.x - b.x);
  const perDay = weightSlope(points, today, WINDOW, 5, 14);

  if (loggedDays.length < MIN_DIET_DAYS || perDay === null) {
    return {
      ready: false,
      dietDays: loggedDays.length,
      needDietDays: Math.max(0, MIN_DIET_DAYS - loggedDays.length),
      needWeight: perDay === null,
    };
  }

  const avgIntake = mean(loggedDays);
  const tdee = avgIntake - perDay * KCAL_PER_KG;
  if (tdee < 1000 || tdee > 5000) {
    return { ready: false, dietDays: loggedDays.length, needDietDays: 0, needWeight: false, unreliable: true };
  }

  return {
    ready: true,
    tdee: Math.round(tdee / 10) * 10,
    avgIntake: Math.round(avgIntake / 10) * 10,
    ratePerWeek: perDay * 7,
    dietDays: loggedDays.length,
  };
}

/* ── 운동 성장: 종목별 추정 1RM, 정체, 신기록, 부위 균형 ── */

const SET_PATTERN = /(\d+(?:\.\d+)?)\s*kg\s*(?:(\d+)\s*회|[x×]\s*(\d+))/gi;

function bestSet(body) {
  let best = null;
  for (const m of String(body || '').matchAll(SET_PATTERN)) {
    const weight = parseFloat(m[1]);
    const reps = parseInt(m[2] || m[3], 10);
    if (!(weight > 0) || !(reps > 0) || reps > 15) continue;
    const e1rm = weight * (1 + reps / 30); // Epley
    if (!best || e1rm > best.e1rm) best = { weight, reps, e1rm };
  }
  return best;
}

function exerciseKey(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function computeStrength(workoutLogs, bodyWeight = 0, todayKey = localDateKey()) {
  const today = dayIndex(todayKey);
  const byExercise = new Map();
  const partVolume = new Map();

  workoutLogs.forEach((log) => {
    const key = logDateKey(log);
    if (!key) return;
    const x = dayIndex(key);
    (log.sections || []).forEach((section) => {
      if (x > today - 28 && section.part && section.part !== '유산소') {
        const volume = parseVolume([section], bodyWeight);
        if (volume > 0) partVolume.set(section.part, (partVolume.get(section.part) || 0) + volume);
      }
      (section.items || []).forEach((item) => {
        if (/어시스티드/.test(item.title || '')) return;
        const set = bestSet(item.body);
        const id = exerciseKey(item.title);
        if (!set || !id) return;
        if (!byExercise.has(id)) byExercise.set(id, { name: String(item.title).trim(), days: new Map() });
        const days = byExercise.get(id).days;
        const prev = days.get(x);
        if (!prev || set.e1rm > prev.e1rm) days.set(x, { ...set, x, date: key });
      });
    });
  });

  const exercises = [];
  const records = [];
  byExercise.forEach(({ name, days }) => {
    const sessions = [...days.values()].sort((a, b) => a.x - b.x);
    const recent = sessions.filter(s => s.x > today - 56);
    if (recent.length < 2) return;

    let best = sessions[0];
    let sessionsSinceBest = 0;
    sessions.slice(1).forEach((s) => {
      if (s.e1rm > best.e1rm * 1.005) {
        if (s.x > today - 30) records.push({ name, date: s.date, x: s.x, weight: s.weight, reps: s.reps, gain: s.e1rm - best.e1rm });
        best = s;
        sessionsSinceBest = 0;
      } else {
        sessionsSinceBest += 1;
      }
    });

    const last = sessions[sessions.length - 1];
    const stallDays = last.x - best.x;
    const stalled = sessionsSinceBest >= 3 && stallDays >= 21;

    exercises.push({
      name,
      sessions: recent.length,
      e1rm: last.e1rm,
      top: { weight: last.weight, reps: last.reps },
      delta: last.e1rm - recent[0].e1rm,
      series: recent.map(r => r.e1rm),
      stalledWeeks: stalled ? Math.floor(stallDays / 7) : 0,
      lastX: last.x,
    });
  });

  exercises.sort((a, b) => b.sessions - a.sessions || b.lastX - a.lastX);

  // 종목당 가장 최근 신기록 하나만
  const latestRecord = new Map();
  records.forEach((r) => { if (!latestRecord.has(r.name) || latestRecord.get(r.name).x < r.x) latestRecord.set(r.name, r); });

  const totalPart = [...partVolume.values()].reduce((a, b) => a + b, 0);
  const parts = [...partVolume.entries()]
    .map(([part, volume]) => ({ part, volume, share: totalPart ? volume / totalPart : 0 }))
    .sort((a, b) => b.volume - a.volume);

  return {
    ready: exercises.length > 0 || parts.length > 0,
    exercises: exercises.slice(0, 5),
    stalled: exercises.filter(e => e.stalledWeeks > 0),
    records: [...latestRecord.values()].sort((a, b) => b.x - a.x).slice(0, 3),
    parts,
  };
}

/* ── 주간 요약 (AI 리포트 입력) ── */
export function computeWeekSummary(workoutLogs, dietLogs, todayKey = localDateKey()) {
  const today = dayIndex(todayKey);
  const inRange = (log, from, to) => {
    const key = logDateKey(log);
    if (!key) return false;
    const x = dayIndex(key);
    return x > today - from && x <= today - to;
  };
  const week = (from, to) => {
    const workouts = workoutLogs.filter(l => inRange(l, from, to));
    const dietDays = new Map();
    dietLogs.filter(l => inRange(l, from, to)).forEach((l) => {
      const key = logDateKey(l);
      const day = dietDays.get(key) || { kcal: 0, protein: 0 };
      day.kcal += Number(l.kcal || 0);
      day.protein += Number(l.protein || 0);
      dietDays.set(key, day);
    });
    const days = [...dietDays.values()].filter(d => d.kcal > 0);
    return {
      workoutDays: new Set(workouts.map(logDateKey)).size,
      volume: workouts.reduce((s, l) => s + (l.totalVolume || 0), 0),
      dietDays: days.length,
      avgKcal: days.length ? Math.round(mean(days.map(d => d.kcal))) : null,
      avgProtein: days.length ? Math.round(mean(days.map(d => d.protein))) : null,
    };
  };
  return { thisWeek: week(7, 0), lastWeek: week(14, 7) };
}

/* 월요일 시작 주의 키. AI 리포트를 주 1회만 만들기 위한 캐시 키. */
export function weekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return localDateKey(d);
}

/* ── 식단 추이: 최근 N일 하루 섭취량과 단백질 ── */
export function computeDietTrend(dietLogs, bodyWeight = 0, days = 28, todayKey = localDateKey()) {
  const today = dayIndex(todayKey);
  const byDay = new Map();
  dietLogs.forEach((log) => {
    const key = logDateKey(log);
    if (!key) return;
    const x = dayIndex(key);
    if (x > today || x <= today - days) return;
    const day = byDay.get(x) || { x, date: key, kcal: 0, protein: 0 };
    day.kcal += Number(log.kcal || 0);
    day.protein += Number(log.protein || 0);
    byDay.set(x, day);
  });
  const logged = [...byDay.values()].filter(d => d.kcal > 0).sort((a, b) => a.x - b.x);
  if (logged.length < 3) return { ready: false, need: 3 - logged.length };

  const weight = Number(bodyWeight) || 0;
  const proteinRange = weight ? { min: Math.round(weight * 1.6), max: Math.round(weight * 2.2) } : null;
  const avgProtein = Math.round(mean(logged.map(d => d.protein)));
  return {
    ready: true,
    from: today - days + 1,
    to: today,
    days: logged,
    avgKcal: Math.round(mean(logged.map(d => d.kcal)) / 10) * 10,
    avgProtein,
    proteinRange,
    proteinStatus: !proteinRange ? null : avgProtein < proteinRange.min ? 'low' : avgProtein > proteinRange.max ? 'high' : 'ok',
    proteinHitDays: proteinRange ? logged.filter(d => d.protein >= proteinRange.min).length : null,
  };
}

/* ── 주간 운동량: 최근 N주 (월요일 시작) ── */
export function computeWeeklyWorkout(workoutLogs, weeks = 8, today = new Date()) {
  const monday = new Date(today);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  const thisMonday = dayIndex(localDateKey(monday));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = thisMonday - (weeks - 1 - i) * 7;
    const startDate = new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY_MS);
    return { start, label: `${startDate.getMonth() + 1}/${startDate.getDate()}`, volume: 0, days: new Set() };
  });
  workoutLogs.forEach((log) => {
    const key = logDateKey(log);
    if (!key) return;
    const index = Math.floor((dayIndex(key) - buckets[0].start) / 7);
    if (index < 0 || index >= weeks) return;
    buckets[index].volume += log.totalVolume || 0;
    buckets[index].days.add(key);
  });
  return buckets.map(b => ({ label: b.label, volume: Math.round(b.volume), days: b.days.size }));
}
