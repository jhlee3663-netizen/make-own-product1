import { db } from './firebase';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

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
  await Promise.all(ROOMS.map(async (roomId) => {
    const snap = await getDoc(doc(db, 'users', uid, 'coachRooms', roomId));
    if (snap.exists()) {
      const { messages } = snap.data();
      result[roomId] = messages.map(m => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      }));
    } else {
      result[roomId] = null;
    }
  }));
  return result;
}

export async function saveCoachRoom(uid, roomId, messages) {
  const serialized = messages.map(m => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
  await setDoc(doc(db, 'users', uid, 'coachRooms', roomId), { messages: serialized });
}

export async function deleteCoachRoom(uid, roomId) {
  await deleteDoc(doc(db, 'users', uid, 'coachRooms', roomId));
}
