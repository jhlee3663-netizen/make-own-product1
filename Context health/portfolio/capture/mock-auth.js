// 포트폴리오 캡처 전용 Auth 대체 모듈 — 항상 로그인된 데모 유저
const user = {
  uid: 'demo-user', displayName: '민준', email: 'minjun@demo.app', photoURL: '',
  isAnonymous: false, providerData: [{ providerId: 'google.com' }],
  getIdToken: async () => 'demo', getIdTokenResult: async () => ({ claims: {} }),
};
const auth = { currentUser: user };
export const getAuth = () => auth;
export const connectAuthEmulator = () => {};
export class GoogleAuthProvider { setCustomParameters() {} addScope() {} }
export class OAuthProvider { constructor(id) { this.providerId = id; } addScope() {} setCustomParameters() {} }
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb(user), 0); return () => {}; };
export const signOut = async () => {};
export const getRedirectResult = async () => null;
export const signInWithPopup = async () => ({ user });
export const signInWithRedirect = async () => {};
export const linkWithPopup = async () => ({ user });
export const linkWithRedirect = async () => {};
export const signInWithCustomToken = async () => ({ user });
export const deleteUser = async () => {};
