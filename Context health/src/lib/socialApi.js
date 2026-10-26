import { auth } from './firebase';
import { apiUrl, isNativeApp, WEB_ORIGIN } from './native';

/* 피드·친구 서버(/api/social/*) 호출. 친구·요청·차단·댓글은 전부 서버를 거친다. */
const BASE = import.meta.env.VITE_SOCIAL_API_BASE || apiUrl('/api/social');

export class SocialError extends Error {
  constructor(code, status = 0, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

export async function socialCall(action, body = {}, { auth: needAuth = true, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth || auth.currentUser) {
    const user = auth.currentUser;
    if (!user && needAuth) throw new SocialError('unauthorized', 401);
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  let res;
  try {
    res = await fetch(`${BASE}/${action}`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new SocialError('network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, ...extra } = data || {};
    throw new SocialError(error || 'server-error', res.status, extra);
  }
  return data;
}

const MESSAGES = {
  network: '연결이 끊겼어요. 인터넷 연결을 확인해 주세요.',
  unauthorized: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  'profile-required': '먼저 아이디를 정해 주세요.',
  'handle-taken': '이미 있는 아이디예요.',
  'handle-format': '영문 소문자·숫자·밑줄·점으로 3~20자까지 쓸 수 있어요.',
  'handle-cooldown': '아이디는 바꾼 뒤 30일 동안 다시 바꿀 수 없어요.',
  'friend-limit-self': '친구가 가득 찼어요. 친구는 100명까지예요.',
  'friend-limit-other': '상대의 친구가 가득 찼어요.',
  'not-found': '볼 수 없는 내용이에요.',
  'not-allowed': '할 수 없는 요청이에요.',
  'request-gone': '이미 처리된 요청이에요.',
  'not-youtube': '유튜브 링크만 가져올 수 있어요.',
  'video-unavailable': '볼 수 없는 영상이에요. 비공개·삭제·연령 제한 영상은 가져올 수 없어요.',
  'not-routine': '이 영상에서 운동 루틴을 찾지 못했어요.',
  'too-long': '60분 이하 영상만 가져올 수 있어요.',
  'ai-rate-limited': 'AI 사용량이 많아요. 잠시 뒤에 다시 시도해 주세요.',
  'ai-timeout': '정리가 오래 걸리고 있어요. 잠시 뒤에 다시 시도해 주세요.',
  'ai-failed': '정리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
  empty: '내용을 적어 주세요.',
};

export function socialErrorMessage(error) {
  return MESSAGES[error?.code] || '잠시 후 다시 시도해 주세요.';
}

/* "2시간 전", "어제", "10. 14" */
export function timeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}. ${d.getDate()}`;
}

export function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/* 초대 링크 주소 */
export function inviteUrl(code) {
  return `${isNativeApp ? WEB_ORIGIN : window.location.origin}/i/${code}`;
}
