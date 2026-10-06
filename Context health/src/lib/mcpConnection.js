import { auth } from './firebase';

/* Claude 커넥터(MCP) 연결 관리. 서버(/api/mcp-oauth/*)가 Firebase ID 토큰으로 본인을 확인한다. */

const REQUEST_KEY = 'mcp_authorize_request';
const AUTHORIZE_PATH = '/mcp-authorize';

/* claude.ai가 /mcp-authorize?client_id=...로 보낸 인가 요청을 보관한다.
   소셜 로그인 리다이렉트를 거쳐도 이어갈 수 있도록 sessionStorage에 두고 주소는 정리한다. */
export function captureMcpAuthorizeRequest() {
  try {
    if (window.location.pathname === AUTHORIZE_PATH) {
      sessionStorage.setItem(REQUEST_KEY, window.location.search);
      window.history.replaceState(window.history.state, document.title, '/');
    }
    const search = sessionStorage.getItem(REQUEST_KEY);
    if (!search) return null;
    const params = Object.fromEntries(new URLSearchParams(search));
    return params.client_id && params.redirect_uri ? params : null;
  } catch {
    return null;
  }
}

export function clearMcpAuthorizeRequest() {
  try { sessionStorage.removeItem(REQUEST_KEY); } catch {}
}

async function post(action, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const token = await user.getIdToken();
  const res = await fetch(`/api/mcp-oauth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'request-failed');
    error.code = data.error;
    error.status = res.status;
    throw error;
  }
  return data;
}

export const approveMcpAuthorize = (params) => post('approve', params);
export const getMcpStatus = () => post('status');
export const disconnectMcp = () => post('disconnect');
