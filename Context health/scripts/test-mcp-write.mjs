/* MCP 쓰기 도구 검사. 실제 DB 대신 메모리 안의 가짜 DB로 돌린다.
   실행: node scripts/test-mcp-write.mjs */
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/', import.meta.url));
// firebase-admin을 실제로 불러오지 않고, 이 검사에 필요한 두 가지만 흉내 낸다 (설치 상태와 무관하게 빨리 돈다)
class Timestamp {
  constructor(ms) { this.ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  toMillis() { return this.ms; }
}
const FieldValue = { serverTimestamp: () => 'SERVER_TIME' };
const Module = require('module');
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'firebase-admin/firestore') return { Timestamp, FieldValue };
  return originalLoad.call(this, request, ...rest);
};
const { callWriteTool, isWriteTool, WRITE_TOOLS } = require('./mcp/write.js');

function fakeDb() {
  const docs = new Map();
  let seq = 0;
  const resolve = value => value;
  const clean = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, resolve(v)]));
  const docRef = path => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), ref: docRef(path) }),
    set: async (data, opt) => { docs.set(path, opt?.merge ? { ...(docs.get(path) || {}), ...clean(data) } : clean(data)); },
    update: async (data) => {
      if (!docs.has(path)) throw new Error('not-found');
      const next = { ...docs.get(path) };
      Object.entries(clean(data)).forEach(([k, v]) => {
        if (k.includes('.')) { const [a, b] = k.split('.'); next[a] = { ...(next[a] || {}), [b]: v }; } else next[k] = v;
      });
      docs.set(path, next);
    },
    delete: async () => { docs.delete(path); },
  });
  const query = (name, filters = []) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]]),
    orderBy: () => query(name, filters),
    limit: () => query(name, filters),
    get: async () => {
      const rows = [...docs.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && filters.every(([f, op, v]) => {
        const x = data[f]; const a = x?.toMillis ? x.toMillis() : x; const b = v?.toMillis ? v.toMillis() : v;
        return op === '==' ? a === b : op === '>=' ? a >= b : a < b;
      }));
      return { docs: rows.map(([path, data]) => ({ id: path.split('/').pop(), data: () => data, ref: docRef(path) })), size: rows.length };
    },
    doc: id => docRef(`${name}/${id || `auto${++seq}`}`),
  });
  return { docs, collection: query, doc: docRef };
}

let failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failed += 1; console.error(`✗ ${label}\n   기대: ${JSON.stringify(expected)}\n   실제: ${JSON.stringify(actual)}`); } else console.log(`✓ ${label}`);
}
async function fails(label, fn, includes) {
  try { await fn(); failed += 1; console.error(`✗ ${label} (오류가 나야 하는데 통과함)`); } catch (e) {
    const ok = !includes || String(e.message).includes(includes);
    if (!ok) { failed += 1; console.error(`✗ ${label}: ${e.message}`); } else console.log(`✓ ${label}`);
  }
}

const db = fakeDb();
const ME = 'user-a';
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

check('쓰기 도구 7개가 등록됨', WRITE_TOOLS.map(t => t.name).every(isWriteTool) && WRITE_TOOLS.length, 7);

// 식단: 새 기록 → 추가 → 끼니 바꾸기
let r = await callWriteTool(db, ME, 'add_diet_items', { meal: 'lunch', items: [{ name: '제육덮밥', kcal: 650, carb_g: 82, protein_g: 23, fat_g: 22 }] });
check('식단 새 기록: 합계', r.day_total, { kcal: 650, carb_g: 82, protein_g: 23, fat_g: 22 });
const dietId = r.log_id;
r = await callWriteTool(db, ME, 'add_diet_items', { meal: 'lunch', items: [{ name: '콜라', kcal: 110, carb_g: 27 }] });
check('같은 날 추가는 같은 문서에 붙음', [r.log_id === dietId, r.meal_items.length, r.day_total.kcal], [true, 2, 760]);
r = await callWriteTool(db, ME, 'add_diet_items', { meal: 'breakfast', items: [{ name: '바나나', kcal: 100 }] });
check('다른 끼니 추가: 하루 합계', r.day_total.kcal, 860);
r = await callWriteTool(db, ME, 'replace_diet_meal', { meal: 'lunch', items: [{ name: '제육덮밥 반', kcal: 325 }] });
check('끼니 바꾸기: 점심만 바뀜', [r.meal_items.map(i => i.name), r.day_total.kcal], [['제육덮밥 반'], 425]);
const dietDoc = db.docs.get(`logs/${dietId}`);
check('식단 문서 모양', [dietDoc.type, dietDoc.uid, dietDoc.sections.length, dietDoc.sections[2].items[0].source], ['diet', ME, 6, 'mcp']);
r = await callWriteTool(db, ME, 'replace_diet_meal', { date: '2020-01-01', meal: 'lunch', items: [] });
check('기록 없는 날 비우기는 아무것도 만들지 않음', r.changed, false);

// 운동
r = await callWriteTool(db, ME, 'add_workout', { sections: [{ part: '가슴', exercises: [{ name: '벤치프레스', body: '• 세트 1: 60kg 10회\n• 세트 2: 60kg 8회' }] }] });
check('운동: 볼륨 계산과 제목', [r.total_volume_kg, r.title], [1080, '가슴']);
const workoutId = r.log_id;
r = await callWriteTool(db, ME, 'replace_workout', { log_id: workoutId, sections: [{ part: '가슴', exercises: [{ name: '벤치프레스', body: '• 세트 1: 70kg 5회' }] }] });
check('운동 바꾸기', r.total_volume_kg, 350);

// 소유자 확인
db.docs.set('logs/other', { uid: 'user-b', type: 'workout', timestamp: Timestamp.now() });
await fails('남의 기록은 못 바꿈', () => callWriteTool(db, ME, 'replace_workout', { log_id: 'other', sections: [{ part: '등', exercises: [{ name: '풀업' }] }] }), '찾을 수 없습니다');
await fails('남의 기록은 못 지움', () => callWriteTool(db, ME, 'delete_log', { log_id: 'other' }), '찾을 수 없습니다');
check('남의 기록은 그대로', db.docs.get('logs/other').deletedAt, undefined);

// 삭제는 휴지통
r = await callWriteTool(db, ME, 'delete_log', { log_id: workoutId });
check('삭제는 deletedAt만 찍음', [r.deleted, Boolean(db.docs.get(`logs/${workoutId}`).deletedAt), db.docs.has(`logs/${workoutId}`)], [true, true, true]);
await fails('지운 기록은 다시 못 고침', () => callWriteTool(db, ME, 'delete_log', { log_id: workoutId }), '찾을 수 없습니다');

// 입력 검사
await fails('미래 날짜 거부', () => callWriteTool(db, ME, 'add_diet_items', { date: '2999-01-01', meal: 'lunch', items: [{ name: 'x', kcal: 1 }] }), '오지 않은');
await fails('잘못된 끼니 거부', () => callWriteTool(db, ME, 'add_diet_items', { meal: 'brunch', items: [{ name: 'x', kcal: 1 }] }), 'meal');
await fails('음수 칼로리 거부', () => callWriteTool(db, ME, 'add_diet_items', { meal: 'lunch', items: [{ name: 'x', kcal: -5 }] }), 'kcal');

// 체중 · 프로필
r = await callWriteTool(db, ME, 'set_morning_weight', { weight_kg: 72.14 });
check('체중 기록', [r.weight_kg, db.docs.get(`users/${ME}/bodyLogs/mw_${today}`).kind], [72.1, 'morning_weight']);
r = await callWriteTool(db, ME, 'set_morning_weight', { weight_kg: null });
check('체중 지우기', db.docs.has(`users/${ME}/bodyLogs/mw_${today}`), false);
await fails('말이 안 되는 체중 거부', () => callWriteTool(db, ME, 'set_morning_weight', { weight_kg: 500 }), '20~300');
r = await callWriteTool(db, ME, 'update_profile', { target_kcal: 1900 });
check('프로필: 목표 칼로리만 바뀜', db.docs.get(`users/${ME}`), { profile: { targetKcal: 1900 } });
await fails('바꿀 게 없으면 거부', () => callWriteTool(db, ME, 'update_profile', {}), '바꿀 항목');

console.log(failed ? `\n실패 ${failed}건` : '\nmcp write: 모든 검사 통과');
process.exit(failed ? 1 : 0);
