import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getUserStorage, setUserStorage } from './userStorage';

/* 저장한 글(users/{uid}/saved)과, 이 기기에서 본 스토리·최근 검색어. */

const savedListeners = new Set();
let savedState = { uid: null, items: new Map(), unsub: null };

export function watchSaved(uid, listener) {
  if (savedState.uid !== uid) {
    savedState.unsub?.();
    savedState = { uid, items: new Map(), unsub: null };
    if (uid) {
      savedState.unsub = onSnapshot(collection(db, 'users', uid, 'saved'), (snap) => {
        const next = new Map();
        snap.docs.forEach((d) => next.set(d.id, d.data()));
        savedState.items = next;
        savedListeners.forEach((fn) => fn(next));
      }, () => {});
    }
  }
  savedListeners.add(listener);
  listener(savedState.items);
  return () => savedListeners.delete(listener);
}

const docId = (key) => key.replace(/[/:]/g, '_');

export function isSaved(items, key) {
  return items.has(docId(key));
}

/* meta: { kind: 'routine'|'diet'|'youtube', title, sub, thumbnail?, tag? } */
export async function toggleSaved(uid, key, meta, on) {
  const ref = doc(db, 'users', uid, 'saved', docId(key));
  if (on) await setDoc(ref, { key, ...meta, at: Date.now() });
  else await deleteDoc(ref);
}

export function loadSeenStories(uid) {
  try { return new Set(JSON.parse(getUserStorage(uid, 'story_seen') || '[]')); } catch { return new Set(); }
}

/* 스토리는 장마다 `${작성자uid}_${올린시각}`으로 기억한다. 피드의 테두리 색이 바로 바뀌도록 알린다. */
export const STORY_SEEN_EVENT = 'ch-story-seen';
export function markStorySeen(uid, storyKey) {
  const seen = loadSeenStories(uid);
  if (seen.has(storyKey)) return;
  seen.add(storyKey);
  setUserStorage(uid, 'story_seen', JSON.stringify([...seen].slice(-300)));
  window.dispatchEvent(new Event(STORY_SEEN_EVENT));
}

export function loadRecentSearches(uid) {
  try { return JSON.parse(getUserStorage(uid, 'social_recent_search') || '[]'); } catch { return []; }
}

export function saveRecentSearches(uid, list) {
  setUserStorage(uid, 'social_recent_search', JSON.stringify(list.slice(0, 10)));
}

/* 오프라인일 때 보여줄 마지막 피드 */
export function loadCachedFeed(uid) {
  try { return JSON.parse(getUserStorage(uid, 'feed_cache') || 'null'); } catch { return null; }
}

export function saveCachedFeed(uid, data) {
  try { setUserStorage(uid, 'feed_cache', JSON.stringify(data)); } catch { /* 저장 공간이 부족하면 건너뛴다 */ }
}
