/* 공용 음식 사전 규칙 검사 (functions/foods.js). 실행: node scripts/test-shared-foods.mjs */
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/', import.meta.url));
const FieldValue = { serverTimestamp: () => 'NOW', arrayUnion: v => ({ __union: v }) };
const Module = require('module');
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'firebase-admin/firestore' ? { FieldValue } : load.call(this, request, ...rest); };
const { contributeFood } = require('./foods.js');

const store = new Map();
const apply = (prev, patch) => {
  const next = { ...prev };
  Object.entries(patch).forEach(([k, v]) => {
    if (v && v.__union) next[k] = [...new Set([...(next[k] || []), v.__union])];
    else if (k.includes('.')) { const [a, b] = k.split('.'); next[a] = { ...(next[a] || {}), [b]: v }; } else next[k] = v;
  });
  return next;
};
const db = {
  collection: () => ({ doc: id => ({ id }) }),
  runTransaction: async fn => fn({
    get: async ref => ({ exists: store.has(ref.id), data: () => store.get(ref.id) }),
    set: (ref, data) => store.set(ref.id, data),
    update: (ref, patch) => store.set(ref.id, apply(store.get(ref.id), patch)),
  }),
};
let failed = 0;
const check = (label, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` → ${JSON.stringify(a)}`}`); };
const food = (kcal, extra = {}) => ({ name: '미트리 저당 홀그레인', kcal, carb: 20, protein: 5, fat: 3, ...extra });
const now = () => store.get('미트리저당홀그레인');

check('AI 추정값으로 처음 생김', await contributeFood(db, 'u1', food(150), 'ai'), 'created');
check('AI가 다시 추정해도 안 흔들림', [await contributeFood(db, 'u2', food(170), 'ai'), now().kcal], ['ignored', 150]);
check('Claude 값이 AI 값을 바꿈', [await contributeFood(db, 'u1', food(140), 'claude'), now().kcal], ['replaced', 140]);
check('사람이 고친 값이 Claude 값을 바꿈', [await contributeFood(db, 'u1', food(130), 'user'), now().kcal, now().tier], ['replaced', 130, 3]);
check('그 뒤 AI 값은 무시', [await contributeFood(db, 'u3', food(200), 'ai'), now().kcal], ['ignored', 130]);
check('다른 사람 한 명이 다른 값 → 보류', [await contributeFood(db, 'u2', food(120), 'user'), now().kcal], ['pending', 130]);
check('같은 사람이 또 넣어도 보류', [await contributeFood(db, 'u2', food(120), 'user'), now().kcal], ['pending', 130]);
check('두 번째 사람이 같은 값 → 바뀜', [await contributeFood(db, 'u3', food(120), 'user'), now().kcal], ['replaced', 120]);
check('같은 값을 넣으면 확인 횟수만 늘어남', [await contributeFood(db, 'u4', food(121), 'user'), now().kcal, now().confirmedBy.length], ['confirmed', 120, 3]);
check('띄어쓰기·괄호가 달라도 같은 음식', await contributeFood(db, 'u5', { ...food(120), name: '미트리 저당(홀그레인)' }, 'user'), 'confirmed');
check('칼로리 0이나 이상한 값은 무시', [await contributeFood(db, 'u1', food(0), 'user'), await contributeFood(db, 'u1', food(-5), 'user')], ['ignored', 'ignored']);
check('누가 넣었는지는 해시로만 남음', now().confirmedBy.every(h => /^[0-9a-f]{20}$/.test(h)), true);
console.log(failed ? `\n실패 ${failed}건` : '\nshared foods: 모든 검사 통과');
process.exit(failed ? 1 : 0);
