/* QA-01 검증: aiGenerate 프록시의 인증·모델 제한·용량 제한·사용자별 한도·업스트림 오류 처리.
   Firebase 에뮬레이터(auth, firestore, functions)와 로컬 upstream 모의 서버가 떠 있어야 한다.
   운영 프로젝트나 실제 Gemini에는 접속하지 않는다. */
import assert from 'node:assert/strict';

const PROJECT = process.env.QA_PROJECT || 'demo-context-health';
const FN_BASE = process.env.QA_FN_BASE || `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const AUTH_BASE = process.env.QA_AUTH_BASE || 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const UPSTREAM_BASE = process.env.QA_UPSTREAM_BASE || 'http://127.0.0.1:5179';
const ENDPOINT = `${FN_BASE}/aiGenerate`;

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
  assert.ok(data.idToken, `${label} 토큰 발급 실패: ${JSON.stringify(data)}`);
  return { idToken: data.idToken, uid: data.localId };
}

async function call({ token, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

const simplePrompt = (text = 'QA prompt') => ({ contents: [{ parts: [{ text }] }] });

const userA = await signUp('user-a');
const userB = await signUp('user-b');

/* 1. 인증 없는 호출은 401 */
{
  const r = await call({ body: simplePrompt() });
  record('no token → 401', r.status === 401 && r.json?.error === 'unauthorized', `status=${r.status}`);
}

/* 2. 잘못된 토큰도 401 */
{
  const r = await call({ token: 'not-a-real-token', body: simplePrompt() });
  record('invalid token → 401', r.status === 401, `status=${r.status}`);
}

/* 3. 정상 호출은 200이며 Gemini 응답 형태를 유지 */
{
  const r = await call({ token: userA.idToken, body: simplePrompt() });
  const text = r.json?.candidates?.[0]?.content?.parts?.[0]?.text;
  record('authenticated → 200 + Gemini 응답 형태', r.status === 200 && text === 'QA_UPSTREAM_OK', `status=${r.status} text=${text}`);
}

/* 4. 허용 목록에 없는 모델은 400 */
{
  const r = await call({ token: userA.idToken, body: { ...simplePrompt(), model: 'gemini-1.5-pro-secret' } });
  record('허용되지 않은 model → 400', r.status === 400 && r.json?.error === 'model-not-allowed', `status=${r.status}`);
}

/* 5. contents 없는 요청은 400 */
{
  const r = await call({ token: userA.idToken, body: { model: 'gemini-3.6-flash' } });
  record('contents 없음 → 400', r.status === 400 && r.json?.error === 'invalid-request', `status=${r.status}`);
}

/* 6. 과대 payload는 413 */
{
  const r = await call({ token: userA.idToken, body: simplePrompt('가'.repeat(70000)) });
  record('과대 prompt → 413', r.status === 413, `status=${r.status} error=${r.json?.error}`);
}

/* 7. 업스트림 429는 429로 전달 */
{
  const r = await call({ token: userA.idToken, body: simplePrompt('QA_UPSTREAM_429 테스트') });
  record('업스트림 429 → 429', r.status === 429 && r.json?.error === 'upstream-rate-limited', `status=${r.status} error=${r.json?.error}`);
}

/* 8. 사용자별 한도: A가 창 한도를 소진해도 B는 영향받지 않는다 */
{
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await call({ token: userA.idToken, body: simplePrompt(`QA burst ${i}`) });
    if (r.status === 429) limited = r;
  }
  record('A 사용자 한도 초과 → 429 + Retry-After',
    Boolean(limited) && limited.json?.error === 'rate-limited' && Number(limited.retryAfter) > 0,
    limited ? `retryAfter=${limited.retryAfter}s scope=${limited.json?.scope}` : '한도에 도달하지 않음');

  const rb = await call({ token: userB.idToken, body: simplePrompt('QA other user') });
  record('B 사용자는 A 한도에 영향받지 않음', rb.status === 200, `status=${rb.status}`);
}

/* 9. 업스트림에는 서버 키만 전달되고, 클라이언트는 키를 보내지 않는다 */
{
  const received = await (await fetch(`${UPSTREAM_BASE}/__received`)).json();
  const all = received.length > 0;
  const everyHasKey = received.every(r => r.hasKey && r.keyValue);
  const modelsUsed = [...new Set(received.map(r => r.path))];
  const onlyAllowedModels = modelsUsed.every(p => p.includes('gemini-3.6-flash'));
  record('업스트림 요청에 서버 키가 붙고 허용 모델만 도달',
    all && everyHasKey && onlyAllowedModels,
    `요청 ${received.length}건, 모델경로 ${modelsUsed.join(',')}`);
}

const failed = results.filter(r => !r.pass);
console.log(`\nai proxy regression: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length === 0 ? 0 : 1);
