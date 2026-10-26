/* 피드·친구 데이터 접근. 친구·요청·차단은 서버(Admin SDK)만 쓴다.
   컬렉션
   - profiles/{uid}            아이디·이름·소개·사진·색·공개 범위
   - handles/{handle}          아이디 중복 막기 { uid }
   - users/{uid}/friends/{fid} 친구 (양쪽에 같이 쓴다) { since }
   - users/{uid}/blocks/{bid}  내가 차단한 사람 { at }
   - friendRequests/{from}_{to} 보낸 요청 { from, to, at }
   - friendDeclines/{from}_{to} 거절 기록 (7일 동안 다시 요청 못 함) { at } */
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const FRIEND_LIMIT = 100;
const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const HANDLE_RE = /^[a-z0-9._]{3,20}$/;
const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_COLORS = ['#FF8A9B', '#3ECF8E', '#FFB547', '#5BB8FF', '#9B8AFB', '#7171FF'];
const DEFAULT_VISIBILITY = { workout: true, best: true, diet: false, weight: false };

const db = () => getFirestore();

class SocialError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

function colorFor(uid) {
  let h = 0;
  for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function cleanStr(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/* 남에게 보여도 되는 프로필 필드만 */
function publicProfile(uid, data) {
  if (!data) return { uid, gone: true, name: '탈퇴한 사용자', handle: '', color: '#ADB5BD', photoUrl: '', bio: '' };
  return {
    uid,
    handle: data.handle || '',
    name: data.name || data.handle || '사용자',
    bio: data.bio || '',
    photoUrl: data.photoUrl || '',
    color: data.color || colorFor(uid),
  };
}

async function getProfile(uid) {
  const snap = await db().doc(`profiles/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

async function getProfiles(uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return {};
  const refs = unique.map((uid) => db().doc(`profiles/${uid}`));
  const snaps = await db().getAll(...refs);
  const out = {};
  snaps.forEach((snap, i) => { out[unique[i]] = snap.exists ? snap.data() : null; });
  return out;
}

async function requireProfile(uid) {
  const profile = await getProfile(uid);
  if (!profile?.handle) throw new SocialError('profile-required', 409);
  return profile;
}

async function friendIds(uid) {
  const snap = await db().collection(`users/${uid}/friends`).get();
  return snap.docs.map((d) => d.id);
}

async function blockedIds(uid) {
  const snap = await db().collection(`users/${uid}/blocks`).get();
  return snap.docs.map((d) => d.id);
}

/* 나를 차단한 사람. 차단 문서는 차단한 쪽 아래에 있어서 collectionGroup으로 찾는다. */
async function blockedByIds(uid) {
  const snap = await db().collectionGroup('blocks').where('target', '==', uid).get();
  return snap.docs.map((d) => d.ref.parent.parent.id);
}

/* 서로 안 보여야 하는 사람 전체 (내가 차단 + 나를 차단) */
async function hiddenIds(uid) {
  const [a, b] = await Promise.all([blockedIds(uid), blockedByIds(uid)]);
  return new Set([...a, ...b]);
}

/* 나 기준 상대와의 관계 */
async function relation(me, other) {
  if (me === other) return 'self';
  const d = db();
  const [profile, friend, sent, received, iBlocked, theyBlocked] = await d.getAll(
    d.doc(`profiles/${other}`),
    d.doc(`users/${me}/friends/${other}`),
    d.doc(`friendRequests/${me}_${other}`),
    d.doc(`friendRequests/${other}_${me}`),
    d.doc(`users/${me}/blocks/${other}`),
    d.doc(`users/${other}/blocks/${me}`),
  );
  if (!profile.exists) return 'gone';
  if (theyBlocked.exists) return 'blockedBy';
  if (iBlocked.exists) return 'blocked';
  if (friend.exists) return 'friend';
  if (sent.exists) return 'requested';
  if (received.exists) return 'incoming';
  return 'none';
}

async function friendCount(uid) {
  const snap = await db().collection(`users/${uid}/friends`).count().get();
  return snap.data().count;
}

/* 두 사람을 친구로 만든다. 남아 있던 요청·거절 기록은 지운다. */
async function makeFriends(a, b) {
  const [ca, cb] = await Promise.all([friendCount(a), friendCount(b)]);
  if (ca >= FRIEND_LIMIT) throw new SocialError('friend-limit-self', 409);
  if (cb >= FRIEND_LIMIT) throw new SocialError('friend-limit-other', 409);
  const d = db();
  const batch = d.batch();
  const since = Date.now();
  batch.set(d.doc(`users/${a}/friends/${b}`), { since });
  batch.set(d.doc(`users/${b}/friends/${a}`), { since });
  batch.delete(d.doc(`friendRequests/${a}_${b}`));
  batch.delete(d.doc(`friendRequests/${b}_${a}`));
  batch.delete(d.doc(`friendDeclines/${a}_${b}`));
  batch.delete(d.doc(`friendDeclines/${b}_${a}`));
  await batch.commit();
}

async function unfriend(a, b) {
  const d = db();
  const batch = d.batch();
  batch.delete(d.doc(`users/${a}/friends/${b}`));
  batch.delete(d.doc(`users/${b}/friends/${a}`));
  await batch.commit();
}

module.exports = {
  AVATAR_COLORS,
  DECLINE_COOLDOWN_MS,
  DEFAULT_VISIBILITY,
  FRIEND_LIMIT,
  FieldValue,
  HANDLE_CHANGE_COOLDOWN_MS,
  HANDLE_RE,
  SocialError,
  blockedByIds,
  blockedIds,
  cleanStr,
  colorFor,
  db,
  friendCount,
  friendIds,
  getProfile,
  getProfiles,
  hiddenIds,
  makeFriends,
  publicProfile,
  relation,
  requireProfile,
  unfriend,
};
