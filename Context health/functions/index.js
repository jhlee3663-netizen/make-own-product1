const { onRequest } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { Octokit } = require('@octokit/rest');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const GITHUB_OWNER = 'jhlee3663-netizen';
const GITHUB_REPO = 'make-own-product1';
const PROJECT_PATH = 'Context health';

const ALLOWED_ORIGINS = new Set([
  'https://context-health-3eb84.web.app',
  'https://context-health-3eb84.firebaseapp.com',
  'http://localhost:5173',
  'https://localhost', // 안드로이드 앱(Capacitor)
  'capacitor://localhost', // iOS 앱(Capacitor)
]);

function setCors(req, res) {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 200) : fallback;
}

function cleanPhotoUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString().slice(0, 1000) : '';
  } catch {
    return '';
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Provider verification failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function verifySocialToken(provider, accessToken) {
  if (provider === 'kakao') {
    const data = await fetchJson('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!data.id) throw new Error('Kakao user id is missing');
    const profile = data.kakao_account?.profile || {};
    return {
      provider,
      providerId: String(data.id),
      name: cleanText(profile.nickname, '카카오 사용자'),
      email: cleanText(data.kakao_account?.email),
      photo: cleanPhotoUrl(profile.profile_image_url),
    };
  }

  if (provider === 'naver') {
    const data = await fetchJson('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data.resultcode !== '00' || !data.response?.id) {
      throw new Error('Naver user id is missing');
    }
    return {
      provider,
      providerId: String(data.response.id),
      name: cleanText(data.response.name || data.response.nickname, '네이버 사용자'),
      email: cleanText(data.response.email),
      photo: cleanPhotoUrl(data.response.profile_image),
    };
  }

  const error = new Error('Unsupported provider');
  error.status = 400;
  throw error;
}

/* AI 기능별 정책·응답 검증·분산 사용량 제한. 다른 함수의 경로는 변경하지 않는다. */
const { createAiHandler } = require('./ai/proxy');
const { createQuotaStore } = require('./ai/quota');
let aiHandler;

exports.aiGenerate = onRequest(
  { region: 'us-central1', timeoutSeconds: 60, secrets: ['GEMINI_KEY'] },
  (req, res) => {
    // Keep SDK initialization out of function discovery and unrelated endpoints.
    aiHandler ||= createAiHandler({
      auth: getAuth(),
      quota: createQuotaStore(getFirestore()),
      verifyAppCheck: token => require('firebase-admin/app-check').getAppCheck().verifyToken(token),
      setCors,
      allowedOrigins: ALLOWED_ORIGINS,
    });
    return aiHandler(req, res);
  },
);

async function migrateAnonymousData(req, targetUid) {
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return;

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(authorization.slice(7));
  } catch {
    return;
  }

  const sourceUid = decoded.uid;
  if (sourceUid === targetUid || decoded.firebase?.sign_in_provider !== 'anonymous') return;

  const db = getFirestore();
  const sourceUserRef = db.doc(`users/${sourceUid}`);
  const targetUserRef = db.doc(`users/${targetUid}`);
  const [sourceUser, targetUser] = await Promise.all([sourceUserRef.get(), targetUserRef.get()]);
  if (!sourceUser.exists || targetUser.exists) return;

  const [rooms, logs] = await Promise.all([
    sourceUserRef.collection('coachRooms').get(),
    db.collection('logs').where('uid', '==', sourceUid).get(),
  ]);

  const writes = [
    { type: 'set', ref: targetUserRef, data: sourceUser.data() },
    ...rooms.docs.map((room) => ({
      type: 'set',
      ref: targetUserRef.collection('coachRooms').doc(room.id),
      data: room.data(),
    })),
    ...logs.docs.map((log) => ({
      type: 'update',
      ref: log.ref,
      data: { uid: targetUid },
    })),
  ];

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((write) => {
      if (write.type === 'set') batch.set(write.ref, write.data, { merge: true });
      else batch.update(write.ref, write.data);
    });
    await batch.commit();
  }
}

/* ── 카카오/네이버 로그인 ──
   브라우저는 인가 코드만 받아 넘기고, 토큰 교환·사용자 확인·Firebase 토큰 발급은 전부 서버에서 한다. */

const SOCIAL_CALLBACK_PATH = { kakao: '/oauth/kakao', naver: '/oauth/naver' };

function socialError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  // 네이버는 실패해도 200과 함께 error 필드를 준다.
  if (!response.ok || data.error || !data.access_token) {
    console.error('Social token exchange rejected', { url, status: response.status, error: data.error, description: data.error_description });
    throw socialError('token-exchange-failed', 401);
  }
  return data.access_token;
}

async function exchangeSocialCode(provider, code, state, redirectUri) {
  if (provider === 'kakao') {
    if (!process.env.KAKAO_REST_API_KEY) throw socialError('server-misconfigured', 500);
    const params = {
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_REST_API_KEY,
      redirect_uri: redirectUri,
      code,
    };
    if (process.env.KAKAO_CLIENT_SECRET) params.client_secret = process.env.KAKAO_CLIENT_SECRET;
    return postForm('https://kauth.kakao.com/oauth/token', params);
  }
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) throw socialError('server-misconfigured', 500);
  return postForm('https://nid.naver.com/oauth2.0/token', {
    grant_type: 'authorization_code',
    client_id: process.env.NAVER_CLIENT_ID,
    client_secret: process.env.NAVER_CLIENT_SECRET,
    code,
    state,
  });
}

function isAllowedRedirectUri(provider, value) {
  try {
    const url = new URL(value);
    return ALLOWED_ORIGINS.has(url.origin) && url.pathname === SOCIAL_CALLBACK_PATH[provider] && !url.search && !url.hash;
  } catch {
    return false;
  }
}

exports.socialAuth = onRequest({
  region: 'us-central1',
  timeoutSeconds: 30,
  secrets: ['KAKAO_CLIENT_SECRET', 'NAVER_CLIENT_SECRET'],
}, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });

  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'origin-not-allowed' });
  }

  const provider = cleanText(req.body?.provider);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const state = typeof req.body?.state === 'string' ? req.body.state : '';
  const redirectUri = typeof req.body?.redirectUri === 'string' ? req.body.redirectUri : '';
  if (!SOCIAL_CALLBACK_PATH[provider] || !code || code.length > 2048 || state.length > 256
    || !isAllowedRedirectUri(provider, redirectUri)) {
    return res.status(400).json({ error: 'invalid-request' });
  }

  let step = 'exchange';
  try {
    const accessToken = await exchangeSocialCode(provider, code, state, redirectUri);
    step = 'verify';
    const profile = await verifySocialToken(provider, accessToken);
    const uid = `${provider}:${profile.providerId}`;
    const auth = getAuth();
    const userRecord = {
      displayName: profile.name,
      photoURL: profile.photo || undefined,
    };

    step = 'upsert-user';
    try {
      await auth.updateUser(uid, userRecord);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await auth.createUser({ uid, ...userRecord });
    }

    step = 'migrate';
    await migrateAnonymousData(req, uid);
    step = 'custom-token';
    const customToken = await auth.createCustomToken(uid, {
      socialProvider: provider,
      socialEmail: profile.email,
    });

    return res.status(200).json({ customToken });
  } catch (error) {
    console.error('Social auth failed', {
      provider,
      step,
      status: error.status,
      code: error.code,
      message: error.message,
    });
    const isServerFault = step === 'upsert-user' || step === 'migrate' || step === 'custom-token' || error.status === 500;
    return res.status(isServerFault ? 500 : 401).json({ error: isServerFault ? 'server-error' : 'provider-rejected' });
  }
});

/* ── 피드·친구 API (functions/social) ── */
const { createHandler: createSocialHandler, deleteSocialData } = require('./social');

exports.social = onRequest(
  { region: 'us-central1', timeoutSeconds: 300, memory: '512MiB', secrets: ['GEMINI_KEY'] },
  createSocialHandler({ setCors, ALLOWED_ORIGINS, consumeAiQuota, aiUpstreamBase }),
);

/* 매일 아침 유튜브 운동 루틴을 골라 큐레이션 계정으로 피드에 올린다 (functions/social/curator.js) */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { runCuration } = require('./social/curator');

exports.curateYoutube = onSchedule(
  { schedule: 'every day 07:00', timeZone: 'Asia/Seoul', region: 'us-central1', timeoutSeconds: 540, memory: '1GiB', secrets: ['GEMINI_KEY', 'YOUTUBE_KEY'] },
  async () => {
    const result = await runCuration({ apiKey: process.env.GEMINI_KEY, upstreamBase: aiUpstreamBase(), youtubeKey: process.env.YOUTUBE_KEY });
    console.log('curateYoutube', result);
  },
);

/* 휴지통(deletedAt이 있는 기록)에서 30일이 지난 것을 영구 삭제한다.
   앱 화면과 개인정보처리방침에 "30일 후 자동 삭제"라고 안내하고 있다. */
const TRASH_RETENTION_DAYS = 30;

exports.purgeTrash = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Asia/Seoul', region: 'us-central1', timeoutSeconds: 540 },
  async () => {
    const { Timestamp } = require('firebase-admin/firestore');
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - TRASH_RETENTION_DAYS * 86400000);
    let deleted = 0;
    for (;;) {
      const snap = await db.collection('logs').where('deletedAt', '<', cutoff).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) break;
    }
    console.log('purgeTrash', { deleted });
  },
);

/* 탈퇴 요청은 최근 로그인 세션에서만 허용한다. 오래 살아 있는 토큰으로 계정이 삭제되지 않도록 한다. */
const DELETE_RECENT_LOGIN_MAX_AGE_SEC = 10 * 60;

exports.deleteAccount = onRequest({ region: 'us-central1', timeoutSeconds: 300 }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });

  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'origin-not-allowed' });
  }

  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(authorization.slice(7), true);
  } catch (error) {
    /* 만료·폐기된 토큰도 사용자가 할 일은 재로그인으로 동일하므로 구분해서 알린다. */
    const needsRelogin = error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked';
    return res.status(401).json({ error: needsRelogin ? 'requires-recent-login' : 'unauthorized' });
  }

  const uid = decoded.uid;
  const authAgeSec = Math.floor(Date.now() / 1000) - Number(decoded.auth_time || 0);
  if (!Number.isFinite(authAgeSec) || authAgeSec > DELETE_RECENT_LOGIN_MAX_AGE_SEC) {
    return res.status(401).json({ error: 'requires-recent-login' });
  }

  const db = getFirestore();
  const stateRef = db.doc(`accountDeletions/${uid}`);
  const deleted = { logs: 0, coachRooms: 0, bodyLogs: 0, mcpTokens: 0, user: 0, auth: false };

  /* 재시도로 이어서 끝낼 수 있도록 남은 문서를 매번 다시 조회한다. */
  async function deleteQueryBatched(queryRef, counterKey) {
    for (;;) {
      const snap = await queryRef.limit(400).get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted[counterKey] += snap.size;
      if (snap.size < 400) return;
    }
  }

  try {
    await stateRef.set({ status: 'in-progress', startedAt: Date.now() }, { merge: true });

    await deleteQueryBatched(db.collection('logs').where('uid', '==', uid), 'logs');
    await deleteQueryBatched(db.collection(`users/${uid}/coachRooms`), 'coachRooms');
    await deleteQueryBatched(db.collection(`users/${uid}/bodyLogs`), 'bodyLogs');
    await deleteQueryBatched(db.collection('mcpTokens').where('uid', '==', uid), 'mcpTokens');
    await deleteQueryBatched(db.collection('mcpAuthCodes').where('uid', '==', uid), 'mcpTokens');

    await deleteSocialData(uid);
    await db.doc(`users/${uid}`).delete();
    deleted.user = 1;

    await getAuth().deleteUser(uid);
    deleted.auth = true;

    await stateRef.set({ status: 'completed', completedAt: Date.now(), deleted }, { merge: true });
    return res.status(200).json({ ok: true, deleted });
  } catch (error) {
    const partial = deleted.logs > 0 || deleted.coachRooms > 0 || deleted.bodyLogs > 0 || deleted.mcpTokens > 0 || deleted.user > 0;
    console.error('Account deletion failed', { uid, code: error.code, partial, deleted });
    try {
      await stateRef.set({ status: 'failed', failedAt: Date.now(), deleted, lastErrorCode: error.code || 'unknown' }, { merge: true });
    } catch (stateError) {
      console.error('Account deletion state write failed', { uid, code: stateError.code });
    }
    return res.status(500).json({ error: 'deletion-failed', partial, deleted });
  }
});

/* ── Claude 커넥터용 MCP 서버 (조회 전용) ──
   허용된 uid(MCP_ALLOWED_UIDS)의 OAuth 토큰으로만 접근할 수 있다. 구현은 ./mcp 참고. */
/* 공용 음식 사전에 값 보내기 (functions/foods.js). 앱은 사전을 읽기만 하고, 쓰기는 여기로만 한다. */
const { contributeFood } = require('./foods');
const FOOD_SOURCES_FROM_APP = new Set(['ai', 'user']);

exports.foodContribute = onRequest({ region: 'us-central1', timeoutSeconds: 30 }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin-not-allowed' });
  const authorization = req.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  let uid;
  try {
    uid = (await getAuth().verifyIdToken(authorization.slice(7))).uid;
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { foods, source } = req.body || {};
  if (!FOOD_SOURCES_FROM_APP.has(source) || !Array.isArray(foods) || foods.length === 0 || foods.length > 40) {
    return res.status(400).json({ error: 'bad-request' });
  }
  const db = getFirestore();
  const results = [];
  for (const food of foods) {
    try { results.push(await contributeFood(db, uid, food, source)); } catch (error) {
      console.error('food contribute failed', { code: error.code, message: error.message });
      results.push('error');
    }
  }
  return res.status(200).json({ results });
});

exports.mcp = onRequest({ region: 'us-central1', timeoutSeconds: 60, secrets: ['MCP_ALLOWED_UIDS'] }, require('./mcp').handler);

exports.sentryWebhook = onRequest({ secrets: ['ANTHROPIC_KEY', 'GITHUB_TOKEN'] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Sentry가 보낸 요청인지 서명으로 확인한다. 비밀값(SENTRY_CLIENT_SECRET)이 없으면 아무 요청도 받지 않는다.
  const sentrySecret = process.env.SENTRY_CLIENT_SECRET;
  if (!sentrySecret) return res.status(503).send('Webhook not configured');
  const expected = crypto.createHmac('sha256', sentrySecret).update(req.rawBody || '').digest('hex');
  const received = String(req.get('sentry-hook-signature') || '');
  if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.status(401).send('Invalid signature');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  try {
    const { action, data } = req.body;
    if (action !== 'created') return res.status(200).send('Ignored');

    const issue = data?.issue;
    if (!issue) return res.status(400).send('No issue');

    const errorTitle = issue.title;
    const culprit = issue.culprit || '';
    const errorValue = issue.metadata?.value || '';
    const filename = issue.metadata?.filename || '';

    // 소스 파일 가져오기
    let sourceContent = '';
    let githubFilePath = '';
    let fileSha = '';

    if (filename) {
      const match = filename.match(/src\/.+\.(jsx?|tsx?)$/);
      if (match) {
        githubFilePath = `${PROJECT_PATH}/${match[0]}`;
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: githubFilePath,
          });
          sourceContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
          fileSha = fileData.sha;
        } catch (_) {}
      }
    }

    // Claude에게 분석 + 수정 요청
    const prompt = sourceContent
      ? `다음 Sentry 에러를 분석하고 수정된 코드를 제공해주세요.

에러: ${errorTitle}
위치: ${culprit}
메시지: ${errorValue}
파일: ${filename}

소스 코드:
\`\`\`
${sourceContent}
\`\`\`

수정된 전체 파일 코드를 \`\`\`fix 블록 안에 넣고, 수정 이유를 간단히 설명해주세요.`
      : `다음 Sentry 에러를 분석해주세요.

에러: ${errorTitle}
위치: ${culprit}
메시지: ${errorValue}

원인과 해결 방법을 한국어로 설명해주세요.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = message.content[0].text;
    const fixMatch = analysis.match(/```fix\n([\s\S]+?)\n```/);

    // 소스파일 + 수정코드 있으면 PR 생성
    if (sourceContent && githubFilePath && fixMatch) {
      const fixedCode = fixMatch[1];
      const branchName = `fix/sentry-${issue.id}`;

      const { data: mainBranch } = await octokit.repos.getBranch({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        branch: 'main',
      });

      await octokit.git.createRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `refs/heads/${branchName}`,
        sha: mainBranch.commit.sha,
      });

      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: githubFilePath,
        message: `fix: ${errorTitle}`,
        content: Buffer.from(fixedCode).toString('base64'),
        sha: fileSha,
        branch: branchName,
      });

      await octokit.pulls.create({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        title: `[Auto Fix] ${errorTitle}`,
        body: `## Sentry 에러 자동 수정\n\n**에러**: ${errorTitle}\n**위치**: ${culprit}\n\n## Claude 분석\n\n${analysis}`,
        head: branchName,
        base: 'main',
      });
    } else {
      // 수정 불가 시 GitHub Issue 생성
      await octokit.issues.create({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        title: `[Sentry] ${errorTitle}`,
        body: `## Sentry 에러 분석\n\n**에러**: ${errorTitle}\n**위치**: ${culprit}\n\n## Claude 분석\n\n${analysis}`,
        labels: ['bug'],
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});
