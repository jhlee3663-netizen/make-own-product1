import { localDateKey } from './bodyLogs';

/* 홈 화면(날짜 중심)에 필요한 계산. 화면과 분리해 둔 순수 함수들이다. */

const DAY_MS = 86400000;
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function keyToDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(dateKey, days) {
  return localDateKey(new Date(keyToDate(dateKey).getTime() + days * DAY_MS + 3600000)); // 서머타임 경계 여유
}

/* 기록의 날짜. 방금 저장해 서버 시간이 아직 없으면 오늘로 본다. */
export function logDateKey(log) {
  const seconds = log?.timestamp?.seconds;
  return localDateKey(seconds ? new Date(seconds * 1000) : new Date());
}

/* dateKey가 속한 주의 월~일 */
export function weekOf(dateKey) {
  const date = keyToDate(dateKey);
  const monday = shiftKey(dateKey, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const key = shiftKey(monday, i);
    const d = keyToDate(key);
    return { key, day: d.getDate(), weekday: WEEKDAYS[d.getDay()] };
  });
}

/* endKey까지의 최근 n일 (오래된 날부터) */
export function lastDays(endKey, count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const key = shiftKey(endKey, i - (count - 1));
    return { key, day: keyToDate(key).getDate() };
  });
}

export function headerLabel(dateKey) {
  const d = keyToDate(dateKey);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}`;
}

export function groupByDate(logs) {
  const map = new Map();
  logs.forEach((log) => {
    const key = logDateKey(log);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(log);
  });
  return map;
}

/* 운동 부위를 홈 요약의 다섯 줄로 묶는다. 유산소·코어·전신은 여기 넣지 않는다. */
export const PART_ROWS = ['가슴', '등', '하체', '어깨', '팔'];
const PART_RULES = [
  ['가슴', /가슴|흉/],
  ['등', /등|광배|승모/],
  ['하체', /하체|다리|대퇴|둔근|엉덩이|햄스트링|종아리/],
  ['어깨', /어깨|삼각/],
  ['팔', /팔|이두|삼두|전완/],
];

export function partsOfLog(log) {
  const names = [
    ...(log.sections || []).map(section => section.part),
    ...String(log.title || '').split(/[,·/]/),
  ].map(name => String(name || '').trim()).filter(Boolean);
  const found = new Set();
  names.forEach((name) => {
    PART_RULES.forEach(([row, pattern]) => { if (pattern.test(name)) found.add(row); });
  });
  return found;
}

/* 최근 7일 동안 어느 날 어느 부위를 했는지 */
export function partGrid(workoutByDate, days) {
  return PART_ROWS.map(part => ({
    part,
    done: days.map(({ key }) => (workoutByDate.get(key) || []).some(log => partsOfLog(log).has(part))),
  }));
}

/* 최근 7일 유산소 시간(분) */
export function cardioWeek(workoutByDate, days) {
  const minutes = days.map(({ key }) => (workoutByDate.get(key) || []).reduce((sum, log) => sum + Number(log.cardioMinutes || 0), 0));
  return {
    minutes,
    total: minutes.reduce((a, b) => a + b, 0),
    sessions: minutes.filter(v => v > 0).length,
  };
}

/* 하루치 식단 합계와 끼니별 내용 (같은 날 기록이 여러 개면 합친다) */
export function dietDay(logs = []) {
  const totals = logs.reduce((acc, log) => ({
    kcal: acc.kcal + Number(log.kcal || 0),
    carb: acc.carb + Number(log.carb || 0),
    protein: acc.protein + Number(log.protein || 0),
    fat: acc.fat + Number(log.fat || 0),
  }), { kcal: 0, carb: 0, protein: 0, fat: 0 });
  const meals = new Map();
  logs.forEach(log => (log.sections || []).forEach((section) => {
    const items = (section.items || []).filter(item => String(item.name || '').trim());
    if (items.length === 0) return;
    const meal = meals.get(section.id) || { kcal: 0, names: [] };
    items.forEach((item) => { meal.kcal += Number(item.kcal || 0); meal.names.push(String(item.name).trim()); });
    meals.set(section.id, meal);
  }));
  return { totals, meals };
}

/* 목표 칼로리의 ±10%를 적정 범위로 본다 */
export function kcalRange(target) {
  if (!target) return null;
  const round = value => Math.round(value / 10) * 10;
  return { min: round(target * 0.9), max: round(target * 1.1) };
}

/* 섭취 칼로리 막대의 눈금 끝. 그날 먹은 양과 상관없이 목표 기준으로 고정해, 카드끼리 막대 길이를 비교할 수 있게 한다. */
export function kcalScale(target) {
  return target ? Math.ceil((target * 1.45) / 100) * 100 : 3000;
}

/* 그날 섭취량이 어땠는지 한마디로. 범위 숫자를 반복하는 대신 결과를 보여주는 데 쓴다.
   - 적정인지 아닌지(색)는 적정 범위(목표 ±10%)로 가른다.
   - 모자라거나 넘친 양(숫자)은 사용자가 정한 목표 칼로리를 기준으로 센다. 범위의 끝이 아니다.
   - 아직 진행 중인 오늘은 모자란 양을 "부족"이 아니라 "남음"으로 말한다. */
export const KCAL_OVER_COLOR = '#FF7043';
export function kcalVerdict(kcal, target, { inProgress = false } = {}) {
  const range = kcalRange(target);
  if (!range) return null;
  const amount = value => Math.round(value).toLocaleString();
  if (kcal < range.min) return { tone: 'under', text: `${amount(target - kcal)} ${inProgress ? '남음' : '부족'}` };
  if (kcal > range.max) return { tone: 'over', text: `${amount(kcal - target)} 초과` };
  return { tone: 'ok', text: '적정' };
}

/* 막대 색: 평소엔 보라, 적정 범위를 넘긴 날만 붉은 주황. 둘 다 옅은 색에서 진한 색으로 이어진다. */
export function kcalBarGradient(tone) {
  return tone === 'over'
    ? 'linear-gradient(90deg, rgba(255,112,67,0.3), #FF7043)'
    : 'linear-gradient(90deg, rgba(113,113,255,0.3), #7171FF)';
}
export const kcalVerdictColor = tone => (tone === 'over' ? KCAL_OVER_COLOR : tone === 'ok' ? '#7171FF' : '#868e96');
