import { db } from './firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';

/* 아침 공복 체중: users/{uid}/bodyLogs/mw_YYYY-MM-DD (하루 한 건).
   인바디(kind: inbody)는 같은 컬렉션에 있지만 서버 시드로만 들어가고 앱에서는 쓰지 않는다. */

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function morningWeightRef(uid, dateKey) {
  return doc(db, 'users', uid, 'bodyLogs', `mw_${dateKey}`);
}

export async function loadMorningWeight(uid, dateKey) {
  const snap = await getDoc(morningWeightRef(uid, dateKey));
  return snap.exists() ? snap.data().weightKg : null;
}

export async function saveMorningWeight(uid, dateKey, weightKg) {
  await setDoc(morningWeightRef(uid, dateKey), {
    kind: 'morning_weight',
    date: dateKey,
    weightKg,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMorningWeight(uid, dateKey) {
  await deleteDoc(morningWeightRef(uid, dateKey));
}

export async function listMorningWeights(uid, max = 90) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'bodyLogs'), orderBy('date', 'desc'), limit(max)));
  return snap.docs
    .map(d => d.data())
    .filter(d => d.kind === 'morning_weight')
    .map(d => ({ date: d.date, weightKg: d.weightKg }));
}
