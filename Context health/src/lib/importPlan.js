import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { analyzeExercise, exerciseKey } from './strengthProgress';

/* 피드에서 루틴·기록을 "가져오기" 할 때의 무게 맞추기와 메모·식단 만들기.
   세트·횟수는 원래 루틴 그대로, 무게만 내 기록에 맞춘다 (Figma 08). */

const KST = 9 * 3600 * 1000;
const kstDate = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
const roundPlate = (kg) => Math.round(kg / 2.5) * 2.5;

export async function loadMyRecentLogs(uid, type = 'workout', max = 80) {
  const snap = await getDocs(query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), limit(max)));
  return snap.docs
    .map((d) => ({ docId: d.id, ...d.data() }))
    .filter((log) => log.type === type && !log.deletedAt);
}

/* 종목별 가장 최근 탑세트 { weight, reps } */
export function lastTopByExercise(logs) {
  const map = new Map();
  logs.forEach((log) => {
    (log.sections || []).forEach((section) => (section.items || []).forEach((item) => {
      const key = exerciseKey(item.title);
      if (!key || map.has(key)) return;
      const r = analyzeExercise(item.title, item.body);
      if (r?.top) map.set(key, { weight: r.top.weight, reps: r.top.reps });
    }));
  });
  return map;
}

/* 비율 추정에 쓸 기준 종목: 둘 다 기록이 있는 종목 중 무거운 것 */
function scaleFrom(items, sourceWeights, mine) {
  let best = null;
  items.forEach((it) => {
    const key = exerciseKey(it.name);
    const src = sourceWeights[key];
    const my = mine.get(key);
    if (src > 0 && my?.weight > 0 && (!best || src > best.src)) best = { src, my: my.weight, name: it.name };
  });
  return best ? { ratio: best.my / best.src, name: best.name } : null;
}

/* 행마다 세 가지 무게를 미리 계산해 둔다. mode는 화면의 세그먼트(내 기록 기준 / 원래 무게 그대로 / 무게 비우기) */
export function buildWeightRows(items, { sourceWeights = {}, sourceName = '영상', mine }) {
  const scale = scaleFrom(items, sourceWeights, mine);
  return items.map((it, index) => {
    const key = exerciseKey(it.name);
    const my = mine.get(key) || null;
    const src = sourceWeights[key] ?? (it.weightKg || null);
    let suggested = null;
    let estimated = false;
    if (my?.weight) suggested = my.weight;
    else if (src && scale) { suggested = roundPlate(src * scale.ratio); estimated = true; }
    const parts = [];
    if (src) parts.push(`${sourceName} ${src}kg`);
    if (my?.weight) parts.push(`내 지난번 ${my.weight}kg`);
    else if (estimated) parts.push(`내 기록 없음 → ${scale.name.replace(/\s/g, '')} 비율로 추정`);
    else parts.push('내 기록 없음');
    return {
      id: index,
      name: it.name,
      part: it.part || '',
      sets: it.sets || 3,
      reps: it.reps || '10',
      at: it.at || null,
      note: it.note || '',
      sub: parts.join(' · '),
      mineWeight: suggested,
      sourceWeight: src,
      estimated,
    };
  });
}

export function rowWeight(row, mode, overrides) {
  if (overrides[row.id] !== undefined) return overrides[row.id];
  if (mode === 'empty') return null;
  if (mode === 'source') return row.sourceWeight;
  return row.mineWeight;
}

export function formatPlan(weight, row) {
  const reps = String(row.reps).replace(/회$/, '');
  return `${weight ? `${weight}kg × ` : ''}${reps} × ${row.sets}`;
}

/* 메모 sections 만들기: 부위가 있으면 부위별로 묶는다 */
export function rowsToSections(rows, mode, overrides, fallbackPart) {
  const groups = new Map();
  rows.forEach((row) => {
    const part = row.part || fallbackPart || '운동';
    if (!groups.has(part)) groups.set(part, []);
    const weight = rowWeight(row, mode, overrides);
    const repsText = /^\d+([–-]\d+)?$/.test(String(row.reps)) ? `${row.reps}회` : String(row.reps);
    const lines = [];
    for (let i = 1; i <= row.sets; i += 1) lines.push(`• 세트 ${i}: ${weight ? `${weight}kg ` : ''}${repsText}`);
    if (row.note) lines.push(`(${row.note})`);
    groups.get(part).push({ title: row.name, body: lines.join('\n') });
  });
  return [...groups.entries()].map(([part, items]) => ({ part, items }));
}

export function todayLogOf(logs) {
  const today = kstDate(Date.now());
  return logs.find((log) => kstDate(tsMs(log.timestamp)) === today) || null;
}

export function describeLog(log) {
  const names = (log.sections || []).flatMap((s) => (s.items || []).map((i) => i.title)).filter(Boolean);
  const head = names.slice(0, 3).join(' · ');
  return {
    title: log.title || (log.sections || []).map((s) => s.part).filter(Boolean).join(' · ') || '운동 메모',
    detail: names.length > 3 ? `${head} 외 ${names.length - 3}종목` : head,
    time: (() => { const d = new Date(tsMs(log.timestamp)); return `${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} 저장`; })(),
  };
}

/* 오늘 메모 뒤에 붙인 sections */
export function appendSections(existing, incoming) {
  const out = (existing || []).map((s) => ({ part: s.part, items: [...(s.items || [])] }));
  incoming.forEach((sec) => {
    const same = out.find((s) => s.part === sec.part);
    if (same) same.items.push(...sec.items);
    else out.push(sec);
  });
  return out;
}

/* 식단 가져오기: 끼니별 음식 → 식단 기록 sections */
export function dietFoodsToItems(foods) {
  return foods.map((f) => ({ name: f.name, kcal: f.kcal, carb: f.carb, protein: f.protein, fat: f.fat, source: 'ai' }));
}
