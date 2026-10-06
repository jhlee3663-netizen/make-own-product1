/* QA-17: logs 규칙의 정상 CRUD, malformed 요청, 사용자 분리를 검증한다.
   demo-context-health의 Auth/Firestore 에뮬레이터가 실행 중이어야 한다. */
import { mkdir, writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  Timestamp, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
const FS_BASE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const EVIDENCE = new URL('../docs/qa/2026-09-07/evidence/firestore-rules-tests.json', import.meta.url);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function expectDenied(name, action) {
  try { await action(); record(name, false, '허용됨'); }
  catch (error) { record(name, error?.code === 'permission-denied', `code=${error?.code}`); }
}
async function makeClient(label) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT }, `rules-${label}-${runId}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const credential = await createUserWithEmailAndPassword(auth, `${label}-${runId}@qa.local`, 'qa-password-123');
  return { app, db, uid: credential.user.uid };
}

const clients = [];
try {
  const a = await makeClient('a');
  const b = await makeClient('b');
  clients.push(a.app, b.app);
  const owned = doc(a.db, 'logs', `${runId}-owned`);
  await setDoc(owned, { uid: a.uid, type: 'workout', timestamp: Timestamp.now(), title: '정상', totalVolume: 0 });
  const created = (await getDoc(owned)).exists();
  await updateDoc(owned, { title: '수정', kcal: 0 });
  const updated = (await getDoc(owned)).data()?.title === '수정';
  record('정상 create/read/update', created && updated, `created=${created}, updated=${updated}`);

  await expectDenied('필수 필드 없는 create 거절', () => setDoc(doc(a.db, 'logs', `${runId}-missing`), { uid: a.uid, type: 'workout' }));
  await expectDenied('잘못된 type create 거절', () => setDoc(doc(a.db, 'logs', `${runId}-type`), { uid: a.uid, type: 'sleep', timestamp: Timestamp.now() }));
  await expectDenied('timestamp 문자열 create 거절', () => setDoc(doc(a.db, 'logs', `${runId}-timestamp`), { uid: a.uid, type: 'diet', timestamp: 'today' }));
  await expectDenied('음수 kcal create 거절', () => setDoc(doc(a.db, 'logs', `${runId}-kcal`), { uid: a.uid, type: 'diet', timestamp: Timestamp.now(), kcal: -1 }));
  await expectDenied('음수 totalVolume update 거절', () => updateDoc(owned, { totalVolume: -1 }));
  await expectDenied('과대 title update 거절', () => updateDoc(owned, { title: '가'.repeat(301) }));
  await expectDenied('기존 required type 삭제 거절', async () => {
    const { deleteField } = await import('firebase/firestore');
    await updateDoc(owned, { type: deleteField() });
  });
  await expectDenied('uid 변경 update 거절', () => updateDoc(owned, { uid: b.uid }));

  await expectDenied('타 사용자 get 거절', () => getDoc(doc(b.db, 'logs', owned.id)));
  await expectDenied('타 사용자 list 거절', () => getDocs(query(collection(b.db, 'logs'), where('uid', '==', a.uid))));
  await expectDenied('타 uid create 거절', () => setDoc(doc(b.db, 'logs', `${runId}-cross-create`), { uid: a.uid, type: 'workout', timestamp: Timestamp.now() }));
  await expectDenied('타 사용자 update 거절', () => updateDoc(doc(b.db, 'logs', owned.id), { title: '침범' }));
  await expectDenied('타 사용자 delete 거절', () => deleteDoc(doc(b.db, 'logs', owned.id)));
  await expectDenied('aiUsage 클라이언트 쓰기 거절', () => setDoc(doc(a.db, 'aiUsage', a.uid), { count: 0 }));
  await expectDenied('accountDeletions 클라이언트 쓰기 거절', () => setDoc(doc(a.db, 'accountDeletions', a.uid), { status: 'started' }));

  /* Claude 커넥터(MCP) 관련: 운동 전 식사 필드, 아침 공복 체중, 서버 전용 컬렉션 */
  await updateDoc(owned, { preWorkoutMeal: 'carb_1_2h' });
  await updateDoc(owned, { preWorkoutMeal: null });
  record('preWorkoutMeal 허용 값·null update', (await getDoc(owned)).data()?.preWorkoutMeal === null);
  await expectDenied('preWorkoutMeal 잘못된 값 거절', () => updateDoc(owned, { preWorkoutMeal: 'whatever' }));

  const mw = (client, date) => doc(client.db, 'users', a.uid, 'bodyLogs', `mw_${date}`);
  await setDoc(mw(a, '2026-10-01'), { kind: 'morning_weight', date: '2026-10-01', weightKg: 72.4, updatedAt: Timestamp.now() });
  await setDoc(mw(a, '2026-10-01'), { kind: 'morning_weight', date: '2026-10-01', weightKg: 72.1, updatedAt: Timestamp.now() });
  record('아침 공복 체중 create/update/read', (await getDoc(mw(a, '2026-10-01'))).data()?.weightKg === 72.1);
  await expectDenied('체중 범위 밖 거절', () => setDoc(mw(a, '2026-10-02'), { kind: 'morning_weight', date: '2026-10-02', weightKg: 900 }));
  await expectDenied('체중 문자열 거절', () => setDoc(mw(a, '2026-10-02'), { kind: 'morning_weight', date: '2026-10-02', weightKg: '72' }));
  await expectDenied('문서 ID와 날짜 불일치 거절', () => setDoc(mw(a, '2026-10-02'), { kind: 'morning_weight', date: '2026-10-03', weightKg: 72 }));
  await expectDenied('허용 외 필드 거절', () => setDoc(mw(a, '2026-10-02'), { kind: 'morning_weight', date: '2026-10-02', weightKg: 72, device: '270' }));
  await expectDenied('인바디 클라이언트 create 거절', () => setDoc(doc(a.db, 'users', a.uid, 'bodyLogs', 'inbody_2026-10-02_270'), { kind: 'inbody', date: '2026-10-02', device: '270', condition: 'fasted', weightKg: 72 }));
  await expectDenied('타 사용자 체중 read 거절', () => getDoc(mw(b, '2026-10-01')));
  await expectDenied('타 사용자 체중 write 거절', () => setDoc(mw(b, '2026-10-05'), { kind: 'morning_weight', date: '2026-10-05', weightKg: 60 }));
  await deleteDoc(mw(a, '2026-10-01'));
  record('아침 공복 체중 delete', !(await getDoc(mw(a, '2026-10-01'))).exists());

  const inbodyId = `inbody_2026-09-02_270`;
  const inbodySeed = await fetch(`${FS_BASE}/users/${a.uid}/bodyLogs?documentId=${inbodyId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { kind: { stringValue: 'inbody' }, date: { stringValue: '2026-09-02' }, device: { stringValue: '270' } } }),
  });
  const inbodyRef = doc(a.db, 'users', a.uid, 'bodyLogs', inbodyId);
  record('인바디 본인 read 허용', inbodySeed.ok && (await getDoc(inbodyRef)).data()?.kind === 'inbody');
  await expectDenied('인바디 클라이언트 update 거절', () => updateDoc(inbodyRef, { device: '770' }));
  await expectDenied('인바디 클라이언트 delete 거절', () => deleteDoc(inbodyRef));

  await expectDenied('mcpTokens 클라이언트 read 거절', () => getDoc(doc(a.db, 'mcpTokens', 'any')));
  await expectDenied('mcpTokens 클라이언트 write 거절', () => setDoc(doc(a.db, 'mcpTokens', 'any'), { uid: a.uid, kind: 'access', expiresAt: 9999999999999 }));
  await expectDenied('mcpAuthCodes 클라이언트 read 거절', () => getDoc(doc(a.db, 'mcpAuthCodes', 'any')));
  await expectDenied('mcpAuthCodes 클라이언트 write 거절', () => setDoc(doc(a.db, 'mcpAuthCodes', 'any'), { uid: a.uid }));

  // 배포 전 레거시 문서를 흉내내기 위해 에뮬레이터 관리자 우회로 type/timestamp 없는 문서만 준비한다.
  const legacyId = `${runId}-legacy`;
  const seed = await fetch(`${FS_BASE}/logs?documentId=${legacyId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { uid: { stringValue: a.uid }, title: { stringValue: 'legacy' }, kcal: { integerValue: '-1' } } }),
  });
  await updateDoc(doc(a.db, 'logs', legacyId), { title: 'legacy updated', deletedAt: Timestamp.now() });
  record('레거시 optional/과거 값 문서 update 호환', seed.ok && (await getDoc(doc(a.db, 'logs', legacyId))).data()?.title === 'legacy updated', `seedStatus=${seed.status}, unchangedLegacyKcal=-1`);

  await deleteDoc(owned);
  const deletedCheck = await fetch(`${FS_BASE}/logs/${owned.id}`, { headers: { Authorization: 'Bearer owner' } });
  record('정상 delete', deletedCheck.status === 404, `adminReadStatus=${deletedCheck.status}`);
} catch (error) {
  record('firestore rules test execution', false, error?.stack || String(error));
} finally {
  await mkdir(new URL('../docs/qa/2026-09-07/evidence/', import.meta.url), { recursive: true });
  await writeFile(EVIDENCE, `${JSON.stringify({ project: PROJECT, productionTouched: false, results }, null, 2)}\n`);
  await Promise.all(clients.map(app => deleteApp(app).catch(() => {})));
}

const failed = results.filter(result => !result.pass);
console.log(`\nfirestore rules regression: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length ? 1 : 0);
