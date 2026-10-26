/* 운동 기록의 성장 판정: 종목별 탑세트 추정 1RM과 유효 세트.
   - 탑세트: 그 종목에서 추정 1RM(Epley: 무게 × (1 + 횟수 ÷ 30))이 가장 높은 세트. 16회 이상은 공식이 부정확해 뺀다.
   - 워밍업: 탑세트 무게의 60% 미만이거나 줄에 "웜업/워밍업"이 적힌 세트.
   - 유효 세트: 워밍업이 아니고, 목표 횟수(= 탑세트 횟수)보다 2회 이상 적지 않은 세트.
     맨몸 종목(풀업·딥스 등)은 무게가 없으니 최고 횟수를 목표로 같은 기준을 쓴다. 1RM·과부하 판정에는 넣지 않는다.
   - 과부하 판정: 같은 종목의 직전 세션 탑세트와 비교해 ±1% 안이면 유지. 올린 종목 수 ≥ 떨어진 종목 수면 성공.
   화면·네트워크와 무관한 순수 함수만 둔다. */
import { BODYWEIGHT_BASES } from '../utils/exerciseData.js';

const MAX_REPS = 15;
const WARMUP_RATIO = 0.6;
const SAME_TOLERANCE = 0.01;
const LBS_TO_KG = 0.453592;
const EMPTY = [];

const isBodyweight = title => BODYWEIGHT_BASES.has(String(title || '').replace(/^(어시스티드|가중)\s*/u, '').trim());

const SET_RE = /(\d+(?:\.\d+)?)\s*(kg|lbs?|파운드)\s*(?:(\d+)\s*회|[x×]\s*(\d+))\s*(?:(\d+)\s*세트|[x×]\s*(\d+))?/gi;

export const exerciseKey = name => String(name || '').replace(/\s+/g, '').toLowerCase();

const round1 = v => Math.round(v * 10) / 10;
export const epley = (weight, reps) => weight * (1 + reps / 30);

/* 한 종목 본문을 세트 목록으로 펼친다. "60kg 10회 3세트"는 세트 3개가 된다. */
export function parseSets(body) {
  const sets = [];
  for (const line of String(body || '').split('\n')) {
    const warmupMark = /웜업|워밍업|warm\s*-?up/i.test(line);
    const matches = [...line.matchAll(SET_RE)];
    // "60kg 10회, 3세트"처럼 세트 수가 떨어져 적혀 있으면 그 줄의 세트 하나에만 적용한다
    const looseSets = matches.length === 1 ? parseInt(line.match(/(\d+)\s*세트/)?.[1] || '0', 10) : 0;
    for (const m of matches) {
      const raw = parseFloat(m[1]);
      const weight = /kg/i.test(m[2]) ? raw : raw * LBS_TO_KG;
      const reps = parseInt(m[3] || m[4], 10);
      const count = parseInt(m[5] || (m[3] ? m[6] : '') || '0', 10) || looseSets || 1;
      if (!(weight > 0) || !(reps > 0)) continue;
      for (let i = 0; i < count; i += 1) sets.push({ weight, reps, warmupMark });
    }
  }
  return sets;
}

/* 무게 없이 횟수만 적힌 세트 목록. "• 세트 3: 5회", "5회씩 5세트" 모두 읽는다. 무게가 적힌 줄은 parseSets 몫이다. */
export function parseRepSets(body) {
  const sets = [];
  for (const line of String(body || '').split('\n')) {
    if (/\d\s*(kg|lbs?|파운드)/i.test(line)) continue;
    const reps = parseInt(line.match(/(\d+)\s*(?:회|개|reps?)/i)?.[1] || '0', 10);
    if (!(reps > 0)) continue;
    const count = parseInt(line.match(/(\d+)\s*세트/)?.[1] || '1', 10) || 1;
    const warmupMark = /웜업|워밍업|warm\s*-?up/i.test(line);
    for (let i = 0; i < count; i += 1) sets.push({ reps, warmupMark });
  }
  return sets;
}

/* 맨몸 종목의 유효 세트 수. 맨몸 종목이 아니거나 무게가 적혀 있으면(가중) 0 — 그때는 analyzeExercise가 센다. */
export function bodyweightEffectiveSets(title, body) {
  if (!isBodyweight(title) || parseSets(body).length) return 0;
  const sets = parseRepSets(body).filter(s => !s.warmupMark);
  const target = Math.max(0, ...sets.map(s => s.reps));
  return sets.filter(s => s.reps >= target - 1).length;
}

/* 한 종목의 탑세트와 유효 세트 수. 무게가 적힌 세트가 없으면(맨몸·유산소) null. */
export function analyzeExercise(title, body) {
  if (/어시스티드/.test(title || '')) return null;
  const sets = parseSets(body);
  let top = null;
  for (const s of sets) {
    if (s.reps > MAX_REPS) continue;
    const e1rm = epley(s.weight, s.reps);
    if (!top || e1rm > top.e1rm) top = { weight: s.weight, reps: s.reps, e1rm };
  }
  if (!top) return null;
  const target = top.reps;
  const effectiveSets = sets.filter(s => !s.warmupMark && s.weight >= top.weight * WARMUP_RATIO && s.reps >= target - 1).length;
  return { name: String(title || '').trim(), key: exerciseKey(title), top, target, effectiveSets };
}

/* 한 세션(sections)의 종목별 분석. 같은 기록을 여러 카드에서 비교하므로 sections 배열 단위로 기억해 둔다. */
const sessionCache = new WeakMap();
export function analyzeSession(sections = []) {
  if (sessionCache.has(sections)) return sessionCache.get(sections);
  const result = analyzeSessionUncached(sections);
  if (sections && typeof sections === 'object') sessionCache.set(sections, result);
  return result;
}

function analyzeSessionUncached(sections = []) {
  const exercises = [];
  let bodyweightSets = 0;
  sections.forEach((section) => {
    if (section.part === '유산소') return;
    (section.items || []).forEach((item) => {
      bodyweightSets += bodyweightEffectiveSets(item.title, item.body);
      const result = analyzeExercise(item.title, item.body);
      if (!result || !result.key) return;
      const same = exercises.find(e => e.key === result.key);
      if (!same) exercises.push(result);
      else {
        same.effectiveSets += result.effectiveSets;
        if (result.top.e1rm > same.top.e1rm) { same.top = result.top; same.target = result.target; }
      }
    });
  });
  return { exercises, effectiveSets: bodyweightSets + exercises.reduce((sum, e) => sum + e.effectiveSets, 0) };
}

/* 종목마다 직전 세션(olderLogs는 최신순)의 같은 종목 탑세트와 비교한다. */
export function compareWithPrevious(sections, olderLogs = []) {
  const session = analyzeSession(sections);
  const previousTop = (key) => {
    for (const log of olderLogs) {
      const hit = analyzeSession(log.sections || EMPTY).exercises.find(e => e.key === key);
      if (hit) return hit.top;
    }
    return null;
  };
  const exercises = session.exercises.map((e) => {
    const prev = previousTop(e.key);
    if (!prev) return { ...e, prev: null, delta: null, status: 'new' };
    const delta = e.top.e1rm - prev.e1rm;
    const ratio = delta / prev.e1rm;
    const status = ratio > SAME_TOLERANCE ? 'up' : ratio < -SAME_TOLERANCE ? 'down' : 'same';
    return { ...e, prev, delta, status };
  });
  const count = status => exercises.filter(e => e.status === status).length;
  return { exercises, effectiveSets: session.effectiveSets, up: count('up'), same: count('same'), down: count('down'), compared: exercises.length - count('new') };
}

/* 홈 카드 배지: 'success' | 'meh'. 디로딩·비교할 종목 없음·무게 기록 없음은 성공으로 둔다. */
export function gradeSession(result, { deload = false } = {}) {
  if (deload || !result || result.compared === 0) return 'success';
  return result.up >= result.down ? 'success' : 'meh';
}

const formatKg = v => `${round1(v)}kg`;
const signed = v => `${v >= 0 ? '+' : '−'}${round1(Math.abs(v))}`;

/* 카드·토스트에 쓰는 한 줄 요약.
   예) "벤치프레스 1RM 96kg (+2.1) · 갱신 2 · 유효 12세트" / "첫 기록 · 스쿼트 100kg×5 · 유효 9세트" */
export function buildStrengthMessage(result, { deload = false } = {}) {
  if (!result || result.exercises.length === 0) return '';
  const sets = `유효 ${result.effectiveSets}세트`;
  const compared = result.exercises.filter(e => e.status !== 'new');
  if (compared.length === 0) {
    const best = [...result.exercises].sort((a, b) => b.top.e1rm - a.top.e1rm)[0];
    return `첫 기록 · ${best.name} ${round1(best.top.weight)}kg×${best.top.reps} · ${sets}`;
  }
  const headline = [...compared].sort((a, b) => b.delta - a.delta)[0];
  const lift = `${headline.name} 1RM ${formatKg(headline.top.e1rm)} (${signed(headline.delta)})`;
  if (deload) return `디로딩 · ${lift} · ${sets}`;
  const tally = result.up > 0 ? `갱신 ${result.up}` : result.down > 0 ? `하락 ${result.down}` : '유지';
  return `${lift} · ${tally} · ${sets}`;
}

/* AI 한줄평 요청에 넣을 정보 */
export function describeForPrompt(result) {
  if (!result || result.exercises.length === 0) return '무게 기록 없음';
  const lines = result.exercises.map((e) => {
    const top = `${e.name} 탑세트 ${round1(e.top.weight)}kg×${e.top.reps} (추정 1RM ${formatKg(e.top.e1rm)})`;
    return e.status === 'new' ? `${top}, 첫 기록` : `${top}, 직전 대비 ${signed(e.delta)}kg`;
  });
  return `${lines.join('; ')}. 유효 세트 ${result.effectiveSets}개, 갱신 ${result.up}·유지 ${result.same}·하락 ${result.down}`;
}
