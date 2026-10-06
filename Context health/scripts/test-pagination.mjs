/* QA-12: 기록/휴지통/코치방 조회 상한 회귀 검사.
   demo-context-health의 Auth/Firestore 에뮬레이터가 실행 중이어야 한다. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  Timestamp, collection, connectFirestoreEmulator, deleteField, doc, getDocs, getFirestore,
  limit, orderBy, query, setDoc, startAfter, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
const EVIDENCE = new URL('../docs/qa/2026-09-07/evidence/pagination-tests.json', import.meta.url);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT }, `pagination-${runId}`);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

try {
  const credential = await createUserWithEmailAndPassword(auth, `pagination-${runId}@qa.local`, 'qa-password-123');
  const uid = credential.user.uid;
  const base = Date.now() - 60_000;

  const batch = writeBatch(db);
  for (let i = 0; i < 205; i += 1) {
    batch.set(doc(db, 'logs', `${runId}-log-${String(i).padStart(3, '0')}`), {
      uid,
      type: i % 2 ? 'diet' : 'workout',
      timestamp: Timestamp.fromMillis(base - i * 1000),
      title: `페이지 기록 ${i + 1}`,
      kcal: i % 2 ? 500 : 0,
      totalVolume: i % 2 ? 0 : 1000,
    });
  }
  for (let i = 0; i < 105; i += 1) {
    batch.set(doc(db, 'users', uid, 'coachRooms', `${runId}-room-${String(i).padStart(2, '0')}`), {
      messages: [
        { role: 'assistant', text: '무엇을 도와드릴까요?', timestamp: new Date(base - i * 1000 - 500).toISOString() },
        { role: 'user', text: `대화 ${i + 1}`, timestamp: new Date(base - i * 1000).toISOString() },
      ],
      meta: { id: `${runId}-room-${String(i).padStart(2, '0')}`, isDynamic: true, title: `QA 대화 ${i + 1}` },
      updatedAt: Timestamp.fromMillis(base - i * 1000),
    });
  }
  await batch.commit();

  const firstQuery = query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), limit(200));
  const first = await getDocs(firstQuery);
  const second = await getDocs(query(collection(db, 'logs'), where('uid', '==', uid), orderBy('timestamp', 'desc'), startAfter(first.docs.at(-1)), limit(200)));
  record('201번째 이후 기록 cursor 조회', first.size === 200 && second.size === 5,
    `first=${first.size}, second=${second.size}, total=${first.size + second.size}`);

  const recentDeletedAt = Timestamp.fromMillis(Date.now() - 2 * 86400000);
  const expiredDeletedAt = Timestamp.fromMillis(Date.now() - 31 * 86400000);
  await Promise.all([
    setDoc(doc(db, 'logs', `${runId}-trash-recent`), { uid, type: 'workout', timestamp: Timestamp.fromMillis(Date.now() - 365 * 86400000), deletedAt: recentDeletedAt }),
    setDoc(doc(db, 'logs', `${runId}-trash-expired`), { uid, type: 'workout', timestamp: Timestamp.now(), deletedAt: expiredDeletedAt }),
  ]);
  const trash = await getDocs(query(
    collection(db, 'logs'), where('uid', '==', uid),
    where('deletedAt', '>=', Timestamp.fromMillis(Date.now() - 30 * 86400000)),
    orderBy('deletedAt', 'desc'),
  ));
  record('휴지통은 deletedAt 기준 30일 조회', trash.size === 1 && trash.docs[0].id.endsWith('trash-recent'),
    `returned=${trash.size}, ids=${trash.docs.map(item => item.id).join(',')}`);
  await updateDoc(doc(db, 'logs', `${runId}-trash-recent`), { deletedAt: deleteField() });
  const afterRestore = await getDocs(query(
    collection(db, 'logs'), where('uid', '==', uid),
    where('deletedAt', '>=', Timestamp.fromMillis(Date.now() - 30 * 86400000)),
    orderBy('deletedAt', 'desc'),
  ));
  record('작성 1년 전 기록도 오늘 삭제 후 복원', afterRestore.empty,
    `authoredDaysAgo=365, beforeRestore=${trash.size}, afterRestore=${afterRestore.size}`);

  const rooms = await getDocs(collection(db, 'users', uid, 'coachRooms'));
  record('21개 이상 코치방 조회와 상한 감지', rooms.size === 105, `returned=${rooms.size}, visibleLimit=100, hasMore=${rooms.size > 100}`);

  const [homeSource, storeSource, coachSource, indexSource] = await Promise.all([
    readFile(new URL('../src/components/screens/HomeScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/userStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/screens/CoachListScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
  ]);
  record('UI 더 보기와 통계용 첫 페이지 분리', homeSource.includes('이전 기록 더 보기') && homeSource.includes('visibleWorkoutLogs') && homeSource.includes('<WeeklyVolumeChart workoutLogs={workoutLogs}'),
    'button=true, visible-list=true, weekly-first-page=true');
  record('코치방 최근 100개 정렬과 상한 안내', storeSource.includes('.sort((a, b)') && storeSource.includes('.slice(0, 100)') && coachSource.includes('최근 대화 100개를 표시'),
    'clientSort=true, visibleLimit=100, visibleNotice=true');
  const indexes = JSON.parse(indexSource).indexes;
  const trashIndex = indexes.some(index => index.fields?.[0]?.fieldPath === 'uid' && index.fields?.[1]?.fieldPath === 'deletedAt' && index.fields?.[1]?.order === 'DESCENDING');
  record('휴지통 복합 인덱스 선언', trashIndex, `uid+deletedAt=${trashIndex}`);
} catch (error) {
  record('pagination test execution', false, error?.stack || String(error));
} finally {
  await mkdir(new URL('../docs/qa/2026-09-07/evidence/', import.meta.url), { recursive: true });
  await writeFile(EVIDENCE, `${JSON.stringify({ project: PROJECT, productionTouched: false, results }, null, 2)}\n`);
  await deleteApp(app).catch(() => {});
}

const failed = results.filter(result => !result.pass);
console.log(`\npagination regression: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length ? 1 : 0);
