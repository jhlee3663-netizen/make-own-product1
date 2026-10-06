/* Claude 커넥터(MCP) 서버 검증: OAuth(허용 목록·PKCE·만료·회전·폐기), 도구 응답, 사용자 분리, 읽기 전용.
   Firebase 에뮬레이터(auth, firestore, functions)가 MCP_ALLOWED_UIDS=mcp-qa-allowed 로 떠 있어야 한다:
     MCP_ALLOWED_UIDS=mcp-qa-allowed npx -y firebase-tools@latest emulators:start --only functions,auth,firestore --project demo-context-health
   운영 프로젝트에는 접속하지 않는다. */
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const BASE = process.env.QA_MCP_BASE || `http://127.0.0.1:5001/${PROJECT}/us-central1/mcp`;
const AUTH_BASE = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const ALLOWED_UID = 'mcp-qa-allowed';
const OTHER_UID = 'mcp-qa-other';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const kst = (date, time = '19:00') => Timestamp.fromDate(new Date(`${date}T${time}:00+09:00`));

async function http(path, { method = 'POST', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, headers: res.headers };
}

async function idTokenFor(uid) {
  await getAuth().deleteUser(uid).catch(() => {});
  await getAuth().createUser({ uid, email: `${uid}@qa.local` });
  const customToken = await getAuth().createCustomToken(uid);
  const res = await fetch(`${AUTH_BASE}/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
}

async function wipe(uid) {
  const logs = await db.collection('logs').where('uid', '==', uid).get();
  const body = await db.collection(`users/${uid}/bodyLogs`).get();
  const tokens = await db.collection('mcpTokens').where('uid', '==', uid).get();
  const codes = await db.collection('mcpAuthCodes').where('uid', '==', uid).get();
  await Promise.all([...logs.docs, ...body.docs, ...tokens.docs, ...codes.docs].map(d => d.ref.delete()));
  await db.doc(`users/${uid}`).delete();
}

async function seed() {
  await wipe(ALLOWED_UID);
  await wipe(OTHER_UID);
  const log = (id, data) => db.doc(`logs/mcpqa-${id}`).set(data);
  await db.doc(`users/${ALLOWED_UID}`).set({ profile: { height: '175', weight: '72', goalWeight: '70', age: '33', gender: 'male', goal: '근육 증량', activityLevel: 'moderate', targetKcal: '2400' } });

  await log('w-apr', {
    uid: ALLOWED_UID, type: 'workout', timestamp: kst('2026-04-14'), title: '가슴', totalVolume: 1650,
    sections: [{ part: '가슴', items: [{ title: '벤치프레스', body: '• 세트 1: 50kg 10회\n• 세트 2: 55kg 10회\n• 세트 3: 60kg 10회' }] }],
  });
  await log('w-sep', {
    uid: ALLOWED_UID, type: 'workout', timestamp: kst('2026-09-29'), title: '가슴, 등', totalVolume: 4000, preWorkoutMeal: 'carb_1_2h',
    sections: [
      { part: '가슴', items: [{ title: '벤치프레스 프리', body: '• 세트 1: 70kg 8회\n• 세트 2: 75kg 5회 (보조2회)\n• 세트 3: 50kg 12회 (드랍)\n마지막 세트 어깨 뻐근', note: '컨디션 좋음' }] },
      { part: '등', items: [{ title: '풀업', body: '10회 3세트' }] },
    ],
  });
  /* type 없는 레거시 문서도 운동으로 취급 */
  await log('w-legacy', {
    uid: ALLOWED_UID, timestamp: kst('2026-09-22'), title: '하체', totalVolume: 3000,
    sections: [{ part: '하체', items: [{ title: '스쿼트', body: '100kg 5회 3세트' }] }],
  });
  await log('w-free', {
    uid: ALLOWED_UID, type: 'workout', timestamp: kst('2026-09-24'), title: '러닝', mode: 'free', totalVolume: 0, cardioMinutes: 30,
    sections: [], exercises: [], originalText: '러닝 30분\n벤치프레스는 건너뜀',
  });
  await log('w-deleted', {
    uid: ALLOWED_UID, type: 'workout', timestamp: kst('2026-09-28'), title: '삭제된 기록', deletedAt: Timestamp.now(),
    sections: [{ part: '가슴', items: [{ title: '벤치프레스 삭제본', body: '200kg 1회' }] }],
  });
  await log('w-other', {
    uid: OTHER_UID, type: 'workout', timestamp: kst('2026-09-29'), title: '남의 기록',
    sections: [{ part: '가슴', items: [{ title: '벤치프레스 타인', body: '999kg 1회' }] }],
  });

  const meal = (id, name, items) => ({ id, name, items });
  const food = (name, kcal, carb, protein, fat) => ({ id: name, name, kcal, carb, protein, fat, source: 'ai' });
  await log('d-0928', {
    uid: ALLOWED_UID, type: 'diet', timestamp: kst('2026-09-28', '21:00'), goal: 2400, kcal: 2000, carb: 250, protein: 150, fat: 44,
    sections: [meal('breakfast', '아침', [food('오트밀', 400, 60, 20, 8)]), meal('lunch', '점심', [food('닭가슴살 덮밥', 800, 100, 60, 16)]), meal('dinner', '저녁', [food('연어 스테이크', 800, 90, 70, 20)])],
  });
  await log('d-0929', {
    uid: ALLOWED_UID, type: 'diet', timestamp: kst('2026-09-29', '21:00'), goal: 2400, kcal: 2400, carb: 300, protein: 170, fat: 58,
    sections: [meal('lunch', '점심', [food('비빔밥', 1200, 150, 85, 29)]), meal('dinner', '저녁', [food('소고기', 1200, 150, 85, 29)])],
    unparsedInputs: { pm_snack: '이름 모를 과자' },
  });
  await log('d-other', { uid: OTHER_UID, type: 'diet', timestamp: kst('2026-09-29', '21:00'), kcal: 9999, carb: 1, protein: 1, fat: 1, sections: [] });

  const body = (id, data) => db.doc(`users/${ALLOWED_UID}/bodyLogs/${id}`).set(data);
  await body('mw_2026-09-28', { kind: 'morning_weight', date: '2026-09-28', weightKg: 72.4 });
  await body('mw_2026-09-30', { kind: 'morning_weight', date: '2026-09-30', weightKg: 71.9 });
  await body('inbody_2026-04-15_770', { kind: 'inbody', date: '2026-04-15', dateApprox: true, device: '770', condition: 'fasted', weightKg: 73.1, skeletalMuscleKg: 33.0, bodyFatPct: 19.5, bodyWaterL: 42.7 });
  await body('inbody_2026-09-02_270', { kind: 'inbody', date: '2026-09-02', device: '270', condition: 'evening', weightKg: 73.6, skeletalMuscleKg: 33.8, bodyFatPct: 18.2, bodyWaterL: 43.6 });
  await body('inbody_2026-09-29_270', { kind: 'inbody', date: '2026-09-29', device: '270', condition: 'evening', weightKg: 73.0, skeletalMuscleKg: 34.0, bodyFatPct: 17.6, bodyWaterL: 43.9 });
  await db.doc(`users/${OTHER_UID}/bodyLogs/mw_2026-09-30`).set({ kind: 'morning_weight', date: '2026-09-30', weightKg: 55 });
}

/* 사용자 데이터가 조회로 바뀌지 않았는지 비교하기 위한 지문 (토큰 컬렉션 제외) */
async function fingerprint() {
  const parts = [];
  const add = snap => snap.docs.forEach(d => parts.push(`${d.ref.path}:${JSON.stringify(d.data())}:${d.updateTime.toMillis()}`));
  add(await db.collection('logs').where('uid', 'in', [ALLOWED_UID, OTHER_UID]).get());
  for (const uid of [ALLOWED_UID, OTHER_UID]) {
    add(await db.collection(`users/${uid}/bodyLogs`).get());
    const user = await db.doc(`users/${uid}`).get();
    if (user.exists) parts.push(`${user.ref.path}:${JSON.stringify(user.data())}:${user.updateTime.toMillis()}`);
  }
  return sha256Hex(parts.sort().join('\n'));
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const authorizeParams = (clientId, challenge, overrides = {}) => ({
  response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI,
  code_challenge: challenge, code_challenge_method: 'S256', state: 'qa-state', scope: 'read', ...overrides,
});

let rpcId = 0;
async function rpc(token, method, params) {
  const r = await http('/mcp', { token, body: { jsonrpc: '2.0', id: ++rpcId, method, params } });
  return r;
}
async function tool(token, name, args = {}) {
  const r = await rpc(token, 'tools/call', { name, arguments: args });
  const result = r.json?.result;
  let data = null;
  try { data = JSON.parse(result?.content?.[0]?.text); } catch {}
  return { status: r.status, isError: Boolean(result?.isError), text: result?.content?.[0]?.text, data };
}

try {
  await seed();
  const allowedIdToken = await idTokenFor(ALLOWED_UID);
  const otherIdToken = await idTokenFor(OTHER_UID);

  /* ── 메타데이터·무인증 ── */
  {
    const pr = await http('/.well-known/oauth-protected-resource', { method: 'GET' });
    const as = await http('/.well-known/oauth-authorization-server', { method: 'GET' });
    record('보호 리소스 메타데이터', pr.status === 200 && pr.json?.resource?.endsWith('/mcp') && pr.json?.authorization_servers?.length === 1);
    record('인가 서버 메타데이터 (S256·공개 클라이언트)', as.status === 200 && as.json?.code_challenge_methods_supported?.join() === 'S256'
      && as.json?.token_endpoint_auth_methods_supported?.join() === 'none' && as.json?.authorization_endpoint?.endsWith('/mcp-authorize'));
    const noToken = await rpc(undefined, 'tools/list');
    record('토큰 없는 MCP 호출 → 401 + WWW-Authenticate', noToken.status === 401 && /resource_metadata=/.test(noToken.headers.get('www-authenticate') || ''), `status=${noToken.status}`);
    const junk = await rpc('mcpat_not-a-real-token', 'tools/list');
    record('임의 토큰 → 401', junk.status === 401, `status=${junk.status}`);
    const firebaseToken = await rpc(allowedIdToken, 'tools/list');
    record('Firebase ID 토큰은 MCP 토큰으로 통하지 않음 → 401', firebaseToken.status === 401, `status=${firebaseToken.status}`);
    const get = await http('/mcp', { method: 'GET' });
    record('GET /mcp → 405', get.status === 405, `status=${get.status}`);
  }

  /* ── 클라이언트 등록 ── */
  const badReg = await http('/api/mcp-oauth/register', { body: { redirect_uris: ['https://evil.example/callback'] } });
  record('허용되지 않은 redirect_uri 등록 거절', badReg.status === 400, `status=${badReg.status}`);
  const reg = await http('/api/mcp-oauth/register', { body: { client_name: 'Claude', redirect_uris: [REDIRECT_URI] } });
  const clientId = reg.json?.client_id;
  record('클라이언트 등록', reg.status === 201 && Boolean(clientId) && reg.json?.token_endpoint_auth_method === 'none');

  /* ── 인가(동의) ── */
  const p1 = pkce();
  {
    const r = await http('/api/mcp-oauth/approve', { body: authorizeParams(clientId, p1.challenge) });
    record('로그인 없는 동의 → 401', r.status === 401, `status=${r.status}`);
  }
  {
    const r = await http('/api/mcp-oauth/approve', { token: otherIdToken, body: authorizeParams(clientId, p1.challenge) });
    const codes = await db.collection('mcpAuthCodes').where('uid', '==', OTHER_UID).get();
    record('허용 목록 밖 계정 동의 → 403, 코드 미발급', r.status === 403 && r.json?.error === 'access_denied' && codes.empty, `status=${r.status}`);
  }
  {
    const r = await http('/api/mcp-oauth/approve', { token: allowedIdToken, body: authorizeParams(clientId, p1.challenge, { redirect_uri: 'https://evil.example/callback' }) });
    record('허용되지 않은 redirect_uri 동의 거절', r.status === 400 && !r.json?.redirectTo, `status=${r.status}`);
  }
  {
    const r = await http('/api/mcp-oauth/approve', { token: allowedIdToken, body: authorizeParams(clientId, p1.challenge, { code_challenge_method: 'plain' }) });
    record('PKCE S256 아닌 요청 거절', r.status === 400, `status=${r.status}`);
  }
  async function approve(challenge) {
    const r = await http('/api/mcp-oauth/approve', { token: allowedIdToken, body: authorizeParams(clientId, challenge) });
    const url = r.json?.redirectTo ? new URL(r.json.redirectTo) : null;
    return { status: r.status, url, code: url?.searchParams.get('code') };
  }
  const a1 = await approve(p1.challenge);
  record('허용 계정 동의 → Claude 콜백으로 code·state', a1.status === 200 && `${a1.url?.origin}${a1.url?.pathname}` === REDIRECT_URI && Boolean(a1.code) && a1.url?.searchParams.get('state') === 'qa-state');
  {
    const stored = await db.doc(`mcpAuthCodes/${a1.code}`).get();
    const hashed = await db.doc(`mcpAuthCodes/${sha256Hex(a1.code)}`).get();
    record('인가 코드는 해시로만 저장', !stored.exists && hashed.exists);
  }

  /* ── 토큰 교환 ── */
  const tokenReq = form => http('/api/mcp-oauth/token', { form });
  {
    const r = await tokenReq({ grant_type: 'authorization_code', code: a1.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: pkce().verifier });
    record('틀린 code_verifier → invalid_grant', r.status === 400 && r.json?.error === 'invalid_grant', `status=${r.status}`);
    const again = await tokenReq({ grant_type: 'authorization_code', code: a1.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: p1.verifier });
    record('실패한 코드는 소모되어 재시도 불가', again.status === 400 && again.json?.error === 'invalid_grant', `status=${again.status}`);
  }
  {
    const p = pkce();
    const a = await approve(p.challenge);
    await db.doc(`mcpAuthCodes/${sha256Hex(a.code)}`).update({ expiresAt: Date.now() - 1000 });
    const r = await tokenReq({ grant_type: 'authorization_code', code: a.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: p.verifier });
    record('만료된 인가 코드 → invalid_grant', r.status === 400 && r.json?.error === 'invalid_grant', `status=${r.status}`);
  }
  {
    const p = pkce();
    const a = await approve(p.challenge);
    const r = await tokenReq({ grant_type: 'authorization_code', code: a.code, client_id: 'someone-else', redirect_uri: REDIRECT_URI, code_verifier: p.verifier });
    record('다른 client_id로 교환 → invalid_grant', r.status === 400 && r.json?.error === 'invalid_grant', `status=${r.status}`);
  }
  const p2 = pkce();
  const a2 = await approve(p2.challenge);
  const t1 = await tokenReq({ grant_type: 'authorization_code', code: a2.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: p2.verifier });
  let access = t1.json?.access_token;
  let refresh = t1.json?.refresh_token;
  record('정상 교환 → 액세스(1시간)·리프레시 토큰', t1.status === 200 && Boolean(access) && Boolean(refresh) && t1.json?.expires_in === 3600 && t1.json?.token_type === 'Bearer');
  {
    const reuse = await tokenReq({ grant_type: 'authorization_code', code: a2.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: p2.verifier });
    record('인가 코드 재사용 → invalid_grant', reuse.status === 400, `status=${reuse.status}`);
    const raw = await db.doc(`mcpTokens/${access}`).get();
    const hashed = await db.doc(`mcpTokens/${sha256Hex(access)}`).get();
    const refreshDoc = (await db.doc(`mcpTokens/${sha256Hex(refresh)}`).get()).data();
    const days = (refreshDoc.expiresAt - refreshDoc.createdAt) / 86400000;
    record('토큰은 해시로만 저장, 리프레시 30일', !raw.exists && hashed.exists && days === 30 && !JSON.stringify(hashed.data()).includes(access));
  }

  /* ── MCP 프로토콜 ── */
  {
    const init = await rpc(access, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qa', version: '0' } });
    record('initialize', init.status === 200 && init.json?.result?.protocolVersion === '2025-06-18' && Boolean(init.json?.result?.capabilities?.tools) && init.json?.result?.serverInfo?.name === 'context-health');
    const note = await http('/mcp', { token: access, body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
    record('알림 → 202', note.status === 202, `status=${note.status}`);
    const list = await rpc(access, 'tools/list');
    const names = (list.json?.result?.tools || []).map(t => t.name).sort();
    record('tools/list: 조회 도구 6개뿐', names.join() === 'get_body_composition,get_diet,get_morning_weight,get_profile,get_workouts,list_exercises', names.join());
    record('모든 도구 readOnlyHint', (list.json?.result?.tools || []).every(t => t.annotations?.readOnlyHint === true && t.inputSchema?.type === 'object'));
    const unknown = await rpc(access, 'resources/list');
    record('미지원 메서드 → -32601', unknown.json?.error?.code === -32601);
  }

  /* ── 도구 ── */
  const before = await fingerprint();
  {
    const r = await tool(access, 'list_exercises');
    const names = (r.data?.exercises || []).map(e => e.name);
    record('list_exercises: 표기를 통합하지 않고 그대로', names.includes('벤치프레스') && names.includes('벤치프레스 프리') && names.includes('스쿼트') && names.includes('풀업'), names.join(', '));
    record('list_exercises: 삭제본·타인 기록 제외', !names.some(n => /삭제본|타인/.test(n)));
    const bench = r.data?.exercises?.find(e => e.name === '벤치프레스');
    record('list_exercises: 날짜·횟수', bench?.sessions === 1 && bench?.first_date === '2026-04-14' && bench?.parts?.join() === '가슴');
  }
  {
    const r = await tool(access, 'get_workouts', { from: '2026-04-01', to: '2026-10-02', exercise: '벤치프레스' });
    const d = r.data;
    record('get_workouts: 부분 일치로 두 표기 모두', d?.matched_exercise_names?.join() === '벤치프레스,벤치프레스 프리', d?.matched_exercise_names?.join());
    const sep = d?.sessions?.find(s => s.date === '2026-09-29');
    const apr = d?.sessions?.find(s => s.date === '2026-04-14');
    const ex = sep?.exercises?.[0];
    record('get_workouts: 세트마다 원문 포함', ex?.sets?.length === 4 && ex.sets.every(s => typeof s.raw === 'string' && s.raw.length > 0) && ex.sets[1].raw === '• 세트 2: 75kg 5회 (보조2회)');
    record('get_workouts: 못 읽은 줄은 parsed null로 원문만', ex?.sets?.[3]?.parsed === null && ex?.sets?.[3]?.raw === '마지막 세트 어깨 뻐근');
    record('get_workouts: 보조·드랍 표기 보존', ex?.sets?.[1]?.flags?.join() === 'assisted_reps' && ex?.sets?.[2]?.flags?.join() === 'drop' && ex?.note === '컨디션 좋음');
    record('get_workouts: 추정 1RM (4월 80 → 9월 88.7)', apr?.exercises?.[0]?.best_est_1rm_kg === 80 && ex?.best_est_1rm_kg === 88.7, `${apr?.exercises?.[0]?.best_est_1rm_kg} → ${ex?.best_est_1rm_kg}`);
    record('get_workouts: 필터된 종목만, 운동 전 식사 포함', sep?.exercises?.length === 1 && sep?.pre_workout_meal?.code === 'carb_1_2h' && !apr?.pre_workout_meal);
    const free = d?.sessions?.find(s => s.date === '2026-09-24');
    record('get_workouts: 자유 메모는 원문으로 매칭', free?.matched_in === 'original_memo' && free?.original_memo?.includes('러닝 30분'));
    record('get_workouts: 삭제본·타인 기록 제외', !JSON.stringify(d).includes('200kg') && !JSON.stringify(d).includes('999kg'));
  }
  {
    const r = await tool(access, 'get_workouts', { from: '2026-09-01', to: '2026-10-02', granularity: 'week' });
    const w = r.data?.weeks?.find(x => x.week_start === '2026-09-28');
    const legacy = r.data?.weeks?.find(x => x.week_start === '2026-09-21');
    record('get_workouts week: 부위별·종목별 집계', w?.sessions === 1 && w?.by_part?.find(p => p.part === '가슴')?.parsed_volume_kg === 70 * 8 + 75 * 5 + 50 * 12 && w?.by_exercise?.length === 2);
    record('get_workouts week: type 없는 레거시 문서 포함', legacy?.by_exercise?.find(e => e.name === '스쿼트')?.parsed_volume_kg === 1500 && legacy?.sessions === 2);
  }
  {
    const r = await tool(access, 'get_workouts', { from: '2026-04-01', to: '2026-10-02', limit: 2 });
    record('get_workouts: limit 초과 시 next_to 안내', r.data?.truncated === true && r.data?.sessions?.length === 2 && r.data?.next_to === '2026-09-23', `next_to=${r.data?.next_to}`);
    const bad = await tool(access, 'get_workouts', { from: '2020-01-01', to: '2026-10-02' });
    record('get_workouts: 과도한 기간은 오류로 안내', bad.isError && /최대 400일/.test(bad.text || ''));
    const badDate = await tool(access, 'get_workouts', { from: '04/01' });
    record('get_workouts: 잘못된 날짜는 오류', badDate.isError);
  }
  {
    const day = await tool(access, 'get_diet', { from: '2026-09-28', to: '2026-10-02' });
    const d29 = day.data?.days?.find(d => d.date === '2026-09-29');
    record('get_diet day: 합계·목표 대비·끼니 슬롯', day.data?.days_logged === 2 && d29?.kcal === 2400 && d29?.kcal_vs_goal_pct === 100 && d29?.meals?.map(m => m.slot).join() === '점심,저녁' && d29?.meals?.[0]?.items?.[0]?.name === '비빔밥');
    record('get_diet day: 미분석 입력 포함, 타인 기록 제외', d29?.unparsed_inputs?.[0]?.text === '이름 모를 과자' && !JSON.stringify(day.data).includes('9999'));
    const week = await tool(access, 'get_diet', { from: '2026-09-28', to: '2026-10-04', granularity: 'week' });
    const w = week.data?.weeks?.[0];
    record('get_diet week: 기록한 날 기준 평균·목표 대비', w?.days_logged === 2 && w?.avg_kcal === 2200 && w?.avg_protein_g === 160 && w?.goal_kcal === 2400 && w?.avg_kcal_vs_goal_pct === 91.7, JSON.stringify(w));
    const slim = await tool(access, 'get_diet', { from: '2026-09-28', to: '2026-10-02', include_items: false });
    record('get_diet: include_items=false면 항목 생략', slim.data?.days?.[0]?.meals?.[0]?.items === undefined && slim.data?.days?.[0]?.meals?.[0]?.item_count === 1);
  }
  {
    const r = await tool(access, 'get_morning_weight', { from: '2026-09-01', to: '2026-10-02' });
    record('get_morning_weight: 공복 체중만, 인바디·타인 제외', r.data?.count === 2 && r.data?.entries?.map(e => e.weight_kg).join() === '72.4,71.9' && r.data?.stats?.change_kg === -0.5, JSON.stringify(r.data?.entries));
  }
  {
    const all = await tool(access, 'get_body_composition', { from: '2026-01-01', to: '2026-10-02' });
    const first = all.data?.entries?.[0];
    record('get_body_composition: 기기·조건·체수분 포함', all.data?.count === 3 && first?.device === '770' && first?.condition === 'fasted' && first?.condition_label === '공복' && first?.body_water_l === 42.7 && first?.date_is_approximate === true);
    record('get_body_composition: 기기 혼재 경고', all.data?.devices_in_result?.length === 2 && Boolean(all.data?.caution));
    const only270 = await tool(access, 'get_body_composition', { from: '2026-01-01', to: '2026-10-02', device: '270' });
    record('get_body_composition: 기기 필터', only270.data?.count === 2 && only270.data?.entries?.every(e => e.device === '270') && !only270.data?.caution);
    record('get_body_composition: 공복 체중 기록과 섞이지 않음', !JSON.stringify(all.data).includes('71.9'));
  }
  {
    const r = await tool(access, 'get_profile');
    record('get_profile', r.data?.target_kcal === 2400 && r.data?.height_cm === 175 && r.data?.profile_weight_kg === 72);
  }
  {
    const r = await tool(access, 'get_morning_weight', { from: '2026-09-01', to: '2026-10-02', uid: OTHER_UID });
    record('도구 인자의 uid는 무시 (토큰의 uid만 사용)', r.data?.entries?.every(e => e.weight_kg !== 55) && r.data?.count === 2);
    const unknown = await tool(access, 'delete_log', { id: 'mcpqa-w-apr' });
    record('없는(쓰기) 도구 호출은 오류', unknown.isError);
  }
  record('모든 도구 호출 후 사용자 데이터 불변 (읽기 전용)', (await fingerprint()) === before);

  /* ── 만료·회전·폐기 ── */
  {
    const r1 = await tokenReq({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
    record('리프레시 → 새 토큰 쌍', r1.status === 200 && r1.json?.access_token !== access && r1.json?.refresh_token !== refresh);
    const reuse = await tokenReq({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
    record('사용한 리프레시 토큰 재사용 → invalid_grant', reuse.status === 400 && reuse.json?.error === 'invalid_grant', `status=${reuse.status}`);
    const stillOk = await rpc(r1.json.access_token, 'ping');
    record('직후 재사용(재시도 간주)은 연결을 끊지 않음', stillOk.status === 200);

    /* 유예 시간이 지난 뒤의 재사용은 탈취로 보고 연결 전체를 폐기한다 */
    await db.doc(`mcpTokens/${sha256Hex(refresh)}`).update({ usedAt: Date.now() - 5 * 60 * 1000 });
    const late = await tokenReq({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
    const afterTheft = await rpc(r1.json.access_token, 'ping');
    const newRefresh = await tokenReq({ grant_type: 'refresh_token', refresh_token: r1.json.refresh_token, client_id: clientId });
    record('늦은 재사용 → 같은 연결의 토큰 전부 폐기', late.status === 400 && afterTheft.status === 401 && newRefresh.status === 400, `access=${afterTheft.status} refresh=${newRefresh.status}`);
  }
  async function connect() {
    const p = pkce();
    const a = await approve(p.challenge);
    const t = await tokenReq({ grant_type: 'authorization_code', code: a.code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: p.verifier });
    return t.json;
  }
  {
    const t = await connect();
    await db.doc(`mcpTokens/${sha256Hex(t.access_token)}`).update({ expiresAt: Date.now() - 1000 });
    const r = await rpc(t.access_token, 'ping');
    record('만료된 액세스 토큰 → 401', r.status === 401, `status=${r.status}`);
    await db.doc(`mcpTokens/${sha256Hex(t.refresh_token)}`).update({ expiresAt: Date.now() - 1000 });
    const rr = await tokenReq({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId });
    record('만료된 리프레시 토큰 → invalid_grant', rr.status === 400, `status=${rr.status}`);
    const asAccess = await rpc((await connect()).refresh_token, 'ping');
    record('리프레시 토큰은 액세스 토큰으로 쓸 수 없음', asAccess.status === 401, `status=${asAccess.status}`);
  }
  {
    /* 허용 목록 밖 uid의 토큰 문서가 어떤 경로로 생겼더라도 사용 시점에 거절된다 */
    const forged = 'mcpat_forged-for-other-user';
    await db.doc(`mcpTokens/${sha256Hex(forged)}`).set({ kind: 'access', uid: OTHER_UID, clientId, familyId: 'forged', createdAt: Date.now(), expiresAt: Date.now() + 3600000 });
    const r = await rpc(forged, 'tools/list');
    record('허용 목록 밖 uid의 토큰은 사용 시점에도 거절', r.status === 401, `status=${r.status}`);
  }
  {
    const t = await connect();
    const status = await http('/api/mcp-oauth/status', { token: allowedIdToken, body: {} });
    record('앱 상태 조회: 연결됨', status.status === 200 && status.json?.connected === true);
    const revoke = await http('/api/mcp-oauth/revoke', { form: { token: t.refresh_token } });
    const afterRevoke = await rpc(t.access_token, 'ping');
    record('revoke 엔드포인트 → 그 연결의 액세스 토큰도 무효', revoke.status === 200 && afterRevoke.status === 401, `status=${afterRevoke.status}`);
  }
  {
    const t = await connect();
    const noAuth = await http('/api/mcp-oauth/disconnect', { body: {} });
    const other = await http('/api/mcp-oauth/disconnect', { token: otherIdToken, body: {} });
    const stillOk = await rpc(t.access_token, 'ping');
    record('연결 해제는 본인만 (무인증 401, 타인은 영향 없음)', noAuth.status === 401 && other.status === 200 && stillOk.status === 200);
    const mine = await http('/api/mcp-oauth/disconnect', { token: allowedIdToken, body: {} });
    const after = await rpc(t.access_token, 'ping');
    const refreshAfter = await tokenReq({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId });
    const left = await db.collection('mcpTokens').where('uid', '==', ALLOWED_UID).get();
    const status = await http('/api/mcp-oauth/status', { token: allowedIdToken, body: {} });
    record('앱에서 연결 해제 → 토큰 전부 삭제·즉시 무효', mine.status === 200 && after.status === 401 && refreshAfter.status === 400 && left.empty && status.json?.connected === false, `left=${left.size}`);
  }
} catch (error) {
  record('mcp server test execution', false, error?.stack || String(error));
} finally {
  await wipe(ALLOWED_UID).catch(() => {});
  await wipe(OTHER_UID).catch(() => {});
  await db.collection('mcpTokens').where('familyId', '==', 'forged').get().then(s => Promise.all(s.docs.map(d => d.ref.delete()))).catch(() => {});
}

const failed = results.filter(r => !r.pass);
console.log(`\nmcp server: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length ? 1 : 0);
