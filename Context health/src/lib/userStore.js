import { db } from './firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

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

  // 전체 메타데이터를 읽은 뒤 최근 100개를 고른다. Firestore orderBy는 updatedAt이
  // 없는 기존 방을 제외하므로, 클라이언트 정렬로 레거시 방도 계속 불러온다.
  const snap = await getDocs(collection(db, 'users', uid, 'coachRooms'));
  const roomDocs = snap.docs
    .map(roomDoc => ({ roomDoc, data: roomDoc.data() }))
    .sort((a, b) => {
      const time = ({ data }) => data.updatedAt?.toMillis?.()
        || Number(data.meta?.updatedAt || data.meta?.createdAt || 0)
        || Date.parse([...((data.messages || []))].reverse().find(m => m.timestamp)?.timestamp || '')
        || 0;
      return time(b) - time(a);
    })
    .slice(0, 100);

  roomDocs.forEach(({ roomDoc, data }) => {
    const { messages = [], meta = null } = data;
    const storedUpdatedAt = data.updatedAt?.toMillis?.() || Number(meta?.updatedAt || meta?.createdAt || 0) || 0;
    result[roomDoc.id] = {
      messages: messages.map(m => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      })),
      meta: meta ? { ...meta, updatedAt: storedUpdatedAt || meta.updatedAt } : meta,
    };
  });
  return { rooms: result, hasMore: snap.size > roomDocs.length };
}

export async function saveCoachRoom(uid, roomId, messages, meta = null) {
  const serialized = messages.map(m => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
  await setDoc(doc(db, 'users', uid, 'coachRooms', roomId), { messages: serialized, meta, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteCoachRoom(uid, roomId) {
  await deleteDoc(doc(db, 'users', uid, 'coachRooms', roomId));
}
