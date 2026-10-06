/* MCP 커넥터용 OAuth 2.1 (PKCE 필수, 공개 클라이언트).
   - 토큰은 SHA-256 해시로만 저장한다. 원문은 발급 응답에만 존재한다.
   - 허용 목록(MCP_ALLOWED_UIDS)에 없는 uid는 인가·토큰 교환·토큰 사용 어느 단계에서도 통과하지 못한다.
   - 클라이언트 등록(DCR)은 아무것도 저장하지 않는다. 보호는 리다이렉트 URI 고정 목록과 PKCE가 맡는다. */
const crypto = require('crypto');

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
/* 네트워크 재시도로 같은 리프레시 토큰이 곧바로 한 번 더 올 수 있다. 이 시간 안의 재사용은 거절만 하고,
   그 뒤의 재사용은 탈취로 보고 같은 연결(family)의 토큰을 전부 폐기한다. */
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

const ALLOWED_REDIRECT_URIS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
]);

const TOKENS = 'mcpTokens';
const CODES = 'mcpAuthCodes';

class OAuthError extends Error {
  constructor(code, description, status = 400) {
    super(description || code);
    this.code = code;
    this.description = description;
    this.status = status;
  }
}

function allowedUids() {
  return new Set(String(process.env.MCP_ALLOWED_UIDS || '').split(',').map(s => s.trim()).filter(Boolean));
}

/* 목록이 비어 있으면 아무도 통과하지 못한다. */
function isAllowedUid(uid) {
  return typeof uid === 'string' && uid.length > 0 && allowedUids().has(uid);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix) {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function str(value, max = 2048) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : '';
}

function registerClient(body) {
  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0 || !redirectUris.every(uri => ALLOWED_REDIRECT_URIS.has(uri))) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be Claude callback URLs');
  }
  return {
    client_id: `mcpc_${crypto.randomBytes(16).toString('hex')}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: str(body.client_name, 200) || 'MCP client',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

function validateAuthorizeParams(params) {
  const clientId = str(params?.client_id, 200);
  const redirectUri = str(params?.redirect_uri);
  const codeChallenge = str(params?.code_challenge, 128);
  const state = typeof params?.state === 'string' ? params.state : '';
  if (!clientId) throw new OAuthError('invalid_request', 'client_id is required');
  if (!ALLOWED_REDIRECT_URIS.has(redirectUri)) throw new OAuthError('invalid_request', 'redirect_uri is not allowed');
  if (params?.response_type !== 'code') throw new OAuthError('unsupported_response_type', 'response_type must be code');
  if (params?.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw new OAuthError('invalid_request', 'PKCE S256 code_challenge is required');
  }
  if (state.length > 2048) throw new OAuthError('invalid_request', 'state is too long');
  return { clientId, redirectUri, codeChallenge, state };
}

/* 로그인한 사용자가 동의했을 때 호출한다. uid는 검증된 Firebase ID 토큰에서 온 값이어야 한다. */
async function createAuthCode(db, uid, params) {
  const { clientId, redirectUri, codeChallenge, state } = validateAuthorizeParams(params);
  if (!isAllowedUid(uid)) throw new OAuthError('access_denied', 'account is not allowed', 403);
  /* 교환되지 않고 남은 이전 코드는 새 인가 때 정리한다. */
  await deleteWhere(db, 'uid', uid, CODES);
  const code = randomToken('mcpcode');
  const now = Date.now();
  await db.collection(CODES).doc(sha256Hex(code)).set({
    uid, clientId, redirectUri, codeChallenge, createdAt: now, expiresAt: now + CODE_TTL_MS,
  });
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

function tokenPair(tx, db, { uid, clientId, familyId, now }) {
  const accessToken = randomToken('mcpat');
  const refreshToken = randomToken('mcprt');
  tx.set(db.collection(TOKENS).doc(sha256Hex(accessToken)), {
    kind: 'access', uid, clientId, familyId, createdAt: now, expiresAt: now + ACCESS_TTL_MS,
  });
  tx.set(db.collection(TOKENS).doc(sha256Hex(refreshToken)), {
    kind: 'refresh', uid, clientId, familyId, createdAt: now, expiresAt: now + REFRESH_TTL_MS, used: false,
  });
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: 'read',
  };
}

async function deleteWhere(db, field, value, collection = TOKENS) {
  let deleted = 0;
  for (;;) {
    const snap = await db.collection(collection).where(field, '==', value).limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) return deleted;
  }
}

/* 만료된 토큰 문서가 쌓이지 않도록 발급 때마다 그 사용자의 만료분을 지운다. 실패해도 발급에는 영향이 없다. */
async function purgeExpired(db, uid, now) {
  try {
    const snap = await db.collection(TOKENS).where('uid', '==', uid).limit(400).get();
    const expired = snap.docs.filter(d => Number(d.data().expiresAt || 0) < now);
    if (expired.length === 0) return;
    const batch = db.batch();
    expired.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    console.error('MCP token purge failed', { code: error.code });
  }
}

async function exchangeAuthCode(db, body) {
  const code = str(body?.code, 512);
  const verifier = str(body?.code_verifier, 128);
  const clientId = str(body?.client_id, 200);
  const redirectUri = str(body?.redirect_uri);
  if (!code || !verifier || !clientId) throw new OAuthError('invalid_request', 'code, code_verifier, client_id are required');

  const ref = db.collection(CODES).doc(sha256Hex(code));
  const now = Date.now();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'invalid_grant' };
    const data = snap.data();
    /* 검증 결과와 무관하게 코드는 한 번 쓰면 사라진다. */
    tx.delete(ref);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const valid = data.expiresAt > now
      && data.clientId === clientId
      && (!redirectUri || data.redirectUri === redirectUri)
      && data.codeChallenge === challenge
      && isAllowedUid(data.uid);
    if (!valid) return { error: 'invalid_grant' };
    return { uid: data.uid, tokens: tokenPair(tx, db, { uid: data.uid, clientId, familyId: crypto.randomUUID(), now }) };
  });
  if (result.error) throw new OAuthError(result.error, 'authorization code is invalid or expired');
  await purgeExpired(db, result.uid, now);
  return result.tokens;
}

async function refreshTokens(db, body) {
  const refreshToken = str(body?.refresh_token, 512);
  const clientId = str(body?.client_id, 200);
  if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required');

  const ref = db.collection(TOKENS).doc(sha256Hex(refreshToken));
  const now = Date.now();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'invalid_grant' };
    const data = snap.data();
    if (data.kind !== 'refresh') return { error: 'invalid_grant' };
    if (data.used) {
      return { error: 'invalid_grant', revokeFamily: now - Number(data.usedAt || 0) > REFRESH_REUSE_GRACE_MS ? data.familyId : null };
    }
    if (data.expiresAt <= now || (clientId && data.clientId !== clientId)) return { error: 'invalid_grant' };
    if (!isAllowedUid(data.uid)) return { error: 'invalid_grant', revokeFamily: data.familyId };
    tx.update(ref, { used: true, usedAt: now });
    return { uid: data.uid, tokens: tokenPair(tx, db, { uid: data.uid, clientId: data.clientId, familyId: data.familyId, now }) };
  });
  if (result.revokeFamily) await deleteWhere(db, 'familyId', result.revokeFamily);
  if (result.error) throw new OAuthError(result.error, 'refresh token is invalid or expired');
  await purgeExpired(db, result.uid, now);
  return result.tokens;
}

/* MCP 요청마다 호출한다. 유효하면 uid, 아니면 null. */
async function verifyAccessToken(db, token) {
  if (!str(token, 512)) return null;
  const snap = await db.collection(TOKENS).doc(sha256Hex(token)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.kind !== 'access' || data.expiresAt <= Date.now() || !isAllowedUid(data.uid)) return null;
  return data.uid;
}

/* RFC 7009. 토큰 하나를 폐기하면 같은 연결의 나머지 토큰도 함께 폐기한다. */
async function revokeToken(db, token) {
  if (!str(token, 512)) return;
  const snap = await db.collection(TOKENS).doc(sha256Hex(token)).get();
  if (!snap.exists) return;
  await deleteWhere(db, 'familyId', snap.data().familyId);
}

async function revokeAllForUid(db, uid) {
  await deleteWhere(db, 'uid', uid, CODES);
  return deleteWhere(db, 'uid', uid);
}

async function hasActiveConnection(db, uid) {
  const now = Date.now();
  const snap = await db.collection(TOKENS).where('uid', '==', uid).limit(400).get();
  return snap.docs.some((d) => {
    const data = d.data();
    return data.kind === 'refresh' && !data.used && data.expiresAt > now;
  });
}

module.exports = {
  ACCESS_TTL_MS,
  ALLOWED_REDIRECT_URIS,
  OAuthError,
  createAuthCode,
  exchangeAuthCode,
  hasActiveConnection,
  isAllowedUid,
  refreshTokens,
  registerClient,
  revokeAllForUid,
  revokeToken,
  verifyAccessToken,
};
