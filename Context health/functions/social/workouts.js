/* 친구에게 보여줄 운동 기록 요약, 최고 기록, 루틴 초안.
   세트 파싱은 MCP와 같은 규칙(../mcp/parse)을 쓴다. */
const { parseExercise, kstDateKey, normalizeName, round, weekStart } = require('../mcp/parse');
const { db } = require('./store');

const DAY_MS = 24 * 60 * 60 * 1000;

function logMillis(data) {
  const ts = data?.timestamp;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  return Number(ts) || 0;
}

/* 친구에게 보여도 되는 운동 기록인지 */
function isShareableWorkout(data) {
  return data?.type === 'workout' && !data.deletedAt && !data.hiddenFromFriends;
}

/* 탑세트(가장 무거운 세트)와 그 세트를 몇 번 했는지 */
function topOf(parsed) {
  const entries = [];
  parsed.sets.forEach((line) => (line.parsed || []).forEach((e) => entries.push(e)));
  if (!entries.length) return null;
  const top = entries.reduce((best, e) => ((e.weight_kg || 0) > (best.weight_kg || 0) ? e : best), entries[0]);
  const count = entries.filter((e) => e.weight_kg === top.weight_kg && e.reps === top.reps).reduce((sum, e) => sum + (e.set_count || 1), 0);
  const totalSets = entries.reduce((sum, e) => sum + (e.set_count || 1), 0);
  return { weightKg: top.weight_kg != null ? round(top.weight_kg) : null, reps: top.reps, count, totalSets };
}

/* 세트 목록을 "90kg × 5 × 5"처럼 한 줄로 */
function summarizeSets(parsed) {
  const top = topOf(parsed);
  if (!top) return '';
  const w = top.weightKg != null ? `${top.weightKg}kg × ` : '';
  return top.count > 1 ? `${w}${top.reps} × ${top.count}` : `${w}${top.reps}`;
}

/* 운동 기록 하나를 피드·스토리·상세용으로 줄인다 */
function workoutView(id, data) {
  const exercises = [];
  let volume = 0;
  (data.sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      if (!item?.title) return;
      const parsed = parseExercise(item, section.part);
      volume += parsed.parsed_volume_kg || 0;
      const top = topOf(parsed);
      exercises.push({
        name: parsed.name,
        part: section.part || '',
        sets: summarizeSets(parsed),
        setCount: top?.totalSets || 1,
        reps: top?.reps || null,
        weightKg: top?.weightKg ?? null,
        best1rm: parsed.best_est_1rm_kg,
      });
    });
  });
  const ms = logMillis(data);
  return {
    id,
    uid: data.uid,
    at: ms,
    date: kstDateKey(ms),
    title: data.title || exercises.map((e) => e.name).slice(0, 2).join(', ') || '운동',
    exercises,
    exerciseCount: exercises.length,
    volume: Math.round(volume),
    comment: typeof data.overloadMsg === 'string' ? data.overloadMsg.slice(0, 120) : '',
    cardioMinutes: Number(data.cardioMinutes || 0),
  };
}

async function recentWorkouts(uid, { days = 7, limit = 20 } = {}) {
  const since = Date.now() - days * DAY_MS;
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(limit).get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => isShareableWorkout(data) && logMillis(data) >= since)
    .map(({ id, data }) => workoutView(id, data));
}

/* 종목별 최고 무게(그때 횟수). hidden에 든 기록 id는 뺀다. */
async function bestRecords(uid, hidden = []) {
  const hiddenSet = new Set(hidden);
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(300).get();
  const best = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.type !== 'workout' || data.deletedAt) return;
    const ms = logMillis(data);
    (data.sections || []).forEach((section) => {
      (section.items || []).forEach((item) => {
        if (!item?.title) return;
        const parsed = parseExercise(item, section.part);
        if (parsed.weight_is_assistance) return;
        const key = normalizeName(parsed.name);
        const recordId = `${doc.id}:${key}`;
        if (hiddenSet.has(recordId)) return;
        parsed.sets.forEach((line) => (line.parsed || []).forEach((e) => {
          if (!(e.weight_kg > 0)) return;
          const prev = best.get(key);
          if (!prev || e.weight_kg > prev.weightKg || (e.weight_kg === prev.weightKg && e.reps > prev.reps)) {
            best.set(key, {
              id: recordId,
              name: parsed.name,
              weightKg: round(e.weight_kg),
              reps: e.reps,
              est1rm: e.est_1rm_kg || null,
              at: ms,
              date: kstDateKey(ms),
            });
          }
        }));
      });
    });
  });
  const list = [...best.values()].sort((a, b) => b.at - a.at);
  const pick = (re) => list.filter((r) => re.test(r.name)).sort((a, b) => b.weightKg - a.weightKg)[0] || null;
  const big3 = {
    bench: pick(/벤치/),
    squat: pick(/스쿼트/),
    dead: pick(/데드/),
  };
  const newest = list[0]?.at || 0;
  return { list: list.slice(0, 30).map((r) => ({ ...r, isNew: Date.now() - r.at < 3 * DAY_MS && r.at === newest })), big3 };
}

/* 기록에서 자주 반복한 부위 조합을 찾아 루틴 초안을 만든다.
   같은 제목(부위 조합)이 3번 이상 나온 것만, 종목은 그 세션들에서 자주 나온 순서로 6개까지. */
async function routineDrafts(uid, existingKeys = new Set()) {
  const since = Date.now() - 60 * DAY_MS;
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(120).get();
  const groups = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.type !== 'workout' || data.deletedAt || logMillis(data) < since) return;
    const parts = [...new Set((data.sections || []).map((s) => String(s.part || '').trim()).filter((p) => p && p !== '유산소'))];
    if (!parts.length) return;
    const key = parts.slice().sort().join('·');
    if (!groups.has(key)) groups.set(key, { parts, sessions: [] });
    groups.get(key).sessions.push(data);
  });

  const drafts = [];
  groups.forEach(({ parts, sessions }, key) => {
    if (sessions.length < 3 || existingKeys.has(key)) return;
    const freq = new Map();
    sessions.forEach((data, order) => {
      (data.sections || []).forEach((section) => (section.items || []).forEach((item, idx) => {
        if (!item?.title) return;
        const parsed = parseExercise(item, section.part);
        const k = normalizeName(parsed.name);
        const entries = [];
        parsed.sets.forEach((line) => (line.parsed || []).forEach((e) => entries.push(e)));
        const sets = entries.reduce((s, e) => s + (e.set_count || 1), 0);
        const reps = entries.length ? Math.round(entries.reduce((s, e) => s + e.reps, 0) / entries.length) : null;
        const prev = freq.get(k) || { name: parsed.name, count: 0, pos: 0, sets: [], reps: [] };
        prev.count += 1;
        prev.pos += idx + order * 0.001;
        if (sets) prev.sets.push(sets);
        if (reps) prev.reps.push(reps);
        freq.set(k, prev);
      }));
    });
    const mode = (arr) => {
      if (!arr.length) return null;
      const c = new Map();
      arr.forEach((v) => c.set(v, (c.get(v) || 0) + 1));
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    const items = [...freq.values()]
      .filter((f) => f.count >= Math.max(2, Math.ceil(sessions.length / 3)))
      .sort((a, b) => b.count - a.count || a.pos / a.count - b.pos / b.count)
      .slice(0, 6)
      .sort((a, b) => a.pos / a.count - b.pos / b.count)
      .map((f) => ({ name: f.name, sets: mode(f.sets) || 3, reps: mode(f.reps) || 10 }));
    if (items.length < 2) return;
    drafts.push({ key, title: `${parts.join(' · ')} 날`, parts, items, sessionCount: sessions.length });
  });
  return drafts.sort((a, b) => b.sessionCount - a.sessionCount).slice(0, 3);
}

/* 최근 식단 기록: 하루 칼로리·탄단지만 (친구에게 음식 이름은 보이지 않는다) */
async function recentDiets(uid, { days = 30, limit = 40 } = {}) {
  const since = Date.now() - days * DAY_MS;
  const snap = await db().collection('logs').where('uid', '==', uid).where('type', '==', 'diet').orderBy('timestamp', 'desc').limit(limit).get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => !data.deletedAt && !data.hiddenFromFriends && logMillis(data) >= since)
    .map(({ id, data }) => {
      const ms = logMillis(data);
      const meals = (data.sections || []).filter((s) => (s.items || []).length).length;
      return { id, at: ms, date: kstDateKey(ms), kcal: Math.round(data.kcal || 0), carb: Math.round(data.carb || 0), protein: Math.round(data.protein || 0), fat: Math.round(data.fat || 0), goal: data.goal || null, meals };
    })
    .filter((d) => d.kcal > 0);
}

/* 스토리: 최근 24시간 동안 올린 운동·식단 (인스타처럼 올린 때부터 24시간).
   식단은 하루 한 문서를 계속 고치므로, 마지막으로 고친 때(updatedAt)를 기준으로 본다. */
const STORY_MS = 24 * 60 * 60 * 1000;
async function storyItems(uid, { workout = true, diet = true } = {}) {
  const since = Date.now() - STORY_MS;
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(12).get();
  const items = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.deletedAt || data.hiddenFromFriends) return;
    const at = Math.max(logMillis(data), data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0);
    if (at < since) return;
    if (data.type === 'workout' && workout) items.push({ type: 'workout', ...workoutView(d.id, data), at });
    if (data.type === 'diet' && diet && Number(data.kcal) > 0) {
      const meals = (data.sections || []).filter((s) => (s.items || []).length).length;
      items.push({ type: 'diet', id: d.id, at, kcal: Math.round(data.kcal || 0), carb: Math.round(data.carb || 0), protein: Math.round(data.protein || 0), fat: Math.round(data.fat || 0), goal: data.goal || null, meals });
    }
  });
  return items.sort((a, b) => a.at - b.at);
}

/* 종목 이름별 가장 최근 탑세트 무게 (친구 루틴을 가져올 때 "민수 무게") */
async function lastTopWeights(uid, names) {
  const want = new Map(names.map((n) => [normalizeName(n), n]));
  const out = {};
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(60).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isShareableWorkout(data)) continue;
    for (const section of data.sections || []) {
      for (const item of section.items || []) {
        const key = normalizeName(item?.title);
        if (!want.has(key) || out[key]) continue;
        const top = topOf(parseExercise(item, section.part));
        if (top?.weightKg) out[key] = top.weightKg;
      }
    }
    if (Object.keys(out).length === want.size) break;
  }
  return out;
}

/* 이번 주(월요일 시작, KST) 운동 날짜 */
async function weekWorkoutDays(uid) {
  const snap = await db().collection('logs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(30).get();
  const mondayKey = weekStart(kstDateKey(Date.now()));
  const out = {};
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (!isShareableWorkout(data)) return;
    const key = kstDateKey(logMillis(data));
    if (key < mondayKey) return;
    const parts = (data.sections || []).map((s) => s.part).filter(Boolean);
    out[key] = [...new Set([...(out[key] || []), ...parts])];
  });
  return { mondayKey, days: out };
}

module.exports = {
  DAY_MS,
  STORY_MS,
  bestRecords,
  isShareableWorkout,
  lastTopWeights,
  recentDiets,
  storyItems,
  logMillis,
  recentWorkouts,
  routineDrafts,
  weekWorkoutDays,
  workoutView,
};
