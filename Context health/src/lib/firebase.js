import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, indexedDBLocalPersistence, initializeAuth, OAuthProvider } from "firebase/auth";
import { isNativeApp } from "./native";

// 인증 도메인을 앱 도메인과 같게 맞춰야 Safari/Chrome의 저장소 분리 정책에서도 리다이렉트 로그인이 유지된다.
// Firebase Hosting 도메인은 /__/auth/* 를 직접 제공하므로 현재 호스트를 그대로 쓴다.
function resolveAuthDomain() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (host === `${projectId}.web.app` || host === `${projectId}.firebaseapp.com`) return host;
  return import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
/* 스토어 앱의 웹뷰에서는 팝업·리다이렉트 로그인을 쓰지 않는다(네이티브 플러그인으로 대신함).
   getAuth 기본값은 리다이렉트용 iframe을 불러오다 iOS 웹뷰에서 멈출 수 있어, 앱에서는 저장소만 정해서 만든다.
   처음 한 번 정하는 것이라 아래 setPersistence 주의와는 다르다. */
export const auth = isNativeApp
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);

/* App Check (웹). 콘솔에서 reCAPTCHA Enterprise 사이트 키를 발급해 VITE_RECAPTCHA_SITE_KEY에 넣으면 켜진다.
   앱(웹뷰)은 reCAPTCHA가 제대로 뜨지 않아 켜지 않는다 — 네이티브는 Play Integrity/App Attest 플러그인이 필요하다.
   서버에서 강제(enforce)하기 전에는 켜도 영향이 없으므로, 콘솔에서 '모니터링'으로 먼저 지켜본 뒤 강제한다. */
const APP_CHECK_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (APP_CHECK_KEY && !isNativeApp && typeof window !== 'undefined') {
  if (import.meta.env.DEV && import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
  }
  import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(APP_CHECK_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch(() => { /* App Check가 막혀도 앱은 그대로 쓴다 */ });
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !globalThis.__contextHealthFirebaseEmulatorsConnected) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  globalThis.__contextHealthFirebaseEmulatorsConnected = true;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

/* 로그인 유지는 getAuth 기본값(IndexedDB 우선, 브라우저 재시작 후에도 유지)에 맡긴다.
   여기서 setPersistence로 저장 위치를 다시 바꾸면 페이지를 열 때마다 로그인 정보가
   IndexedDB ↔ localStorage로 옮겨지고, 그 순간 다른 탭·설치된 앱이 로그아웃으로 오인한다. */
export const authPersistenceReady = Promise.resolve();
