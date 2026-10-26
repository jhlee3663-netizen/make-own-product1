import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { isNativeApp } from './native';

/* 폰 알림(FCM).
   - 웹: 서비스워커 + VAPID 키
   - 앱(iOS·Android): @capacitor-firebase/messaging 플러그인이 FCM 토큰을 준다.
     서버(functions/social/notify.js)는 두 경우 모두 같은 FCM 토큰으로 보낸다.
   권한은 친구가 처음 생겼을 때 묻는다 (설치 직후에 묻지 않는다, IA 11장). */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function pushSupported() {
  if (isNativeApp) return true;
  return Boolean(VAPID_KEY) && typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/* 앱에서 알림 권한이 이미 허락돼 있는지 (웹의 Notification.permission 대신 쓴다) */
export async function pushPermission() {
  if (!isNativeApp) return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const { receive } = await FirebaseMessaging.checkPermissions();
  return receive === 'prompt' || receive === 'prompt-with-rationale' ? 'default' : receive;
}

async function tokenId(token) {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 권한을 묻고(필요하면) 토큰을 저장한다. 성공하면 true */
async function saveToken(uid, token, platform) {
  if (!token) return false;
  await setDoc(doc(db, 'users', uid, 'pushTokens', await tokenId(token)), {
    token,
    at: Date.now(),
    platform,
    ua: navigator.userAgent.slice(0, 120),
  });
  return true;
}

/* 앱: 권한을 묻고 FCM 토큰을 저장한다 */
async function enableNativePush(uid) {
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const current = await FirebaseMessaging.checkPermissions();
  const { receive } = current.receive === 'granted' ? current : await FirebaseMessaging.requestPermissions();
  if (receive !== 'granted') return false;
  const { token } = await FirebaseMessaging.getToken();
  return saveToken(uid, token, 'native');
}

/* 알림을 눌러서 앱이 열렸을 때 (웹의 'push-open' 메시지와 같은 역할) */
export async function onNativePushOpen(handler) {
  if (!isNativeApp) return () => {};
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const listener = await FirebaseMessaging.addListener('notificationActionPerformed', () => handler());
  return () => listener.remove();
}

export async function enablePush(uid) {
  if (!pushSupported() || !uid) return false;
  if (isNativeApp) return enableNativePush(uid);
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
  return saveToken(uid, token, 'web');
}

/* 이미 허락한 기기는 열 때마다 토큰을 갱신한다 */
export async function refreshPushToken(uid) {
  if (!pushSupported()) return;
  try {
    if (await pushPermission() === 'granted') await enablePush(uid);
  } catch { /* 다음에 다시 */ }
}
