import { db } from './firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const ROOMS = ['powerbuilding', 'dumbbell', 'diet', 'mobility', 'routine'];

export async function loadUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserData(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

export async function loadAllCoachRooms(uid) {
  const result = {};
  ROOMS.forEach(roomId => { result[roomId] = null; });

  const snap = await getDocs(collection(db, 'users', uid, 'coachRooms'));
  snap.forEach((roomDoc) => {
    const { messages = [], meta = null } = roomDoc.data();
    result[roomDoc.id] = {
      messages: messages.map(m => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      })),
      meta,
    };
  });
  return result;
}

export async function saveCoachRoom(uid, roomId, messages, meta = null) {
  const serialized = messages.map(m => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
  await setDoc(doc(db, 'users', uid, 'coachRooms', roomId), { messages: serialized, meta }, { merge: true });
}

export async function deleteCoachRoom(uid, roomId) {
  await deleteDoc(doc(db, 'users', uid, 'coachRooms', roomId));
}
