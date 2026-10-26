/* 공용 음식 사전 (foods/{key}).
   누군가 한 번 찾은 음식의 영양 값을 모든 사용자가 같이 쓴다. 쓰기는 이 서버 코드만 할 수 있고(보안 규칙으로 막음),
   앱은 읽기만 한다. 누가 넣었는지는 저장하지 않고, 같은 사람이 두 번 세지 않도록 uid의 해시만 남긴다.

   값의 등급(tier): ai(1) < claude(2) < user(3)
   - 낮은 등급은 높은 등급을 덮어쓰지 못한다.
   - ai / claude 값은 더 높은 등급의 값이 오면 바로 바뀐다.
   - 이미 사람이 고친 값(user)은, 다른 값을 서로 다른 두 사람 이상이 넣었을 때만 바뀐다.
   값의 의미는 앱의 "내 기준값"과 같다: 그 이름(분량 표기 포함)으로 먹은 한 번의 양 전체. */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');

const TIERS = { ai: 1, claude: 2, user: 3 };
const CONFIRMATIONS_TO_REPLACE = 2;
const SAME_VALUE_TOLERANCE = 0.03;
const MAX_NAME = 80;

/* 앱의 normalizeFoodKey(src/utils/nutritionLookup.js)와 똑같이 맞춰야 같은 음식으로 찾는다. */
function normalizeFoodKey(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
    .replace(/[()（）]/g, '')
    .replace(/그램/g, 'g')
    .replace(/피스|pcs?/g, 'ps')
    .replace(/한스푼/g, '1스푼')
    .replace(/한숟가락/g, '1숟가락');
}

/* Firestore 문서 id로 못 쓰는 글자(/)와 길이를 정리한다. */
function docIdFor(key) {
  const safe = key.replace(/\//g, '∕').slice(0, 200);
  return safe && safe !== '.' && safe !== '..' ? safe : null;
}

function cleanValues(food) {
  const pick = (value, max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
  };
  const values = {
    kcal: pick(food.kcal, 20000),
    carb: pick(food.carb, 5000) ?? 0,
    protein: pick(food.protein, 5000) ?? 0,
    fat: pick(food.fat, 5000) ?? 0,
  };
  return values.kcal && values.kcal > 0 ? values : null;
}

const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * SAME_VALUE_TOLERANCE);
const sameValues = (a, b) => ['kcal', 'carb', 'protein', 'fat'].every(k => close(Number(a[k] || 0), Number(b[k] || 0)));
const valueHash = v => crypto.createHash('sha256').update(`${Math.round(v.kcal)}|${Math.round(v.carb)}|${Math.round(v.protein)}|${Math.round(v.fat)}`).digest('hex').slice(0, 16);
const userHash = uid => crypto.createHash('sha256').update(`food-contributor:${uid}`).digest('hex').slice(0, 20);

/* 음식 하나를 사전에 반영한다. 반환값: created | replaced | confirmed | pending | ignored */
async function contributeFood(db, uid, food, source) {
  const tier = TIERS[source];
  if (!tier) return 'ignored';
  const name = String(food?.name || '').trim().slice(0, MAX_NAME);
  const key = normalizeFoodKey(name);
  const id = key && docIdFor(key);
  const values = cleanValues(food || {});
  if (!id || !values) return 'ignored';
  const who = userHash(uid);
  const ref = db.collection('foods').doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = FieldValue.serverTimestamp();
    if (!snap.exists) {
      tx.set(ref, { key, name, ...values, source, tier, confirmedBy: tier === 3 ? [who] : [], pending: {}, createdAt: now, updatedAt: now });
      return 'created';
    }
    const current = snap.data();
    if (tier < current.tier) return 'ignored';
    if (current.tier < 3) {
      if (tier === current.tier && source === 'ai') return 'ignored'; // AI가 다시 추정한 값으로 흔들지 않는다
      tx.update(ref, { name, ...values, source, tier, confirmedBy: tier === 3 ? [who] : [], pending: {}, updatedAt: now });
      return 'replaced';
    }
    // 이미 사람이 고친 값
    if (sameValues(values, current)) {
      if ((current.confirmedBy || []).includes(who)) return 'confirmed';
      tx.update(ref, { confirmedBy: FieldValue.arrayUnion(who), updatedAt: now });
      return 'confirmed';
    }
    const hash = valueHash(values);
    const entry = current.pending?.[hash] || { values, by: [] };
    const by = entry.by.includes(who) ? entry.by : [...entry.by, who];
    if (by.length >= CONFIRMATIONS_TO_REPLACE) {
      tx.update(ref, { name, ...values, source, tier, confirmedBy: by, pending: {}, updatedAt: now });
      return 'replaced';
    }
    tx.update(ref, { [`pending.${hash}`]: { values, by }, updatedAt: now });
    return 'pending';
  });
}

module.exports = { contributeFood, normalizeFoodKey, docIdFor, TIERS };
