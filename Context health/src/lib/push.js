import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/* 폰 알림(FCM 웹 푸시). VITE_FIREBASE_VAPID_KEY가 있어야 켤 수 있다.
   권한은 친구가 처음 생겼을 때 묻는다 (설치 직후에 묻지 않는다, IA 11장). */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function pushSupported() {
  return Boolean(VAPID_KEY) && typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function tokenId(token) {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 권한을 묻고(필요하면) 토큰을 저장한다. 성공하면 true */
export async function enablePush(uid) {
  if (!pushSupported() || !uid) return false;
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return false;
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return false;
  const { getApp } = await import('firebase/app');
  const app = getApp();
  const o = app.options;
  const qs = new URLSearchParams({ apiKey: o.apiKey, projectId: o.projectId, messagingSenderId: o.messagingSenderId, appId: o.appId });
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: '/firebase-cloud-messaging-push-scope' });
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return false;
  await setDoc(doc(db, 'users', uid, 'pushTokens', await tokenId(token)), { token, at: Date.now(), ua: navigator.userAgent.slice(0, 120) });
  return true;
}

/* 이미 허락한 기기는 열 때마다 토큰을 갱신한다 */
export async function refreshPushToken(uid) {
  if (pushSupported() && Notification.permission === 'granted') {
    try { await enablePush(uid); } catch { /* 다음에 다시 */ }
  }
}
