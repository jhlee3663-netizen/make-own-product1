/* 피드·친구 API(/api/social) 검증. Firebase 에뮬레이터(auth, firestore, functions)가 필요하며 운영에는 접속하지 않는다.
   GEMINI_KEY=fake npx -y firebase-tools@latest emulators:start --only functions,auth,firestore --project demo-context-health */
import assert from 'node:assert/strict';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1/social`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FS_HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const RUN = Date.now().toString(36);

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (e) { results.push(false); console.log(`FAIL ${name} — ${e.message}`); }
}

async function signUp(label) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${label}-${RUN}@qa.local`, password: 'qa-password-123', returnSecureToken: true }),
  });
  const d = await res.json();
  return { token: d.idToken, uid: d.localId, label };
}

async function call(user, action, body = {}) {
  const res = await fetch(`${FN}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const ok = async (user, action, body) => {
  const r = await call(user, action, body);
  assert.equal(r.status, 200, `${action} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

/* 운동 기록 fixture (오늘) */
async function seedWorkout(uid, id, sections, extra = {}) {
  const fields = {
    uid: { stringValue: uid },
    type: { stringValue: 'workout' },
    title: { stringValue: sections.map((s) => s.part).join(', ') },
    timestamp: { timestampValue: new Date(extra.at || Date.now()).toISOString() },
    sections: { arrayValue: { values: sections.map((s) => ({ mapValue: { fields: {
      part: { stringValue: s.part },
      items: { arrayValue: { values: s.items.map(([title, body]) => ({ mapValue: { fields: { title: { stringValue: title }, body: { stringValue: body } } } })) } },
    } } })) } },
  };
  if (extra.hidden) fields.hiddenFromFriends = { booleanValue: true };
  await fetch(`${FS}/logs?documentId=${id}`, { method: 'POST', headers: FS_HEADERS, body: JSON.stringify({ fields }) });
}

async function readDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers: FS_HEADERS });
  return res.status === 200 ? res.json() : null;
}

const a = await signUp('minsu');
const b = await signUp('jihun');
const c = await signUp('seoyeon');
const H = (u) => `${u.label}${RUN}`.slice(0, 20);

await check('아이디 없이 친구 요청하면 profile-required', async () => {
  const r = await call(a, 'friend-request', { uid: b.uid });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, 'profile-required');
});

await check('프로필 만들기 · 아이디 중복 막기', async () => {
  await ok(a, 'profile-save', { handle: H(a), name: '민수' });
  await ok(b, 'profile-save', { handle: H(b), name: '지훈' });
  await ok(c, 'profile-save', { handle: H(c), name: '서연' });
  const taken = await ok(b, 'handle-check', { handle: H(a) });
  assert.equal(taken.available, false);
  assert.equal(taken.reason, 'taken');
  const dup = await call(b, 'profile-save', { handle: H(a) });
  assert.equal(dup.status, 409);
  const bad = await ok(a, 'handle-check', { handle: 'A!' });
  assert.equal(bad.reason, 'format');
});

await check('아이디 바꾼 뒤 30일 동안 다시 못 바꿈', async () => {
  await ok(c, 'profile-save', { handle: `${H(c)}x`.slice(0, 20) });
  const again = await call(c, 'profile-save', { handle: `${H(c)}y`.slice(0, 20) });
  assert.equal(again.data.error, 'handle-cooldown');
});

await check('친구 요청 → 수락 → 친구, 알림이 남는다', async () => {
  const r1 = await ok(a, 'friend-request', { uid: b.uid });
  assert.equal(r1.relation, 'requested');
  const reqs = await ok(b, 'requests');
  assert.equal(reqs.requests.length, 1);
  const r2 = await ok(b, 'friend-accept', { uid: a.uid });
  assert.equal(r2.relation, 'friend');
  const view = await ok(a, 'profile', { uid: b.uid });
  assert.equal(view.relation, 'friend');
  const notif = await readDoc(`users/${a.uid}/notifications?pageSize=10`);
  assert.ok(JSON.stringify(notif).includes('friendAccepted'));
});

await check('거절하면 상대는 모르고, 7일 동안 다시 요청해도 실제로는 안 감', async () => {
  await ok(c, 'friend-request', { uid: a.uid });
  await ok(a, 'friend-decline', { uid: c.uid });
  const again = await ok(c, 'friend-request', { uid: a.uid });
  assert.equal(again.relation, 'requested');
  const reqs = await ok(a, 'requests');
  assert.equal(reqs.requests.filter((r) => r.uid === c.uid).length, 0);
});

await check('친구 아닌 사람 프로필은 잠김, 기록·최고 기록 없음', async () => {
  await seedWorkout(a.uid, `${RUN}-a1`, [{ part: '가슴', items: [['벤치프레스', '• 세트 1: 80kg 6회\n• 세트 2: 80kg 6회']] }]);
  const view = await ok(c, 'profile', { uid: a.uid });
  assert.equal(view.relation, 'none');
  assert.equal(view.workouts, undefined);
  assert.equal(view.best, undefined);
});

await check('피드: 큐레이션 + 친구 기록 + 스토리', async () => {
  const f = await ok(b, 'feed');
  assert.ok(f.posts.some((p) => p.kind === 'cur-routine'));
  assert.ok(f.posts.some((p) => p.key === `log:${RUN}-a1`), '친구 기록이 피드에 없다');
  assert.ok(f.stories.some((s) => s.uid === a.uid), '오늘 기록한 친구 스토리가 없다');
  const st = await ok(b, 'story', { uid: a.uid });
  assert.equal(st.workouts.length, 1);
  assert.equal(st.workouts[0].exercises[0].weightKg, 80);
});

await check('기록마다 숨기기 · 공개 범위 끄면 피드에서 사라짐', async () => {
  await seedWorkout(a.uid, `${RUN}-a2`, [{ part: '등', items: [['랫풀다운', '60kg 10회 3세트']] }], { hidden: true });
  let f = await ok(b, 'feed');
  assert.ok(!f.posts.some((p) => p.key === `log:${RUN}-a2`));
  await ok(a, 'profile-save', { visibility: { workout: false } });
  f = await ok(b, 'feed');
  assert.ok(!f.posts.some((p) => p.kind === 'friend-log'));
  const r = await call(b, 'post', { key: `log:${RUN}-a1` });
  assert.equal(r.status, 404);
  await ok(a, 'profile-save', { visibility: { workout: true } });
});

await check('박수: 켜고 끄기, 주인에게 묶음 알림', async () => {
  const on = await ok(b, 'clap', { key: `log:${RUN}-a1` });
  assert.equal(on.clapped, true);
  assert.equal(on.counts.claps, 1);
  const off = await ok(b, 'clap', { key: `log:${RUN}-a1` });
  assert.equal(off.counts.claps, 0);
  await ok(b, 'clap', { key: `log:${RUN}-a1` });
  const n = await readDoc(`users/${a.uid}/notifications/clap_log:${RUN}-a1`);
  assert.ok(n, '박수 알림이 없다');
});

await check('댓글: 남기기 · 고치기 · 남의 댓글은 못 고침 · 주인은 지울 수 있음', async () => {
  const { id } = await ok(b, 'comment-add', { key: `log:${RUN}-a1`, text: '벤치 미쳤다' });
  const detail = await ok(a, 'post', { key: `log:${RUN}-a1` });
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.counts.comments, 1);
  const edit = await call(a, 'comment-edit', { id, text: '바꿈' });
  assert.equal(edit.status, 403);
  await ok(b, 'comment-edit', { id, text: '벤치 진짜 미쳤다' });
  await ok(a, 'comment-delete', { id });
  const after = await ok(a, 'post', { key: `log:${RUN}-a1` });
  assert.equal(after.comments.length, 0);
});

await check('친구가 아니면 댓글·박수 못 함', async () => {
  const r = await call(c, 'comment-add', { key: `log:${RUN}-a1`, text: 'hi' });
  assert.equal(r.status, 404);
});

await check('루틴: 초안 저장 → 공개, 친구 아니어도 공개 루틴은 보임, 가져가기 수·알림', async () => {
  const { id } = await ok(a, 'routine-save', { title: '민수표 가슴 날', items: [{ name: '벤치프레스', sets: 5, reps: '5' }], status: 'draft' });
  let view = await ok(c, 'profile', { uid: a.uid });
  assert.equal(view.routines.length, 0);
  await ok(a, 'routine-save', { id, title: '민수표 가슴 날', items: [{ name: '벤치프레스', sets: 5, reps: '5' }], status: 'public' });
  view = await ok(c, 'profile', { uid: a.uid });
  assert.equal(view.routines.length, 1);
  const d = await ok(b, 'post', { key: `rt:${id}` });
  assert.equal(d.ownerWeights.벤치프레스, 80);
  await ok(b, 'import-record', { key: `rt:${id}` });
  await ok(b, 'import-record', { key: `rt:${id}` });
  const d2 = await ok(c, 'post', { key: `rt:${id}` });
  assert.equal(d2.counts.imports, 1, '같은 사람이 두 번 가져가도 1');
});

await check('규칙: 알림은 본인이 읽음 표시만 바꿀 수 있고, 프로필·친구는 앱에서 못 씀', async () => {
  const list = await readDoc(`users/${a.uid}/notifications?pageSize=1`);
  const name = list.documents[0].name.split('/documents/')[1];
  const patch = (fields, mask) => fetch(`${FS}/${name}?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ fields }),
  });
  assert.equal((await patch({ read: { booleanValue: true } }, ['read'])).status, 200);
  assert.equal((await patch({ text: { stringValue: 'x' } }, ['text'])).status, 403);
  const other = await fetch(`${FS}/${name}`, { headers: { Authorization: `Bearer ${b.token}` } });
  assert.equal(other.status, 403);
  const prof = await fetch(`${FS}/profiles/${a.uid}?updateMask.fieldPaths=handle`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ fields: { handle: { stringValue: 'hack' } } }),
  });
  assert.equal(prof.status, 403);
  const fr = await fetch(`${FS}/users/${a.uid}/friends?documentId=${c.uid}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ fields: { since: { integerValue: '1' } } }),
  });
  assert.equal(fr.status, 403);
});

await check('콕 찌르기는 하루 한 번', async () => {
  const first = await ok(b, 'poke', { uid: a.uid });
  assert.equal(first.ok, true);
  const second = await ok(b, 'poke', { uid: a.uid });
  assert.equal(second.ok, false);
});

await check('검색: 친구는 이름으로, 남은 아이디로만', async () => {
  const byName = await ok(b, 'search', { q: '민수', tab: 'people' });
  assert.equal(byName.friends.length, 1);
  const stranger = await ok(c, 'search', { q: '지훈', tab: 'people' });
  assert.equal(stranger.others.length, 0, '친구 아닌 사람이 이름으로 걸리면 안 된다');
  const byHandle = await ok(c, 'search', { q: H(b).slice(0, 6), tab: 'people' });
  assert.ok(byHandle.others.some((o) => o.uid === b.uid));
});

await check('초대 링크: 미리보기(로그인 없이) → 수락하면 바로 친구, 내 링크는 self', async () => {
  const inv = await ok(c, 'invite-create');
  const pv = await call(null, 'invite-preview', { code: inv.code });
  assert.equal(pv.status, 200);
  assert.equal(pv.data.status, 'ok');
  assert.equal(pv.data.inviter.uid, c.uid);
  const self = await ok(c, 'invite-accept', { code: inv.code });
  assert.equal(self.status, 'self');
  const acc = await ok(b, 'invite-accept', { code: inv.code });
  assert.equal(acc.status, 'ok');
  const again = await ok(b, 'invite-accept', { code: inv.code });
  assert.equal(again.status, 'already');
});

await check('차단: 친구가 끊기고, 서로 검색·프로필에서 사라짐 (상대에겐 "찾을 수 없음")', async () => {
  await ok(a, 'block', { uid: b.uid });
  const fr = await ok(a, 'friends');
  assert.ok(!fr.friends.some((f) => f.uid === b.uid));
  const v = await ok(b, 'profile', { uid: a.uid });
  assert.equal(v.relation, 'blockedBy');
  const s = await ok(b, 'search', { q: H(a).slice(0, 6), tab: 'people' });
  assert.ok(!s.others.some((o) => o.uid === a.uid));
  const req = await call(b, 'friend-request', { uid: a.uid });
  assert.equal(req.status, 403);
  await ok(a, 'unblock', { uid: b.uid });
  const v2 = await ok(b, 'profile', { uid: a.uid });
  assert.equal(v2.relation, 'none', '차단 해제해도 친구로 돌아가지 않는다');
});

await check('루틴 초안: 같은 부위 조합 3번 이상이면 초안이 생긴다', async () => {
  for (let i = 0; i < 3; i += 1) {
    await seedWorkout(c.uid, `${RUN}-c${i}`, [
      { part: '하체', items: [['스쿼트', '100kg 5회 5세트'], ['레그프레스', '200kg 10회 3세트']] },
    ], { at: Date.now() - i * 86400000 });
  }
  const me = await ok(c, 'profile', { uid: c.uid });
  assert.equal(me.relation, 'self');
  assert.ok(me.drafts.some((d) => d.parts.includes('하체')), JSON.stringify(me.drafts));
  assert.equal(me.best.big3.squat.weightKg, 100);
});

await check('탈퇴하면 친구·아이디·루틴이 정리되고, 남은 사람에겐 "탈퇴한 사용자"', async () => {
  const res = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/deleteAccount`, { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 200, await res.text());
  const fr = await ok(b, 'friends');
  assert.ok(!fr.friends.some((f) => f.uid === c.uid));
  const v = await ok(b, 'profile', { uid: c.uid });
  assert.equal(v.relation, 'gone');
  const freed = await ok(b, 'handle-check', { handle: `${H(c)}x`.slice(0, 20) });
  assert.equal(freed.available, true);
});

/* 큐레이터 글 fixture: 정리된 영상(youtubeRoutines) + 피드 글(feedPosts) */
async function seedCuratorPost(id, curatorUid, at, kind = 'workout') {
  const videoId = `v${RUN}${id}`.slice(0, 11);
  const routine = {
    status: { stringValue: 'done' }, videoId: { stringValue: videoId }, kind: { stringValue: kind },
    routineTitle: { stringValue: `큐레이션 ${id}` }, channelName: { stringValue: 'QA 채널' }, channelId: { stringValue: `ch${id}` },
    items: { arrayValue: { values: [{ mapValue: { fields: { name: { stringValue: '스쿼트' }, sets: { integerValue: '4' }, reps: { stringValue: '8' } } } }] } },
  };
  await fetch(`${FS}/youtubeRoutines?documentId=${videoId}`, { method: 'POST', headers: FS_HEADERS, body: JSON.stringify({ fields: routine }) });
  const post = { uid: { stringValue: curatorUid }, videoId: { stringValue: videoId }, caption: { stringValue: '오늘의 루틴' }, at: { integerValue: String(at) }, curated: { booleanValue: true } };
  await fetch(`${FS}/feedPosts?documentId=${RUN}${id}`, { method: 'POST', headers: FS_HEADERS, body: JSON.stringify({ fields: post }) });
}

await check('큐레이터가 24시간 안에 올린 글은 스토리로도 보인다', async () => {
  const now = Date.now();
  await seedCuratorPost('c1', 'ch-legday', now - 60000);
  await seedCuratorPost('c2', 'ch-legday', now - 120000);
  await seedCuratorPost('c3', 'ch-upper', now - 26 * 3600 * 1000); // 24시간 지남
  const f = await ok(c, 'feed');
  const leg = f.stories.find((s) => s.uid === 'ch-legday');
  assert.ok(leg && leg.official, '하체 장인 스토리');
  assert.ok(!f.stories.some((s) => s.uid === 'ch-upper' && s.latestAt === now - 26 * 3600 * 1000), '24시간 지난 글은 스토리 아님');
  const st = await ok(c, 'story', { uid: 'ch-legday' });
  const mine = st.items.filter((x) => x.key.startsWith(`post:${RUN}`));
  assert.equal(mine.length, 2);
  assert.equal(mine[0].type, 'youtube');
  assert.equal(mine[0].exercises[0].name, '스쿼트');
  assert.ok(mine[0].at < mine[1].at, '올린 순서대로');
});

await check('당겨서 새로고침하면 지난번 맨 위 글이 내려간다', async () => {
  const first = await ok(c, 'feed');
  const top = first.posts[0]?.key;
  assert.ok(top && first.posts.length >= 2);
  const again = await ok(c, 'feed', { refresh: true });
  assert.notEqual(again.posts[0].key, top);
  assert.ok(again.posts.some((p) => p.key === top), '내려갈 뿐 사라지지는 않는다');
});

await check('로그인 없이 다른 기능은 막힘', async () => {
  const r = await call(null, 'feed');
  assert.equal(r.status, 401);
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
