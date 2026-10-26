import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { normalizeFoodKey } from '../utils/nutritionLookup';
import { apiUrl } from './native';

/* 공용 음식 사전 (서버 functions/foods.js).
   앱은 사전을 읽기만 하고, 값을 보탤 때는 서버(/api/food-contribute)를 거친다.
   문서 id 만드는 법은 서버의 docIdFor와 같아야 한다. */
const cache = new Map();

function docIdFor(name) {
  const key = normalizeFoodKey(name);
  const safe = key.replace(/\//g, '∕').slice(0, 200);
  return safe && safe !== '.' && safe !== '..' ? safe : null;
}

/* 이름이 정확히 같은 음식(띄어쓰기·괄호·기호 차이는 무시)이 사전에 있으면 돌려준다. 없으면 null. */
export async function lookupSharedFood(name) {
  const id = docIdFor(name);
  if (!id || !auth.currentUser) return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const snap = await getDoc(doc(db, 'foods', id));
    const data = snap.exists() ? snap.data() : null;
    const food = data && Number(data.kcal) > 0
      ? { name: data.name, kcal: data.kcal, carb: data.carb, protein: data.protein, fat: data.fat, sharedSource: data.source }
      : null;
    cache.set(id, food);
    return food;
  } catch {
    return null; // 사전을 못 읽어도 기록은 계속된다
  }
}

/* 음식 값을 사전에 보탠다. source: 'ai'(AI 추정) | 'user'(사람이 고침). 실패해도 기록에는 영향이 없다. */
export async function contributeFoods(foods, source) {
  const list = (foods || [])
    .filter(food => String(food?.name || '').trim() && Number(food?.kcal) > 0)
    .slice(0, 40)
    .map(food => ({ name: food.name, kcal: food.kcal, carb: food.carb, protein: food.protein, fat: food.fat }));
  const user = auth.currentUser;
  if (list.length === 0 || !user) return;
  try {
    const token = await user.getIdToken();
    await fetch(apiUrl('/api/food-contribute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ foods: list, source }),
    });
    list.forEach(food => cache.delete(docIdFor(food.name)));
  } catch {
    // 조용히 넘어간다
  }
}
