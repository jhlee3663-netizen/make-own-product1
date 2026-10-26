/* 알림 목록(users/{uid}/notifications)과 폰 알림(FCM).
   같은 대상의 박수는 문서 하나에 묶는다. 폰 알림 켜짐/꺼짐은 profiles/{uid}.push[type]. */
const { getMessaging } = require('firebase-admin/messaging');
const { db, getProfile, publicProfile } = require('./store');

/* 종류별 폰 알림 기본값 (IA 11장) */
const PUSH_DEFAULTS = {
  friendWorkout: false,
  clap: false,
  comment: true,
  routineImport: false,
  poke: true,
  friendRequest: true,
  friendAccepted: true,
  youtubeDone: true,
};

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function sendPush(uid, type, title, body, link) {
  const profile = await getProfile(uid);
  const prefs = { ...PUSH_DEFAULTS, ...(profile?.push || {}) };
  if (!prefs[type]) return;
  const tokensSnap = await db().collection(`users/${uid}/pushTokens`).limit(10).get();
  const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
  if (!tokens.length) return;
  try {
    const result = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { link: link || '/' },
      webpush: { fcmOptions: { link: link || '/' } },
    });
    /* 만료된 토큰은 지운다 */
    const stale = [];
    result.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) stale.push(tokensSnap.docs[i].ref);
    });
    await Promise.all(stale.map((ref) => ref.delete()));
  } catch (error) {
    console.error('push failed', { uid, type, code: error.code });
  }
}

/* 알림 하나 남기기. from이 있으면 이름·색을 같이 저장해 목록에서 바로 그린다. */
async function notify(toUid, { type, fromUid = null, text, quote = '', target = null, actions = null, groupKey = null }) {
  if (!toUid || toUid === fromUid) return;
  const from = fromUid ? publicProfile(fromUid, await getProfile(fromUid)) : null;
  const col = db().collection(`users/${toUid}/notifications`);
  const ref = groupKey ? col.doc(groupKey) : col.doc();
  const now = Date.now();
  const data = {
    type,
    text,
    quote: quote ? String(quote).slice(0, 80) : '',
    target,
    actions,
    from: from ? { uid: from.uid, name: from.name, handle: from.handle, color: from.color, photoUrl: /^https:\/\//.test(from.photoUrl) ? from.photoUrl : '' } : null,
    at: now,
    read: false,
  };
  if (groupKey) {
    const prev = await ref.get();
    const names = prev.exists ? (prev.data().names || []) : [];
    const nextNames = [from?.name, ...names.filter((n) => n !== from?.name)].filter(Boolean).slice(0, 5);
    data.names = nextNames;
    data.count = prev.exists ? Number(prev.data().count || 1) + (names.includes(from?.name) ? 0 : 1) : 1;
  }
  await ref.set(data);
  const pushTitle = 'Context Health';
  await sendPush(toUid, type, pushTitle, text, target?.link);
}

/* 30일 지난 알림 정리 (목록을 열 때 같이 한다) */
async function pruneOld(uid) {
  const snap = await db().collection(`users/${uid}/notifications`).where('at', '<', Date.now() - MAX_AGE_MS).limit(100).get();
  if (snap.empty) return;
  const batch = db().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

module.exports = { PUSH_DEFAULTS, notify, pruneOld };
