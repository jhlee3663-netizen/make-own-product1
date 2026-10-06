/* QA-08 검증: deleteAccount의 인증·최근 로그인 요구·소유권·전량 삭제·재시도 완결성.
   Firebase 에뮬레이터(auth, firestore, functions)가 필요하며 운영에는 접속하지 않는다. */
import assert from 'node:assert/strict';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
const FN_BASE = process.env.QA_FN_BASE || `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const AUTH_BASE = process.env.QA_AUTH_BASE || 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS_BASE = process.env.QA_FS_BASE || `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ENDPOINT = `${FN_BASE}/deleteAccount`;
/* 에뮬레이터 Firestore REST에 규칙을 우회해 fixture를 넣기 위한 owner 토큰 */
const FS_HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signUp(label) {
  const res = await fetch(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${label}-${Date.now()}@qa.local`, password: 'qa-password-123', returnSecureToken: true }),
  });
  const data = await res.json();
  assert.ok(data.idToken, `${label} 토큰 발급 실패`);
  return { idToken: data.idToken, uid: data.localId };
}

async function seed(uid, logCount, roomCount) {
  for (let i = 0; i < logCount; i++) {
    await fetch(`${FS_BASE}/logs?documentId=${uid}-log-${i}`, {
      method: 'POST',
      headers: FS_HEADERS,
      body: JSON.stringify({ fields: { uid: { stringValue: uid }, type: { stringValue: 'workout' }, title: { stringValue: `QA ${i}` } } }),
    });
  }
  await fetch(`${FS_BASE}/users?documentId=${uid}`, {
    method: 'POST',
    headers: FS_HEADERS,
    body: JSON.stringify({ fields: { profile: { mapValue: { fields: { weight: { integerValue: '70' } } } } } }),
  });
  for (let i = 0; i < roomCount; i++) {
    await fetch(`${FS_BASE}/users/${uid}/coachRooms?documentId=room-${i}`, {
      method: 'POST',
      headers: FS_HEADERS,
      body: JSON.stringify({ fields: { messages: { arrayValue: { values: [] } } } }),
    });
  }
}

/* batchWrite로 대량 fixture를 빠르게 만든다 (배치당 최대 500건) */
async function seedBulkLogs(uid, count) {
  for (let start = 0; start < count; start += 400) {
    const writes = [];
    for (let i = start; i < Math.min(start + 400, count); i++) {
      writes.push({
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/logs/${uid}-bulk-${i}`,
          fields: { uid: { stringValue: uid }, type: { stringValue: 'workout' } },
        },
      });
    }
    const res = await fetch(`${FS_BASE}:batchWrite`, {
      method: 'POST',
      headers: FS_HEADERS,
      body: JSON.stringify({ writes }),
    });
    assert.equal(res.status, 200, `bulk seed 실패: ${res.status}`);
  }
}

async function deleteLogsDirect(uid, count) {
  const writes = [];
  for (let i = 0; i < count; i++) {
    writes.push({ delete: `projects/${PROJECT}/databases/(default)/documents/logs/${uid}-bulk-${i}` });
  }
  const res = await fetch(`${FS_BASE}:batchWrite`, {
    method: 'POST',
    headers: FS_HEADERS,
    body: JSON.stringify({ writes }),
  });
  assert.equal(res.status, 200, `직접 삭제 실패: ${res.status}`);
}

async function countLogs(uid) {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: FS_HEADERS,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'logs' }],
        where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      },
    }),
  });
  const rows = await res.json();
  return Array.isArray(rows) ? rows.filter(r => r.document).length : 0;
}

async function userExists(uid) {
  const res = await fetch(`${FS_BASE}/users/${uid}`, { headers: FS_HEADERS });
  return res.status === 200;
}

async function authUserExists(idToken) {
  const res = await fetch(`${AUTH_BASE}/accounts:lookup?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json();
  return Array.isArray(data.users) && data.users.length > 0;
}

async function callDelete(token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(ENDPOINT, { method: 'POST', headers });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/* 1. 무인증 요청은 401 */
{
  const r = await callDelete(null);
  record('no token → 401', r.status === 401 && r.json?.error === 'unauthorized', `status=${r.status}`);
}

/* 2. 잘못된 토큰은 401 */
{
  const r = await callDelete('garbage-token');
  record('invalid token → 401', r.status === 401, `status=${r.status}`);
}

/* 3. 본인 데이터 전량 삭제 + Auth 계정 삭제. 타 사용자 데이터는 남는다 */
{
  const victim = await signUp('delete-me');
  const bystander = await signUp('keep-me');
  await seed(victim.uid, 3, 2);
  await seed(bystander.uid, 2, 1);

  const before = await countLogs(victim.uid);
  const r = await callDelete(victim.idToken);
  const afterLogs = await countLogs(victim.uid);
  const afterUser = await userExists(victim.uid);
  const authGone = !(await authUserExists(victim.idToken));

  record('본인 기록·프로필·Auth 전량 삭제',
    r.status === 200 && before === 3 && afterLogs === 0 && !afterUser && authGone,
    `status=${r.status} before=${before} afterLogs=${afterLogs} userDoc=${afterUser} authGone=${authGone} deleted=${JSON.stringify(r.json?.deleted)}`);

  const otherLogs = await countLogs(bystander.uid);
  const otherUser = await userExists(bystander.uid);
  record('다른 사용자 데이터는 보존', otherLogs === 2 && otherUser, `logs=${otherLogs} userDoc=${otherUser}`);
}

/* 4. 400건 초과도 남김없이 삭제되는지 (batch 경계 + 재조회 루프) */
{
  const heavy = await signUp('heavy');
  await seed(heavy.uid, 5, 0);
  const r = await callDelete(heavy.idToken);
  const remaining = await countLogs(heavy.uid);
  record('삭제 후 잔여 기록 0건', r.status === 200 && remaining === 0, `status=${r.status} remaining=${remaining}`);
}

/* 5-a. auth_time이 오래된 토큰은 401 requires-recent-login.
   에뮬레이터 토큰은 alg:none이라 payload만 바꿔 오래된 세션을 재현할 수 있다. */
{
  const stale = await signUp('stale-session');
  const [h, p, sig] = stale.idToken.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.auth_time = Math.floor(Date.now() / 1000) - 3600; // 1시간 전 로그인
  const forged = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), sig].join('.');

  await seed(stale.uid, 2, 0);
  const r = await callDelete(forged);
  const survived = await countLogs(stale.uid);
  record('오래된 로그인 세션 → 401 requires-recent-login, 데이터 보존',
    r.status === 401 && r.json?.error === 'requires-recent-login' && survived === 2,
    `status=${r.status} error=${r.json?.error} remainingLogs=${survived}`);
}

/* 5-b. 400건 배치 경계를 넘는 데이터도 남김없이 삭제된다 */
{
  const bulk = await signUp('bulk');
  await seedBulkLogs(bulk.uid, 450);
  const before = await countLogs(bulk.uid);
  const r = await callDelete(bulk.idToken);
  const after = await countLogs(bulk.uid);
  record('450건(배치 경계 초과) 전량 삭제',
    r.status === 200 && before === 450 && after === 0 && r.json?.deleted?.logs === 450,
    `before=${before} after=${after} deleted=${r.json?.deleted?.logs}`);
}

/* 5-c. 이전 실행이 일부만 지운 상태에서 재시도하면 남은 것까지 마저 지운다 */
{
  const resumed = await signUp('resume');
  await seedBulkLogs(resumed.uid, 20);
  await seed(resumed.uid, 0, 2);
  // 이전 부분 삭제를 흉내내어 일부 문서를 미리 제거
  await deleteLogsDirect(resumed.uid, 8);
  const midway = await countLogs(resumed.uid);

  const r = await callDelete(resumed.idToken);
  const after = await countLogs(resumed.uid);
  const userGone = !(await userExists(resumed.uid));
  record('부분 삭제 상태에서 재시도하면 잔여분까지 완결',
    r.status === 200 && midway === 12 && after === 0 && userGone && r.json?.deleted?.logs === 12,
    `midway=${midway} after=${after} userDoc=${!userGone} deleted=${JSON.stringify(r.json?.deleted)}`);
}

/* 6. 이미 삭제된 계정의 토큰 재사용은 401 (반복 호출이 타인 데이터를 건드리지 않음) */
{
  const gone = await signUp('gone');
  await seed(gone.uid, 1, 0);
  await callDelete(gone.idToken);
  const again = await callDelete(gone.idToken);
  record('삭제된 계정 토큰 재사용 → 401', again.status === 401, `status=${again.status}`);
}

const failed = results.filter(r => !r.pass);
console.log(`\ndelete-account regression: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length === 0 ? 0 : 1);
