/* 피드·친구 API. Hosting rewrite로 /api/social/** 가 이 함수 하나로 들어온다.
   POST /api/social/{action}  (Authorization: Bearer <Firebase ID 토큰>)
   초대 미리보기(invite-preview)만 로그인 없이 부를 수 있다.

   대상 키(key): log:{기록 id} · cur:{큐레이션 id} · post:{피드 글 id} · rt:{루틴 id}
   - claps/{key}__{uid}   박수
   - comments/{id}        댓글 { key, uid, text, at }
   - counters/{key}       박수·댓글·가져가기 수
   - feedPosts/{id}       유튜브 루틴을 피드에 올린 글 { uid, videoId, caption, at }
   - routines/{id}        내 루틴 { uid, title, parts, items, memo, status: draft|public, draftKey }
   - invites/{code}       초대 링크 { uid, at, expiresAt }
   - pokes/{from}_{to}_{date} 콕 찌르기(하루 1번) */
const crypto = require('crypto');
const { getAuth } = require('firebase-admin/auth');
const { kstDateKey } = require('../mcp/parse');
const S = require('./store');
const W = require('./workouts');
const { findCuration, publishedCurations } = require('./curations');
const { notify, pruneOld, PUSH_DEFAULTS } = require('./notify');
const { importVideo, parseVideoId } = require('./youtube');

const { FieldPath } = require('firebase-admin/firestore');
const { db, SocialError, FieldValue } = S;
const { CURATOR_UIDS } = require('./curator');
const { rankPosts } = require('./recommend');
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLIC_ACTIONS = new Set(['invite-preview']);

/* ── 공통 ── */

function counterRef(key) {
  return db().doc(`counters/${key.replace(/\//g, '_')}`);
}

async function counts(keys, uid) {
  const unique = [...new Set(keys)];
  if (!unique.length) return {};
  const snaps = await db().getAll(...unique.map(counterRef), ...unique.map((k) => db().doc(`claps/${k}__${uid}`)));
  const out = {};
  unique.forEach((k, i) => {
    const c = snaps[i].exists ? snaps[i].data() : {};
    out[k] = { claps: c.claps || 0, comments: c.comments || 0, imports: c.imports || 0, clapped: snaps[unique.length + i].exists };
  });
  return out;
}

function visibilityOf(profile) {
  return { ...S.DEFAULT_VISIBILITY, ...(profile?.visibility || {}) };
}

/* 대상 키의 주인과, 내가 볼 수 있는지 */
async function resolveTarget(uid, key) {
  const [kind, id] = String(key || '').split(':');
  if (!id) throw new SocialError('bad-key');
  if (kind === 'cur') {
    const c = findCuration(id);
    if (!c) throw new SocialError('not-found', 404);
    return { kind, id, owner: null, data: c };
  }
  if (kind === 'log') {
    const snap = await db().doc(`logs/${id}`).get();
    const d = snap.exists ? snap.data() : null;
    const isDiet = d?.type === 'diet' && !d.deletedAt && !d.hiddenFromFriends;
    if (!d || (!W.isShareableWorkout(d) && !isDiet)) throw new SocialError('not-found', 404);
    const owner = d.uid;
    if (owner !== uid) {
      const [rel, profile] = await Promise.all([S.relation(uid, owner), S.getProfile(owner)]);
      if (rel !== 'friend' || !visibilityOf(profile)[isDiet ? 'diet' : 'workout']) throw new SocialError('not-found', 404);
    }
    return { kind, id, owner, data: snap.data() };
  }
  if (kind === 'post') {
    const snap = await db().doc(`feedPosts/${id}`).get();
    if (!snap.exists) throw new SocialError('not-found', 404);
    const owner = snap.data().uid;
    if (owner !== uid && (await S.hiddenIds(uid)).has(owner)) throw new SocialError('not-found', 404);
    return { kind, id, owner, data: snap.data() };
  }
  if (kind === 'yt') {
    const snap = await db().doc(`youtubeRoutines/${id.slice(0, 11)}`).get();
    if (!snap.exists || snap.data().status !== 'done') throw new SocialError('not-found', 404);
    return { kind, id, owner: null, data: snap.data() };
  }
  if (kind === 'rt') {
    const snap = await db().doc(`routines/${id}`).get();
    if (!snap.exists) throw new SocialError('not-found', 404);
    const owner = snap.data().uid;
    if (owner !== uid) {
      if (snap.data().status !== 'public') throw new SocialError('not-found', 404);
      const rel = await S.relation(uid, owner);
      if (rel === 'blocked' || rel === 'blockedBy' || rel === 'gone') throw new SocialError('not-found', 404);
    }
    return { kind, id, owner, data: snap.data() };
  }
  throw new SocialError('bad-key');
}

function routineView(id, data) {
  return {
    id,
    uid: data.uid,
    title: data.title,
    parts: data.parts || [],
    items: data.items || [],
    memo: data.memo || '',
    status: data.status,
    draftKey: data.draftKey || null,
    at: data.updatedAt || data.at || 0,
    sessionCount: data.sessionCount || null,
  };
}

/* ── 프로필 ── */

async function me(uid) {
  const profile = await S.getProfile(uid);
  pruneOld(uid).catch(() => {});
  const [requests, unread] = await Promise.all([
    db().collection('friendRequests').where('to', '==', uid).count().get(),
    db().collection(`users/${uid}/notifications`).where('read', '==', false).count().get(),
  ]);
  return {
    profile: profile ? {
      ...S.publicProfile(uid, profile),
      visibility: visibilityOf(profile),
      push: { ...PUSH_DEFAULTS, ...(profile.push || {}) },
      handleChangedAt: profile.handleChangedAt || 0,
      friendCount: await S.friendCount(uid),
    } : null,
    requestCount: requests.data().count,
    unreadCount: unread.data().count,
  };
}

function checkHandleFormat(handle) {
  if (!S.HANDLE_RE.test(handle)) return 'format';
  if (/^[._]|[._]$/.test(handle) || /\.\./.test(handle)) return 'format';
  return null;
}

async function handleCheck(uid, { handle }) {
  const h = String(handle || '').toLowerCase().trim();
  const bad = checkHandleFormat(h);
  if (bad) return { available: false, reason: bad };
  const snap = await db().doc(`handles/${h}`).get();
  if (snap.exists && snap.data().uid !== uid) {
    const suggestions = [];
    for (let i = 2; suggestions.length < 2 && i < 9; i += 1) {
      const alt = `${h}${i}`.slice(0, 20);
      const altSnap = await db().doc(`handles/${alt}`).get();
      if (!altSnap.exists) suggestions.push(alt);
    }
    if (suggestions.length < 2 && !h.includes('.')) suggestions.push(`${h.slice(0, 18)}.${Math.floor(Math.random() * 9) + 1}`);
    return { available: false, reason: 'taken', suggestions };
  }
  return { available: true };
}

async function profileSave(uid, body) {
  const ref = db().doc(`profiles/${uid}`);
  const handle = body.handle != null ? String(body.handle).toLowerCase().trim() : null;
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    const next = { updatedAt: Date.now() };
    if (!snap.exists) {
      next.createdAt = Date.now();
      next.color = S.colorFor(uid);
      next.visibility = { ...S.DEFAULT_VISIBILITY };
    }
    if (handle != null && handle !== prev.handle) {
      if (checkHandleFormat(handle)) throw new SocialError('handle-format');
      if (prev.handleChangedAt && Date.now() - prev.handleChangedAt < S.HANDLE_CHANGE_COOLDOWN_MS) {
        throw new SocialError('handle-cooldown', 409, { until: prev.handleChangedAt + S.HANDLE_CHANGE_COOLDOWN_MS });
      }
      const hRef = db().doc(`handles/${handle}`);
      const hSnap = await tx.get(hRef);
      if (hSnap.exists && hSnap.data().uid !== uid) throw new SocialError('handle-taken', 409);
      tx.set(hRef, { uid });
      if (prev.handle) tx.delete(db().doc(`handles/${prev.handle}`));
      next.handle = handle;
      if (prev.handle) next.handleChangedAt = Date.now();
    }
    if (!prev.handle && !next.handle) throw new SocialError('handle-required');
    if (body.name != null) next.name = S.cleanStr(body.name, 12) || prev.name || '사용자';
    if (body.bio != null) next.bio = S.cleanStr(body.bio, 40);
    /* 사진은 앱에서 160px로 줄인 JPEG(data URL, 60KB 이하)이나 https 주소만 받는다 */
    if (body.photoUrl != null) {
      const url = String(body.photoUrl);
      next.photoUrl = /^https:\/\//.test(url) && url.length <= 500 ? url
        : /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= 60000 ? url : '';
    }
    if (body.color != null && S.AVATAR_COLORS.includes(body.color)) next.color = body.color;
    if (body.visibility && typeof body.visibility === 'object') {
      const v = { ...visibilityOf(prev) };
      ['workout', 'best', 'diet', 'weight'].forEach((k) => { if (typeof body.visibility[k] === 'boolean') v[k] = body.visibility[k]; });
      next.visibility = v;
    }
    if (body.push && typeof body.push === 'object') {
      const p = { ...PUSH_DEFAULTS, ...(prev.push || {}) };
      Object.keys(PUSH_DEFAULTS).forEach((k) => { if (typeof body.push[k] === 'boolean') p[k] = body.push[k]; });
      next.push = p;
    }
    tx.set(ref, next, { merge: true });
    return { ok: true };
  });
}

/* 다른 사람 프로필. 관계에 따라 보이는 것이 다르다 (IA 4-2). */
async function profileView(uid, { uid: targetUid, handle }) {
  let target = targetUid;
  if (!target && handle) {
    const h = await db().doc(`handles/${String(handle).toLowerCase()}`).get();
    target = h.exists ? h.data().uid : null;
  }
  if (!target) throw new SocialError('not-found', 404);
  const rel = await S.relation(uid, target);
  if (rel === 'gone') return { relation: 'gone', profile: S.publicProfile(target, null) };
  if (rel === 'blockedBy') return { relation: 'blockedBy', profile: { uid: target, name: '찾을 수 없는 사용자', handle: '', color: '#ADB5BD' } };
  const data = await S.getProfile(target);
  const profile = S.publicProfile(target, data);
  if (rel === 'blocked') return { relation: 'blocked', profile: { uid: target, name: profile.name, handle: profile.handle, color: profile.color } };

  const vis = visibilityOf(data);
  const canSeeRecords = rel === 'self' || (rel === 'friend' && vis.workout);
  const canSeeBest = rel === 'self' || (rel === 'friend' && vis.best);
  const routineQuery = db().collection('routines').where('uid', '==', target);
  const [workoutCount, dietCount, friendCount, routinesSnap] = await Promise.all([
    db().collection('logs').where('uid', '==', target).where('type', '==', 'workout').count().get(),
    db().collection('logs').where('uid', '==', target).where('type', '==', 'diet').count().get(),
    S.friendCount(target),
    routineQuery.get(),
  ]);
  const routines = routinesSnap.docs
    .map((d) => routineView(d.id, d.data()))
    .filter((r) => rel === 'self' || r.status === 'public')
    .sort((a, b) => b.at - a.at);

  const out = {
    relation: rel,
    profile,
    stats: {
      workouts: (rel === 'self' || rel === 'friend') && vis.workout ? workoutCount.data().count : null,
      routines: routines.filter((r) => r.status === 'public').length,
      /* 프로필 숫자: 운동 · 식단 · 친구 (식단은 공개 범위에서 켰을 때만) */
      diets: rel === 'self' || (rel === 'friend' && vis.diet) ? dietCount.data().count : null,
      friends: rel === 'self' || rel === 'friend' ? friendCount : null,
    },
    routines,
    visibility: rel === 'self' ? vis : undefined,
  };
  if (rel === 'friend' || rel === 'self') {
    const since = (await db().doc(`users/${uid}/friends/${target}`).get()).data()?.since || null;
    out.friendSince = since;
  }
  if (canSeeRecords) {
    const [recent, week] = await Promise.all([W.recentWorkouts(target, { days: 30, limit: 30 }), W.weekWorkoutDays(target)]);
    out.workouts = recent.slice(0, 10);
    out.week = week;
    const keys = out.workouts.map((w) => `log:${w.id}`);
    out.counts = await counts(keys, uid);
  }
  if (canSeeBest) out.best = await W.bestRecords(target, rel === 'self' ? [] : (data?.hiddenBest || []));
  /* 식단 탭: 본인, 또는 식단을 공개한 친구 */
  if (rel === 'self' || (rel === 'friend' && vis.diet)) out.diets = await W.recentDiets(target);
  /* 최근 24시간 안에 올린 스토리가 있으면 프로필 사진에 링을 띄운다 */
  if (rel === 'self' || rel === 'friend') out.hasStory = (await W.storyItems(target, rel === 'self' ? {} : vis)).length > 0;
  if (rel === 'self') {
    const existing = new Set([...routines.map((r) => r.draftKey).filter(Boolean), ...(data?.dismissedDrafts || [])]);
    out.drafts = await W.routineDrafts(uid, existing);
    out.hiddenBest = data?.hiddenBest || [];
  }
  if (rel === 'incoming' || rel === 'requested' || rel === 'none') {
    out.publicRoutineCount = routines.length;
  }
  return out;
}

/* ── 검색 ── */

async function search(uid, { q, tab = 'people' }) {
  const query = String(q || '').trim().toLowerCase().slice(0, 30);
  if (!query) return { results: [] };
  const hidden = await S.hiddenIds(uid);
  if (tab === 'people') {
    const friends = await S.friendIds(uid);
    const fProfiles = await S.getProfiles(friends);
    const mine = friends
      .map((f) => S.publicProfile(f, fProfiles[f]))
      .filter((p) => !p.gone && (p.name.toLowerCase().includes(query) || p.handle.includes(query)));
    const h = query.replace(/^@/, '');
    const snap = await db().collection('handles')
      .orderBy(FieldPath.documentId()).startAt(h).endAt(`${h}`).limit(10).get();
    const others = snap.docs.map((d) => d.data().uid)
      .filter((o) => o !== uid && !friends.includes(o) && !hidden.has(o));
    const oProfiles = await S.getProfiles(others);
    const rels = await Promise.all(others.map((o) => S.relation(uid, o)));
    return {
      friends: mine.map((p) => ({ ...p, relation: 'friend' })),
      others: others.map((o, i) => ({ ...S.publicProfile(o, oProfiles[o]), relation: rels[i] })).filter((p) => !p.gone),
    };
  }
  if (tab === 'routines') {
    const cur = publishedCurations().filter((c) => c.kind === 'routine' && (c.title.toLowerCase().includes(query) || (c.parts || []).join(' ').includes(query) || c.items.some((i) => i.name.includes(query))))
      .map((c) => ({ kind: 'cur', id: c.id, title: c.title.replace(/\n/g, ' '), sub: c.summary }));
    const yt = await db().collection('youtubeRoutines').where('status', '==', 'done').orderBy('at', 'desc').limit(200).get();
    const ytHits = yt.docs.map((d) => d.data())
      .filter((r) => `${r.routineTitle} ${r.title} ${(r.parts || []).join(' ')} ${(r.items || []).map((i) => i.name).join(' ')}`.toLowerCase().includes(query))
      .slice(0, 10)
      .map((r) => ({ kind: 'yt', id: r.videoId, title: r.routineTitle || r.title, sub: `유튜브 · ${r.channelName} · ${r.items.length}종목`, thumbnail: r.thumbnail }));
    const friends = await S.friendIds(uid);
    const fr = [];
    for (let i = 0; i < friends.length; i += 30) {
      const snap = await db().collection('routines').where('uid', 'in', friends.slice(i, i + 30)).where('status', '==', 'public').get();
      snap.docs.forEach((d) => fr.push(routineView(d.id, d.data())));
    }
    const fProfiles = await S.getProfiles(fr.map((r) => r.uid));
    const frHits = fr.filter((r) => `${r.title} ${r.parts.join(' ')} ${r.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(query))
      .map((r) => ({ kind: 'rt', id: r.id, title: r.title, sub: `${S.publicProfile(r.uid, fProfiles[r.uid]).name} · ${r.items.length}종목` }));
    return { results: [...frHits, ...cur, ...ytHits] };
  }
  if (tab === 'channels') {
    const yt = await db().collection('youtubeRoutines').where('status', '==', 'done').orderBy('at', 'desc').limit(300).get();
    const map = new Map();
    yt.docs.forEach((d) => {
      const r = d.data();
      if (!String(r.channelName || '').toLowerCase().includes(query)) return;
      const prev = map.get(r.channelId) || { channelId: r.channelId, name: r.channelName, routines: 0 };
      prev.routines += 1;
      map.set(r.channelId, prev);
    });
    return { results: [...map.values()].slice(0, 20) };
  }
  throw new SocialError('bad-tab');
}

/* ── 친구 ── */

async function listFriends(uid) {
  const snap = await db().collection(`users/${uid}/friends`).get();
  const ids = snap.docs.map((d) => d.id);
  const profiles = await S.getProfiles(ids);
  return {
    friends: snap.docs.map((d) => ({ ...S.publicProfile(d.id, profiles[d.id]), since: d.data().since }))
      .filter((p) => !p.gone)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  };
}

async function listRequests(uid) {
  const snap = await db().collection('friendRequests').where('to', '==', uid).get();
  const profiles = await S.getProfiles(snap.docs.map((d) => d.data().from));
  return {
    requests: snap.docs.map((d) => ({ ...S.publicProfile(d.data().from, profiles[d.data().from]), at: d.data().at }))
      .filter((p) => !p.gone)
      .sort((a, b) => b.at - a.at),
  };
}

async function listBlocks(uid) {
  const snap = await db().collection(`users/${uid}/blocks`).get();
  const profiles = await S.getProfiles(snap.docs.map((d) => d.id));
  return {
    blocks: snap.docs.map((d) => ({ uid: d.id, name: profiles[d.id]?.name || '탈퇴한 사용자', handle: profiles[d.id]?.handle || '', color: '#ADB5BD', at: d.data().at }))
      .sort((a, b) => b.at - a.at),
  };
}

async function friendRequest(uid, { uid: to }) {
  if (CURATOR_UIDS.has(to)) throw new SocialError('not-allowed', 403);
  await S.requireProfile(uid);
  const rel = await S.relation(uid, to);
  if (rel === 'friend') return { relation: 'friend' };
  if (rel === 'requested') return { relation: 'requested' };
  if (rel === 'gone' || rel === 'blockedBy' || rel === 'blocked' || rel === 'self') throw new SocialError('not-allowed', 403);
  if (rel === 'incoming') {
    /* 서로 동시에 요청하면 바로 친구 */
    await S.makeFriends(uid, to);
    await notify(to, { type: 'friendAccepted', fromUid: uid, text: `${(await S.getProfile(uid)).name}님과 친구가 됐어요`, target: { kind: 'profile', uid } });
    return { relation: 'friend' };
  }
  const decline = await db().doc(`friendDeclines/${uid}_${to}`).get();
  if (decline.exists && Date.now() - decline.data().at < S.DECLINE_COOLDOWN_MS) {
    /* 거절 사실을 알리지 않는다. 요청은 보낸 것처럼 보이고 실제로는 저장하지 않는다. */
    return { relation: 'requested' };
  }
  if (await S.friendCount(uid) >= S.FRIEND_LIMIT) throw new SocialError('friend-limit-self', 409);
  await db().doc(`friendRequests/${uid}_${to}`).set({ from: uid, to, at: Date.now() });
  const me2 = await S.getProfile(uid);
  await notify(to, {
    type: 'friendRequest', fromUid: uid, text: `${me2.handle}님이 친구 요청을 보냈어요`,
    target: { kind: 'profile', uid }, actions: ['decline', 'accept'], groupKey: `req_${uid}`,
  });
  return { relation: 'requested' };
}

async function friendCancel(uid, { uid: to }) {
  await db().doc(`friendRequests/${uid}_${to}`).delete();
  await db().doc(`users/${to}/notifications/req_${uid}`).delete().catch(() => {});
  return { relation: 'none' };
}

async function friendAccept(uid, { uid: from }) {
  await S.requireProfile(uid);
  const req = await db().doc(`friendRequests/${from}_${uid}`).get();
  if (!req.exists) {
    const rel = await S.relation(uid, from);
    if (rel === 'friend') return { relation: 'friend' };
    throw new SocialError('request-gone', 404);
  }
  await S.makeFriends(uid, from);
  await db().doc(`users/${uid}/notifications/req_${from}`).set({ resolved: 'accepted', read: true }, { merge: true });
  const mine = await S.getProfile(uid);
  await notify(from, { type: 'friendAccepted', fromUid: uid, text: `${mine.name}님과 친구가 됐어요`, target: { kind: 'profile', uid } });
  return { relation: 'friend' };
}

async function friendDecline(uid, { uid: from }) {
  const batch = db().batch();
  batch.delete(db().doc(`friendRequests/${from}_${uid}`));
  batch.set(db().doc(`friendDeclines/${from}_${uid}`), { at: Date.now() });
  batch.set(db().doc(`users/${uid}/notifications/req_${from}`), { resolved: 'declined', read: true }, { merge: true });
  await batch.commit();
  return { relation: 'none' };
}

async function friendRemove(uid, { uid: other }) {
  await S.unfriend(uid, other);
  return { relation: 'none' };
}

async function block(uid, { uid: other }) {
  if (uid === other) throw new SocialError('not-allowed');
  await S.unfriend(uid, other);
  const batch = db().batch();
  batch.set(db().doc(`users/${uid}/blocks/${other}`), { at: Date.now(), target: other });
  batch.delete(db().doc(`friendRequests/${uid}_${other}`));
  batch.delete(db().doc(`friendRequests/${other}_${uid}`));
  batch.delete(db().doc(`users/${uid}/notifications/req_${other}`));
  await batch.commit();
  return { relation: 'blocked' };
}

async function unblock(uid, { uid: other }) {
  await db().doc(`users/${uid}/blocks/${other}`).delete();
  return { relation: 'none' };
}

async function poke(uid, { uid: to }) {
  if (await S.relation(uid, to) !== 'friend') throw new SocialError('not-allowed', 403);
  const ref = db().doc(`pokes/${uid}_${to}_${kstDateKey(Date.now())}`);
  const created = await db().runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, { at: Date.now() });
    return true;
  });
  if (!created) return { ok: false, reason: 'already' };
  const mine = await S.getProfile(uid);
  await notify(to, { type: 'poke', fromUid: uid, text: `${mine.name}님이 콕 찔렀어요. 오늘 운동 어때요?`, target: { kind: 'profile', uid } });
  return { ok: true };
}

/* ── 초대 링크 ── */

async function inviteCreate(uid, { renew = false } = {}) {
  await S.requireProfile(uid);
  const profile = await S.getProfile(uid);
  if (!renew && profile.inviteCode) {
    const snap = await db().doc(`invites/${profile.inviteCode}`).get();
    if (snap.exists && snap.data().expiresAt > Date.now()) return { code: profile.inviteCode, expiresAt: snap.data().expiresAt };
  }
  const code = `${profile.handle.replace(/[^a-z0-9]/g, '').slice(0, 10)}-${crypto.randomBytes(3).toString('base64url')}`;
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const batch = db().batch();
  if (profile.inviteCode) batch.delete(db().doc(`invites/${profile.inviteCode}`));
  batch.set(db().doc(`invites/${code}`), { uid, at: Date.now(), expiresAt });
  batch.set(db().doc(`profiles/${uid}`), { inviteCode: code }, { merge: true });
  await batch.commit();
  return { code, expiresAt };
}

async function invitePreview(_uid, { code }) {
  const snap = await db().doc(`invites/${String(code || '').slice(0, 40)}`).get();
  if (!snap.exists) return { status: 'invalid' };
  const inviter = snap.data().uid;
  const profile = await S.getProfile(inviter);
  if (!profile) return { status: 'gone' };
  const week = await W.weekWorkoutDays(inviter);
  return {
    status: snap.data().expiresAt < Date.now() ? 'expired' : 'ok',
    inviter: { ...S.publicProfile(inviter, profile), weekCount: Object.keys(week.days).length },
  };
}

async function inviteAccept(uid, { code }) {
  await S.requireProfile(uid);
  const snap = await db().doc(`invites/${String(code || '').slice(0, 40)}`).get();
  if (!snap.exists) return { status: 'invalid' };
  const inviter = snap.data().uid;
  if (inviter === uid) return { status: 'self' };
  const rel = await S.relation(uid, inviter);
  if (rel === 'gone' || rel === 'blockedBy' || rel === 'blocked') return { status: 'unavailable' };
  if (rel === 'friend') return { status: 'already', uid: inviter };
  if (snap.data().expiresAt < Date.now()) return { status: 'expired', uid: inviter };
  try {
    await S.makeFriends(uid, inviter);
  } catch (error) {
    if (error.code === 'friend-limit-self') return { status: 'limit-self' };
    if (error.code === 'friend-limit-other') return { status: 'limit-other' };
    throw error;
  }
  const mine = await S.getProfile(uid);
  await notify(inviter, { type: 'friendAccepted', fromUid: uid, text: `${mine.name}님과 친구가 됐어요`, target: { kind: 'profile', uid } });
  return { status: 'ok', uid: inviter };
}

/* ── 피드 ── */

const SHOWN_TOP = 12; // 한 번 불러올 때 위쪽 몇 개를 '본 글'로 기억할지
const SHOWN_KEEP_MS = 24 * 60 * 60 * 1000;

/* 큐레이터 글을 스토리 한 장으로 */
function curatorStoryItem(id, post, video) {
  const diet = video.kind === 'diet';
  return {
    type: 'youtube',
    id,
    key: `post:${id}`,
    at: post.at,
    kind: diet ? 'diet' : 'workout',
    title: video.routineTitle || video.title || '',
    channelName: video.channelName || '',
    caption: post.caption || '',
    exercises: diet ? [] : (video.items || []).map((it) => ({ name: it.name, sets: `${it.sets}세트 × ${it.reps}` })),
    exerciseCount: diet ? 0 : (video.items || []).length,
    meals: diet ? (video.meals || []).map((m) => ({ name: m.name, foods: (m.foods || []).map((f) => f.name).join(', ') })) : [],
    kcal: diet ? Math.round(video.totals?.kcal || 0) : 0,
  };
}

/* refresh: 당겨서 새로고침. 지난번에 위쪽에서 보여준 글을 아래로 내려 새 글이 먼저 보이게 한다. */
async function feed(uid, { refresh = false } = {}) {
  const shownRef = db().doc(`users/${uid}/prefs/feedShown`);
  const hiddenKeysRef = db().doc(`users/${uid}/prefs/feedHidden`);
  const [friends, hidden, myProfile] = await Promise.all([S.friendIds(uid), S.hiddenIds(uid), S.getProfile(uid)]);
  const friendProfiles = await S.getProfiles(friends);
  const sharing = friends.filter((f) => friendProfiles[f] && visibilityOf(friendProfiles[f]).workout);
  /* 스토리는 운동이나 식단 중 하나라도 공개한 친구 */
  const storyFriends = friends.filter((f) => friendProfiles[f] && (visibilityOf(friendProfiles[f]).workout || visibilityOf(friendProfiles[f]).diet));

  const [mine, friendLogs, storyLists, shownSnap] = await Promise.all([
    W.storyItems(uid),
    Promise.all(sharing.map((f) => W.recentWorkouts(f, { days: 7, limit: 10 }))),
    Promise.all(storyFriends.map((f) => W.storyItems(f, visibilityOf(friendProfiles[f])))),
    shownRef.get().catch(() => null),
  ]);
  const shown = shownSnap?.exists ? shownSnap.data().keys || {} : {};
  const hiddenSnap = await hiddenKeysRef.get().catch(() => null);
  const hiddenKeys = new Set(Object.keys(hiddenSnap?.exists ? hiddenSnap.data().keys || {} : {}));

  const stories = [];
  if (myProfile?.handle) stories.push({ ...S.publicProfile(uid, myProfile), self: true, hasToday: mine.length > 0, latestAt: mine[mine.length - 1]?.at || 0, storyKey: mine.length ? `${uid}_${mine[mine.length - 1].at}` : '' });
  storyFriends.forEach((f, i) => {
    const items = storyLists[i];
    if (items.length) stories.push({ ...S.publicProfile(f, friendProfiles[f]), latestAt: items[items.length - 1].at, storyKey: `${f}_${items[items.length - 1].at}` });
  });

  const posts = [];
  publishedCurations().forEach((c) => posts.push({ key: `cur:${c.id}`, kind: c.kind === 'diet' ? 'cur-diet' : 'cur-routine', at: c.publishedAt, curation: c }));
  sharing.forEach((f, i) => friendLogs[i].forEach((w) => posts.push({ key: `log:${w.id}`, kind: 'friend-log', at: w.at, author: S.publicProfile(f, friendProfiles[f]), workout: w })));

  for (let i = 0; i < friends.length; i += 30) {
    const snap = await db().collection('routines').where('uid', 'in', friends.slice(i, i + 30)).where('status', '==', 'public').get();
    snap.docs.forEach((d) => {
      const r = routineView(d.id, d.data());
      if (Date.now() - r.at > 30 * W.DAY_MS) return;
      posts.push({ key: `rt:${r.id}`, kind: 'friend-routine', at: r.at, author: S.publicProfile(r.uid, friendProfiles[r.uid]), routine: r });
    });
  }

  const ytSnap = await db().collection('feedPosts').orderBy('at', 'desc').limit(120).get();
  const ytPosts = ytSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !hidden.has(p.uid));
  const videoSnaps = ytPosts.length ? await db().getAll(...ytPosts.map((p) => db().doc(`youtubeRoutines/${p.videoId}`))) : [];
  const authorProfiles = await S.getProfiles(ytPosts.map((p) => p.uid));
  ytPosts.forEach((p, i) => {
    if (!videoSnaps[i]?.exists) return;
    posts.push({ key: `post:${p.id}`, kind: 'youtube', at: p.at, author: { ...S.publicProfile(p.uid, authorProfiles[p.uid]), official: CURATOR_UIDS.has(p.uid) }, caption: p.caption || '', video: videoSnaps[i].data(), mine: p.uid === uid });
  });

  /* 큐레이터가 최근 24시간 안에 올린 글은 스토리로도 보인다 (친구 스토리 뒤) */
  const storySince = Date.now() - W.STORY_MS;
  const curatorStories = new Map();
  ytPosts.forEach((p, i) => {
    if (!CURATOR_UIDS.has(p.uid) || p.at < storySince || !videoSnaps[i]?.exists) return;
    const prev = curatorStories.get(p.uid);
    if (!prev || p.at > prev.latestAt) curatorStories.set(p.uid, { ...S.publicProfile(p.uid, authorProfiles[p.uid]), official: true, latestAt: p.at, storyKey: `${p.uid}_${p.at}` });
  });
  stories.push(...[...curatorStories.values()].sort((a, b) => b.latestAt - a.latestAt));

  /* 맞춤 순서 (functions/social/recommend.js): 최근 140개 후보의 박수·가져가기 수를 읽고 점수를 매긴다 */
  posts.sort((a, b) => b.at - a.at);
  const pool = posts.filter((p) => !hiddenKeys.has(p.key)).slice(0, 140);
  const poolCounts = await counts(pool.map((p) => p.key), uid);
  const ranked = await rankPosts(uid, pool, poolCounts, { shown: refresh ? shown : null });
  const list = ranked.slice(0, 50);

  /* 이번에 위쪽에 보여준 글을 기억해 둔다 (다음 새로고침 때 아래로) */
  const now = Date.now();
  const nextShown = Object.fromEntries(Object.entries(shown).filter(([, at]) => now - at < SHOWN_KEEP_MS));
  list.slice(0, SHOWN_TOP).forEach((p) => { nextShown[p.key] = now; });
  shownRef.set({ keys: nextShown }).catch(() => {});
  const listCounts = Object.fromEntries(list.map((p) => [p.key, poolCounts[p.key]]));

  return {
    hasProfile: Boolean(myProfile?.handle),
    friendCount: friends.length,
    stories,
    posts: list,
    counts: listCounts,
  };
}

/* 큐레이터 스토리: 최근 24시간 동안 올린 글을 올린 순서대로 */
async function curatorStory(uid, target) {
  if ((await S.hiddenIds(uid)).has(target)) throw new SocialError('not-found', 404);
  const snap = await db().collection('feedPosts').where('at', '>=', Date.now() - W.STORY_MS).get();
  const posts = snap.docs.filter((d) => d.data().uid === target).map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at);
  const [videos, profile] = await Promise.all([
    posts.length ? db().getAll(...posts.map((p) => db().doc(`youtubeRoutines/${p.videoId}`))) : [],
    S.getProfile(target),
  ]);
  const items = posts.map((p, i) => (videos[i]?.exists ? curatorStoryItem(p.id, p, videos[i].data()) : null)).filter(Boolean);
  return { profile: { ...S.publicProfile(target, profile), official: true }, self: false, official: true, items, workouts: [], counts: await counts(items.map((x) => x.key), uid) };
}

async function story(uid, { uid: target }) {
  if (CURATOR_UIDS.has(target)) return curatorStory(uid, target);
  const rel = await S.relation(uid, target);
  if (rel !== 'self' && rel !== 'friend') throw new SocialError('not-found', 404);
  const profile = await S.getProfile(target);
  const vis = visibilityOf(profile);
  if (rel === 'friend' && !vis.workout && !vis.diet) throw new SocialError('not-found', 404);
  const items = await W.storyItems(target, rel === 'self' ? {} : vis);
  return { profile: S.publicProfile(target, profile), self: rel === 'self', items, workouts: items.filter((x) => x.type === 'workout'), counts: await counts(items.map((w) => `log:${w.id}`), uid) };
}

async function post(uid, { key }) {
  const t = await resolveTarget(uid, key);
  const commentSnap = await db().collection('comments').where('key', '==', key).orderBy('at', 'asc').limit(100).get();
  const hidden = await S.hiddenIds(uid);
  const commentDocs = commentSnap.docs.filter((d) => !hidden.has(d.data().uid));
  const profiles = await S.getProfiles([...commentDocs.map((d) => d.data().uid), t.owner]);
  const out = {
    key,
    kind: t.kind,
    owner: t.owner ? S.publicProfile(t.owner, profiles[t.owner]) : null,
    isMine: t.owner === uid,
    comments: commentDocs.map((d) => ({ id: d.id, ...d.data(), author: S.publicProfile(d.data().uid, profiles[d.data().uid]), mine: d.data().uid === uid })),
    counts: (await counts([key], uid))[key],
  };
  if (t.kind === 'cur') out.curation = t.data;
  if (t.kind === 'log' && t.data.type === 'workout') out.workout = W.workoutView(t.id, t.data);
  if (t.kind === 'log' && t.data.type === 'diet') out.diet = { id: t.id, kcal: Math.round(t.data.kcal || 0), carb: Math.round(t.data.carb || 0), protein: Math.round(t.data.protein || 0), fat: Math.round(t.data.fat || 0) };
  if (t.kind === 'rt') {
    out.routine = routineView(t.id, t.data);
    out.followers = await importersOf(key, uid);
    const rel = t.owner === uid ? 'self' : await S.relation(uid, t.owner);
    const ownerProfile = profiles[t.owner];
    if (rel === 'self' || (rel === 'friend' && visibilityOf(ownerProfile).workout)) {
      out.ownerWeights = await W.lastTopWeights(t.owner, out.routine.items.map((i) => i.name));
    }
  }
  if (t.kind === 'yt') {
    out.video = t.data;
    out.followers = await importersOf(key, uid);
  }
  if (t.kind === 'post') {
    const v = await db().doc(`youtubeRoutines/${t.data.videoId}`).get();
    out.video = v.exists ? v.data() : null;
    out.caption = t.data.caption || '';
  }
  if (t.kind === 'cur') out.followers = await importersOf(key, uid);
  return out;
}

/* "지훈 외 2명이 따라 하는 중" — 가져간 사람 중 내 친구 이름 하나 + 나머지 수 */
async function importersOf(key, uid) {
  const c = await counterRef(key).get();
  const total = c.exists ? c.data().imports || 0 : 0;
  if (!total) return { total: 0 };
  const recent = c.data().recent || [];
  const friends = new Set(await S.friendIds(uid));
  const friendUid = recent.find((u) => friends.has(u));
  const mine = recent.includes(uid);
  const name = friendUid ? S.publicProfile(friendUid, await S.getProfile(friendUid)).name : null;
  return { total, friendName: name, mine };
}

/* 박수. on(true/false)을 주면 그 상태로 맞추고(여러 번 눌러도 결과가 같다), 없으면 뒤집는다. */
async function clap(uid, { key, on: want }) {
  const t = await resolveTarget(uid, key);
  const ref = db().doc(`claps/${key}__${uid}`);
  let changed = false;
  const on = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const target = typeof want === 'boolean' ? want : !snap.exists;
    if (target === snap.exists) { changed = false; return snap.exists; }
    changed = true;
    if (snap.exists) {
      tx.delete(ref);
      tx.set(counterRef(key), { claps: FieldValue.increment(-1) }, { merge: true });
      return false;
    }
    tx.set(ref, { key, uid, owner: t.owner || null, at: Date.now() });
    tx.set(counterRef(key), { claps: FieldValue.increment(1) }, { merge: true });
    return true;
  });
  if (on && changed && t.owner && t.owner !== uid) {
    const mine = await S.getProfile(uid);
    const title = t.kind === 'log' ? (t.data.title || '운동') : t.kind === 'rt' ? t.data.title : '글';
    const prev = await db().doc(`users/${t.owner}/notifications/clap_${key}`).get();
    const others = prev.exists ? (prev.data().names || []).filter((n) => n !== mine?.name).length : 0;
    await notify(t.owner, {
      type: 'clap', fromUid: uid,
      text: others > 0 ? `${mine?.name || '친구'}님 외 ${others}명이 내 ${title}에 박수를 보냈어요` : `${mine?.name || '친구'}님이 내 ${title}에 박수를 보냈어요`,
      target: { kind: 'post', key }, groupKey: `clap_${key}`,
    });
  }
  return { clapped: on, counts: (await counts([key], uid))[key] };
}

async function commentAdd(uid, { key, text }) {
  await S.requireProfile(uid);
  const body = String(text || '').trim().slice(0, 300);
  if (!body) throw new SocialError('empty');
  const t = await resolveTarget(uid, key);
  const ref = db().collection('comments').doc();
  const batch = db().batch();
  batch.set(ref, { key, uid, owner: t.owner || null, text: body, at: Date.now() });
  batch.set(counterRef(key), { comments: FieldValue.increment(1) }, { merge: true });
  await batch.commit();
  const mine = await S.getProfile(uid);
  const target = { kind: 'post', key, commentId: ref.id };
  const title = t.kind === 'log' ? (t.data.title || '운동') : '글';
  if (t.owner && t.owner !== uid) {
    await notify(t.owner, { type: 'comment', fromUid: uid, text: `${mine.name}님이 내 ${title}에 댓글을 남겼어요`, quote: body, target });
  }
  /* @아이디 언급 */
  const mentions = [...new Set([...body.matchAll(/@([a-z0-9._]{3,20})/g)].map((m) => m[1]))].slice(0, 5);
  for (const h of mentions) {
    const hs = await db().doc(`handles/${h}`).get();
    const mu = hs.exists ? hs.data().uid : null;
    if (!mu || mu === uid || mu === t.owner) continue;
    if (await S.relation(uid, mu) !== 'friend') continue;
    await notify(mu, { type: 'comment', fromUid: uid, text: `${mine.name}님이 댓글에서 나를 불렀어요`, quote: body, target });
  }
  return { id: ref.id };
}

async function commentDelete(uid, { id }) {
  const ref = db().doc(`comments/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const c = snap.data();
  /* 내 댓글, 또는 내 기록에 달린 남의 댓글 */
  if (c.uid !== uid && c.owner !== uid) throw new SocialError('not-allowed', 403);
  const batch = db().batch();
  batch.delete(ref);
  batch.set(counterRef(c.key), { comments: FieldValue.increment(-1) }, { merge: true });
  await batch.commit();
  return { ok: true };
}

async function commentEdit(uid, { id, text }) {
  const ref = db().doc(`comments/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid) throw new SocialError('not-allowed', 403);
  const body = String(text || '').trim().slice(0, 300);
  if (!body) throw new SocialError('empty');
  await ref.update({ text: body, editedAt: Date.now() });
  return { ok: true };
}

/* 가져가기 기록: 수를 올리고, 친구 루틴·기록이면 주인에게 알린다 */
async function importRecord(uid, { key }) {
  const t = await resolveTarget(uid, key);
  await db().runTransaction(async (tx) => {
    const ref = counterRef(key);
    const snap = await tx.get(ref);
    const recent = snap.exists ? (snap.data().recent || []) : [];
    if (recent.includes(uid)) return;
    tx.set(ref, { imports: FieldValue.increment(1), recent: [uid, ...recent].slice(0, 50) }, { merge: true });
  });
  if (t.kind === 'post' || t.kind === 'yt') {
    const videoId = t.kind === 'yt' ? t.id.slice(0, 11) : t.data.videoId;
    await db().doc(`youtubeRoutines/${videoId}`).set({ imports: FieldValue.increment(1) }, { merge: true });
  }
  if (t.owner && t.owner !== uid && (t.kind === 'rt' || t.kind === 'log')) {
    const mine = await S.getProfile(uid);
    const title = t.kind === 'rt' ? t.data.title : (t.data.title || '운동');
    if (mine?.handle) await notify(t.owner, { type: 'routineImport', fromUid: uid, text: `${mine.name}님이 내 ${title}을 가져갔어요`, target: { kind: 'post', key } });
  }
  return { ok: true };
}

/* ── 유튜브 ── */

async function youtubeImport(uid, { url }, deps) {
  const started = Date.now();
  const result = await importVideo(url, {
    apiKey: process.env.GEMINI_KEY,
    upstreamBase: deps.aiUpstreamBase(),
    beforeAi: async () => {
      const quota = await deps.consumeAiQuota(uid);
      if (!quota.allowed) throw new SocialError('ai-rate-limited', 429, { retryAfterSeconds: quota.retryAfterSeconds });
    },
  });
  await db().doc(`users/${uid}/youtubeImports/${result.videoId}`).set({ at: Date.now() }, { merge: true });
  /* 오래 걸린 정리는 끝났다고 알림을 남긴다 (화면을 나갔을 수 있다) */
  if (!result.cached && Date.now() - started > 15000) {
    await notify(uid, {
      type: 'youtubeDone', text: `${result.routineTitle} 정리가 끝났어요`, quote: `${result.items.length}종목`,
      target: { kind: 'youtube', videoId: result.videoId },
    });
  }
  return { video: result };
}

async function youtubeGet(_uid, { videoId }) {
  const snap = await db().doc(`youtubeRoutines/${String(videoId || '').slice(0, 11)}`).get();
  if (!snap.exists || snap.data().status !== 'done') throw new SocialError('not-found', 404);
  return { video: snap.data() };
}

async function youtubePublish(uid, { videoId, caption }) {
  await S.requireProfile(uid);
  const id = parseVideoId(videoId);
  const v = await db().doc(`youtubeRoutines/${id}`).get();
  if (!v.exists || v.data().status !== 'done') throw new SocialError('not-found', 404);
  const existing = await db().collection('feedPosts').where('uid', '==', uid).where('videoId', '==', id).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({ caption: S.cleanStr(caption, 200), editedAt: Date.now() });
    return { id: existing.docs[0].id };
  }
  const ref = db().collection('feedPosts').doc();
  await ref.set({ uid, videoId: id, caption: S.cleanStr(caption, 200), at: Date.now() });
  return { id: ref.id };
}

async function postEdit(uid, { id, caption }) {
  const ref = db().doc(`feedPosts/${String(id || '')}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid) throw new SocialError('not-allowed', 403);
  await ref.update({ caption: S.cleanStr(caption, 200), editedAt: Date.now() });
  return { ok: true };
}

async function postDelete(uid, { id }) {
  const ref = db().doc(`feedPosts/${String(id || '')}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (snap.data().uid !== uid) throw new SocialError('not-allowed', 403);
  await ref.delete();
  return { ok: true };
}

async function channel(uid, { channelId }) {
  const snap = await db().collection('youtubeRoutines').where('channelId', '==', String(channelId || '')).where('status', '==', 'done').limit(50).get();
  if (snap.empty) throw new SocialError('not-found', 404);
  const routines = snap.docs.map((d) => d.data()).sort((a, b) => (b.imports || 0) - (a.imports || 0));
  const first = routines[0];
  const follow = await db().doc(`users/${uid}/channelFollows/${channelId}`).get();
  return {
    channel: { channelId, name: first.channelName, url: first.channelUrl },
    routines,
    totalImports: routines.reduce((s, r) => s + (r.imports || 0), 0),
    following: follow.exists,
  };
}

/* ── 루틴 ── */

function cleanRoutineItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 20).map((it) => ({
    name: S.cleanStr(it?.name, 40),
    sets: Math.max(1, Math.min(10, parseInt(it?.sets, 10) || 3)),
    reps: S.cleanStr(String(it?.reps ?? ''), 20) || '10',
  })).filter((it) => it.name);
}

async function routineSave(uid, body) {
  await S.requireProfile(uid);
  const items = cleanRoutineItems(body.items);
  if (!items.length) throw new SocialError('empty');
  const status = body.status === 'public' ? 'public' : 'draft';
  const data = {
    uid,
    title: S.cleanStr(body.title, 30) || '내 루틴',
    parts: (Array.isArray(body.parts) ? body.parts : []).map((p) => S.cleanStr(p, 10)).filter(Boolean).slice(0, 5),
    items,
    memo: S.cleanStr(body.memo, 100),
    status,
    updatedAt: Date.now(),
  };
  if (body.draftKey) data.draftKey = S.cleanStr(body.draftKey, 60);
  if (body.sessionCount) data.sessionCount = parseInt(body.sessionCount, 10) || null;
  let ref;
  if (body.id) {
    ref = db().doc(`routines/${body.id}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== uid) throw new SocialError('not-allowed', 403);
    await ref.set(data, { merge: true });
  } else {
    ref = db().collection('routines').doc();
    await ref.set({ ...data, at: Date.now() });
  }
  return { id: ref.id };
}

async function routineDelete(uid, { id }) {
  const ref = db().doc(`routines/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (snap.data().uid !== uid) throw new SocialError('not-allowed', 403);
  await ref.delete();
  return { ok: true };
}

async function draftDismiss(uid, { draftKey }) {
  await db().doc(`profiles/${uid}`).set({ dismissedDrafts: FieldValue.arrayUnion(S.cleanStr(draftKey, 60)) }, { merge: true });
  return { ok: true };
}

/* 관심 있어요/없어요 (피드 더보기). 그 글의 채널·계정·대상·장소·부위·종류에 점수를 더하거나 빼고,
   관심 없는 글은 다시 안 보여준다. users/{uid}/prefs/feed (서버만 쓴다) */
/* 신고 (App Store 1.2 / Play 사용자 생성 콘텐츠).
   신고 기록은 reports에 남기고, 신고한 사람 피드에서는 바로 가린다. */
const REPORT_REASONS = new Set(['spam', 'sexual', 'violence', 'hate', 'falseInfo', 'privacy', 'other']);

async function report(uid, { key, reason, detail = '', commentId = '' }) {
  if (!REPORT_REASONS.has(reason)) throw new SocialError('bad-value');
  const t = await resolveTarget(uid, key);
  const cid = S.cleanStr(commentId, 64);
  if (!cid && t.owner === uid) throw new SocialError('not-allowed', 403);
  const docId = `${uid}_${String(key).replace(/[^a-zA-Z0-9]/g, '_')}${cid ? `_c${cid}` : ''}`;
  await db().doc(`reports/${docId}`).set({
    reporter: uid,
    key,
    kind: t.kind,
    owner: t.owner || null,
    commentId: cid || null,
    reason,
    detail: S.cleanStr(detail, 500),
    at: Date.now(),
    status: 'open',
  });
  if (!cid) await db().doc(`users/${uid}/prefs/feedHidden`).set({ keys: { [key]: Date.now() } }, { merge: true });
  return { ok: true };
}

async function feedFeedback(uid, { key, value }) {
  const t = await resolveTarget(uid, key);
  const sign = value === 'more' ? 1 : value === 'less' ? -1 : 0;
  if (!sign) throw new SocialError('bad-value');
  let video = null;
  if (t.kind === 'post') video = (await db().doc(`youtubeRoutines/${t.data.videoId}`).get()).data() || null;
  if (t.kind === 'yt') video = t.data;
  const features = [];
  if (video) {
    if (video.channelId) features.push([`ch:${video.channelId}`, 2]);
    if (video.tags?.audience && video.tags.audience !== '무관') features.push([`aud:${video.tags.audience}`, 1]);
    if (video.tags?.place) features.push([`place:${video.tags.place}`, 1]);
    (video.parts || []).forEach((p) => features.push([`part:${p}`, 0.5]));
    features.push([`kind:${video.kind || 'workout'}`, 0.5]);
  }
  if (t.kind === 'cur') features.push([`kind:${t.data.kind === 'diet' ? 'diet' : 'workout'}`, 0.5]);
  if (t.owner) features.push([`author:${t.owner}`, 1]);
  const ref = db().doc(`users/${uid}/prefs/feed`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    const weights = { ...(prev.weights || {}) };
    features.forEach(([f, w]) => { weights[f] = Math.max(-6, Math.min(6, (weights[f] || 0) + sign * w)); });
    const hidden = new Set(prev.hidden || []);
    const liked = new Set(prev.liked || []);
    if (sign < 0) { hidden.add(key); liked.delete(key); } else { liked.add(key); hidden.delete(key); }
    tx.set(ref, { weights, hidden: [...hidden].slice(-300), liked: [...liked].slice(-300), at: Date.now() });
  });
  return { ok: true };
}

async function bestHide(uid, { recordId, hidden = true }) {
  const id = S.cleanStr(recordId, 200);
  await db().doc(`profiles/${uid}`).set({ hiddenBest: hidden ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id) }, { merge: true });
  return { ok: true };
}

/* ── 라우터 ── */

const ACTIONS = {
  me: (uid) => me(uid),
  'handle-check': handleCheck,
  'profile-save': profileSave,
  profile: profileView,
  search,
  friends: (uid) => listFriends(uid),
  requests: (uid) => listRequests(uid),
  blocks: (uid) => listBlocks(uid),
  'friend-request': friendRequest,
  'friend-cancel': friendCancel,
  'friend-accept': friendAccept,
  'friend-decline': friendDecline,
  'friend-remove': friendRemove,
  block,
  unblock,
  poke,
  'invite-create': inviteCreate,
  'invite-preview': invitePreview,
  'invite-accept': inviteAccept,
  feed: (uid, body) => feed(uid, { refresh: body?.refresh === true }),
  story,
  post,
  clap,
  'comment-add': commentAdd,
  'comment-edit': commentEdit,
  'comment-delete': commentDelete,
  'import-record': importRecord,
  'youtube-import': youtubeImport,
  'youtube-get': youtubeGet,
  'youtube-publish': youtubePublish,
  'post-edit': postEdit,
  'post-delete': postDelete,
  channel,
  'routine-save': routineSave,
  'routine-delete': routineDelete,
  'best-hide': bestHide,
  'feed-feedback': feedFeedback,
  report,
  'draft-dismiss': draftDismiss,
};

function createHandler(deps) {
  return async (req, res) => {
    deps.setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
    const origin = req.get('origin');
    if (origin && !deps.ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin-not-allowed' });

    const action = String(req.path || '').split('/').filter(Boolean).pop();
    const fn = ACTIONS[action];
    if (!fn) return res.status(404).json({ error: 'unknown-action' });

    let uid = null;
    const authorization = req.get('authorization') || '';
    if (authorization.startsWith('Bearer ')) {
      try { uid = (await getAuth().verifyIdToken(authorization.slice(7))).uid; } catch { uid = null; }
    }
    if (!uid && !PUBLIC_ACTIONS.has(action)) return res.status(401).json({ error: 'unauthorized' });

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await fn(uid, body, deps);
      return res.status(200).json(result || { ok: true });
    } catch (error) {
      if (error instanceof SocialError) return res.status(error.status).json({ error: error.code, ...error.extra });
      console.error('social action failed', { action, uid, code: error.code, message: error.message });
      return res.status(500).json({ error: 'server-error' });
    }
  };
}

/* 탈퇴할 때 친구·요청·초대·박수·글을 정리한다. 남긴 댓글은 "탈퇴한 사용자"로 남긴다. */
async function deleteSocialData(uid) {
  const d = db();
  const profile = await S.getProfile(uid);
  const deleteQuery = async (q) => {
    for (;;) {
      const snap = await q.limit(400).get();
      if (snap.empty) return;
      const batch = d.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      if (snap.size < 400) return;
    }
  };
  const friends = await S.friendIds(uid);
  for (const f of friends) await d.doc(`users/${f}/friends/${uid}`).delete();
  await deleteQuery(d.collection(`users/${uid}/friends`));
  await deleteQuery(d.collection(`users/${uid}/blocks`));
  await deleteQuery(d.collection(`users/${uid}/notifications`));
  await deleteQuery(d.collection(`users/${uid}/saved`));
  await deleteQuery(d.collection(`users/${uid}/pushTokens`));
  await deleteQuery(d.collection(`users/${uid}/storySeen`));
  await deleteQuery(d.collection(`users/${uid}/channelFollows`));
  await deleteQuery(d.collection(`users/${uid}/youtubeImports`));
  await deleteQuery(d.collection('friendRequests').where('from', '==', uid));
  await deleteQuery(d.collection('friendRequests').where('to', '==', uid));
  await deleteQuery(d.collection('claps').where('uid', '==', uid));
  await deleteQuery(d.collection('routines').where('uid', '==', uid));
  await deleteQuery(d.collection('feedPosts').where('uid', '==', uid));
  await deleteQuery(d.collection('invites').where('uid', '==', uid));
  await deleteQuery(d.collectionGroup('blocks').where('target', '==', uid));
  if (profile?.handle) await d.doc(`handles/${profile.handle}`).delete();
  await d.doc(`profiles/${uid}`).delete();
}

module.exports = { createHandler, deleteSocialData };
