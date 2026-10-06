import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";

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
export const auth = getAuth(app);

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
