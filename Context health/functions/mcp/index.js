/* claude.ai 커스텀 커넥터용 MCP 서버 (Streamable HTTP, 상태 없음) + OAuth 엔드포인트.
   Hosting rewrite로 /mcp, /.well-known/oauth-*, /api/mcp-oauth/* 가 이 함수 하나로 들어온다.
   제공하는 도구는 전부 조회 전용이다. */
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { ToolInputError } = require('./parse');
const { TOOLS, callTool } = require('./tools');
const oauth = require('./oauth');
const { readOnlyDb } = require('./readonly');

const SERVER_INFO = { name: 'context-health', title: 'Context Health 기록 조회', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = [
  '사용자 본인의 운동·식단·체중·인바디 기록을 조회하는 읽기 전용 서버다. 기록을 수정하거나 추가하는 도구는 없다.',
  '날짜는 모두 한국 시간(KST) 기준 YYYY-MM-DD다. 응답이 길어지지 않게 필요한 기간과 종목만 조회하라.',
  '운동 종목명은 사용자가 적은 그대로이며 표기가 일관되지 않다. 특정 종목을 볼 때는 list_exercises로 실제 표기를 확인한 뒤 get_workouts의 exercise 필터를 써라.',
  '세트 기록은 원문(raw)과 서버 파싱값(parsed)이 함께 온다. 둘이 어긋나 보이면 원문을 믿어라.',
  '아침 공복 체중(get_morning_weight)과 인바디 체중(get_body_composition)은 다른 측정이다. 인바디는 기기(270/770)와 측정 조건(공복/저녁)이 다르면 직접 비교하지 마라.',
].join('\n');

function publicOrigin() {
  return process.env.MCP_PUBLIC_ORIGIN || 'https://context-health-3eb84.web.app';
}

const APP_ORIGINS = new Set([
  'https://context-health-3eb84.web.app',
  'https://context-health-3eb84.firebaseapp.com',
  'http://localhost:5173',
]);

function bearer(req) {
  const authorization = req.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function oauthFail(res, error) {
  if (error instanceof oauth.OAuthError) {
    return res.status(error.status).json({ error: error.code, error_description: error.description });
  }
  console.error('MCP OAuth failed', { code: error.code, message: error.message });
  return res.status(500).json({ error: 'server_error' });
}

/* ── OAuth 메타데이터 ── */

function protectedResourceMetadata() {
  const origin = publicOrigin();
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read'],
    resource_name: SERVER_INFO.title,
  };
}

function authorizationServerMetadata() {
  const origin = publicOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp-authorize`,
    token_endpoint: `${origin}/api/mcp-oauth/token`,
    registration_endpoint: `${origin}/api/mcp-oauth/register`,
    revocation_endpoint: `${origin}/api/mcp-oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read'],
  };
}

/* ── 앱(브라우저)에서 부르는 엔드포인트: Firebase ID 토큰으로 본인 확인 ── */

async function appUser(req, res) {
  const origin = req.get('origin');
  if (origin && !APP_ORIGINS.has(origin)) {
    res.status(403).json({ error: 'origin-not-allowed' });
    return null;
  }
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  try {
    return await getAuth().verifyIdToken(token, true);
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
}

async function handleApprove(req, res) {
  const decoded = await appUser(req, res);
  if (!decoded) return undefined;
  if (decoded.firebase?.sign_in_provider === 'anonymous') return res.status(403).json({ error: 'access_denied' });
  try {
    const redirectTo = await oauth.createAuthCode(getFirestore(), decoded.uid, req.body || {});
    console.log('MCP authorization approved', { uid: decoded.uid });
    return res.status(200).json({ redirectTo });
  } catch (error) {
    return oauthFail(res, error);
  }
}

async function handleStatus(req, res) {
  const decoded = await appUser(req, res);
  if (!decoded) return undefined;
  const connected = await oauth.hasActiveConnection(getFirestore(), decoded.uid);
  return res.status(200).json({ connected, allowed: oauth.isAllowedUid(decoded.uid) });
}

async function handleDisconnect(req, res) {
  const decoded = await appUser(req, res);
  if (!decoded) return undefined;
  const revoked = await oauth.revokeAllForUid(getFirestore(), decoded.uid);
  console.log('MCP connection revoked by user', { uid: decoded.uid, revoked });
  return res.status(200).json({ ok: true, revoked });
}

/* ── claude.ai가 부르는 OAuth 엔드포인트 ── */

async function handleToken(req, res) {
  const body = req.body || {};
  try {
    let tokens;
    if (body.grant_type === 'authorization_code') tokens = await oauth.exchangeAuthCode(getFirestore(), body);
    else if (body.grant_type === 'refresh_token') tokens = await oauth.refreshTokens(getFirestore(), body);
    else throw new oauth.OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
    return res.status(200).json(tokens);
  } catch (error) {
    return oauthFail(res, error);
  }
}

/* ── MCP (JSON-RPC) ── */

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleRpc(message, uid) {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message?.id, -32600, 'Invalid Request');
  }
  const { id, method, params } = message;
  /* 알림(id 없음)에는 응답하지 않는다. */
  if (id === undefined || id === null) return null;

  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const name = params?.name;
    try {
      const data = await callTool(readOnlyDb(getFirestore()), uid, name, params?.arguments);
      console.log('MCP tool call', { uid, tool: name });
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } };
    } catch (error) {
      const expected = error instanceof ToolInputError;
      if (!expected) console.error('MCP tool failed', { uid, tool: name, code: error.code, message: error.message });
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: expected ? error.message : '기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.' }],
        },
      };
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

async function handleMcp(req, res) {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).json(rpcError(null, -32000, 'Method Not Allowed'));
  }

  const uid = await oauth.verifyAccessToken(getFirestore(), bearer(req));
  if (!uid) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${publicOrigin()}/.well-known/oauth-protected-resource"`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json(rpcError(null, -32700, 'Parse error'));

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return res.status(400).json(rpcError(null, -32600, 'Invalid Request'));
    const responses = (await Promise.all(body.map(message => handleRpc(message, uid)))).filter(Boolean);
    return responses.length ? res.status(200).json(responses) : res.status(202).send('');
  }
  const response = await handleRpc(body, uid);
  return response ? res.status(200).json(response) : res.status(202).send('');
}

async function handler(req, res) {
  res.set('Cache-Control', 'no-store');
  const path = (req.path || '/').replace(/\/+$/, '') || '/';

  try {
    if (path.includes('/.well-known/oauth-protected-resource')) {
      return res.status(200).json(protectedResourceMetadata());
    }
    if (path.includes('/.well-known/oauth-authorization-server')) {
      return res.status(200).json(authorizationServerMetadata());
    }

    if (path.startsWith('/api/mcp-oauth/')) {
      if (req.method !== 'POST') {
        res.set('Allow', 'POST');
        return res.status(405).json({ error: 'method-not-allowed' });
      }
      const action = path.slice('/api/mcp-oauth/'.length);
      if (action === 'register') {
        try {
          return res.status(201).json(oauth.registerClient(req.body || {}));
        } catch (error) {
          return oauthFail(res, error);
        }
      }
      if (action === 'token') return await handleToken(req, res);
      if (action === 'revoke') {
        await oauth.revokeToken(getFirestore(), req.body?.token);
        return res.status(200).json({});
      }
      if (action === 'approve') return await handleApprove(req, res);
      if (action === 'status') return await handleStatus(req, res);
      if (action === 'disconnect') return await handleDisconnect(req, res);
      return res.status(404).json({ error: 'not-found' });
    }

    if (path === '/' || path === '/mcp') return await handleMcp(req, res);
    return res.status(404).json({ error: 'not-found' });
  } catch (error) {
    console.error('MCP handler failed', { path, code: error.code, message: error.message });
    return res.status(500).json({ error: 'server-error' });
  }
}

module.exports = { handler };
