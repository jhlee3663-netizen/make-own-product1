import { EXERCISES } from '../utils/exerciseData';
import { getUserStorage, setUserStorage } from './userStorage';

/* 사용자가 직접 적은 운동 종목 이름 (예: "케이블 푸쉬다운 (로프)").
   기본 목록에 없는 이름만 기억해 두었다가 다음 입력 때 추천 칩으로 보여준다. */
const KEY = 'workout_custom_exercises';
const MAX = 80;

const normalize = name => String(name || '').toLowerCase().replace(/\s/g, '');
const BUILT_IN = new Set(EXERCISES.map(normalize));

export function loadCustomExercises(uid) {
  try {
    const saved = JSON.parse(getUserStorage(uid, KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(name => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

/* names를 기억한다. 기본은 방금 적은 이름을 맨 앞에, append면 기존 목록 뒤에 붙인다. */
export function rememberCustomExercises(uid, names, { append = false } = {}) {
  const current = loadCustomExercises(uid);
  const seen = new Set();
  const merged = [];
  (append ? [...current, ...names] : [...names, ...current]).forEach((name) => {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    const key = normalize(clean);
    if (!key || clean.length > 40 || BUILT_IN.has(key) || seen.has(key)) return;
    seen.add(key);
    merged.push(clean);
  });
  const next = merged.slice(0, MAX);
  if (uid) setUserStorage(uid, KEY, JSON.stringify(next));
  return next;
}
