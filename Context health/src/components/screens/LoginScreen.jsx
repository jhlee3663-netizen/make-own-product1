import React, { useState, useEffect, useRef } from 'react';
import { auth, authPersistenceReady, googleProvider, appleProvider } from '../../lib/firebase';
import {
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import Pressable from '../common/Pressable';
import LogoMotion from '../common/LogoMotion';
import { APP_EPOCH, LOGO_INTRO_MS } from '../../lib/appEpoch';
import { LegalModal, PRIVACY_CONTENT, TERMS_CONTENT } from './MyPageScreen';


/* ── 아이콘 ── */
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

/* QA-09: Apple 공급자는 Firebase에 설정되어 있지 않다.
   설정을 마치기 전까지는 눌러도 실패하는 버튼을 노출하지 않는다.
   Firebase 콘솔에서 Apple 공급자를 활성화한 뒤 VITE_ENABLE_APPLE_LOGIN=true로 켠다. */
const APPLE_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_APPLE_LOGIN === 'true';

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.299-.03-.014-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.207-2.98.79-.92 2.14-1.61 3.166-1.65.012.13.03.26.03.4zm4.262 16.073c-.378.86-.56 1.25-1.05 2.02-.69 1.07-1.65 2.4-2.857 2.41-1.067.01-1.34-.69-2.79-.68-1.45.01-1.75.69-2.82.68-1.21-.01-2.12-1.21-2.81-2.28-1.93-2.97-2.13-6.46-.94-8.32.84-1.32 2.17-2.09 3.42-2.09 1.27 0 2.07.69 3.12.69 1.02 0 1.65-.69 3.12-.69 1.11 0 2.29.6 3.13 1.64-2.75 1.5-2.31 5.42.48 6.6z"/>
  </svg>
);

const KakaoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#3C1E1E">
    <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.756 1.686 5.172 4.228 6.638L5.1 21l4.636-3.09C10.208 18.078 11.094 18.2 12 18.2c5.523 0 10-3.477 10-7.8C22 6.477 17.523 3 12 3z"/>
  </svg>
);

const NaverIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
    <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
  </svg>
);

const isKakaoInAppBrowser = () =>
  typeof navigator !== 'undefined' && /KAKAOTALK/i.test(navigator.userAgent);

const isNaverInAppBrowser = () =>
  typeof navigator !== 'undefined' && /NAVER\(inapp|NaverApp|com\.naver\.naver/i.test(navigator.userAgent);

const isStandalonePWA = () =>
  typeof window !== 'undefined'
  && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);

const isIOS = () =>
  typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const SOCIAL_OAUTH_KEY = 'context_health_social_oauth';
const SOCIAL_OAUTH_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_LABEL = { kakao: '카카오', naver: '네이버' };
const SOCIAL_CALLBACK_RE = /^\/oauth\/(kakao|naver)\/?$/;

const socialRedirectUri = (provider) => `${window.location.origin}/oauth/${provider}`;

function randomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
}
const REDIRECT_PENDING_KEY = 'context_health_oauth_redirect_pending';

const detectProvider = (fbUser) =>
  fbUser.providerData.some(p => p.providerId === 'apple.com') ? 'apple' : 'google';

function authErrorMessage(provider, error) {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'access_denied') {
    return '';
  }
  if (code === 'auth/network-request-failed') return '네트워크 연결을 확인하고 다시 시도해주세요.';
  if (code === 'auth/unauthorized-domain') return '현재 주소에서는 로그인을 사용할 수 없습니다.';
  if (code === 'auth/operation-not-allowed') return `${provider} 로그인이 현재 비활성화되어 있습니다.`;
  return `${provider} 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.`;
}

async function exchangeSocialCode(provider, code, state) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.currentUser?.isAnonymous) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  const response = await fetch('/api/social-auth', {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider, code, state, redirectUri: socialRedirectUri(provider) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.customToken) {
    const error = new Error(data.error || `social-auth-${response.status}`);
    error.code = data.error || `http-${response.status}`;
    throw error;
  }
  return data.customToken;
}

export default function LoginScreen({ onLogin, authReady = true }) {
  const [loading, setLoading] = useState(null); // 'google' | 'kakao' | 'naver'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeLegal, setActiveLegal] = useState(null);
  // 카카오/네이버에서 돌아와 토큰 교환 중이면 로그인 화면 대신 로딩만 보여준다.
  const [socialCallbackPending, setSocialCallbackPending] = useState(() =>
    SOCIAL_CALLBACK_RE.test(window.location.pathname) && new URLSearchParams(window.location.search).has('code'));
  const isInAppBrowser = isKakaoInAppBrowser() || isNaverInAppBrowser();

  // 최신 onLogin 참조 유지 — useEffect deps에 onLogin을 넣으면 App.jsx 재렌더 시
  // 함수 참조가 바뀌어 getRedirectResult 등이 중복 호출되는 문제 방지
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  /* ── Google/Apple redirect 결과 처리 (standalone PWA / popup-blocked fallback 후 복귀) ── */
  useEffect(() => {
    authPersistenceReady
      .then(() => getRedirectResult(auth))
      .then(result => {
        const pendingLabel = sessionStorage.getItem(REDIRECT_PENDING_KEY);
        sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        // 리다이렉트로 나갔다 돌아왔는데 결과가 없으면 조용히 넘기지 않고 알린다.
        if (!result?.user && pendingLabel && !auth.currentUser) {
          console.error('[Auth redirect] returned without a user', pendingLabel);
          setError(`${pendingLabel} 로그인이 완료되지 않았습니다. 다시 시도해주세요.`);
          return;
        }
        if (result?.user) {
          onLoginRef.current({
            uid:    result.user.uid,
            name:   result.user.displayName,
            email:  result.user.email,
            photo:  result.user.photoURL,
            provider: detectProvider(result.user),
          });
        }
      })
      .catch(e => {
        /* redirect는 Google/Apple 공통 경로다. 공급자를 단정하지 않는다. */
        sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        console.error('[Auth redirect]', e.code, e.message);
        setError(authErrorMessage('소셜', e));
      });
  }, []); // mount 시 1회만 — onLogin ref로 최신 참조 사용

  /* ── 카카오/네이버 콜백 처리 (/oauth/{provider}?code=...&state=...) ── */
  useEffect(() => {
    const match = window.location.pathname.match(SOCIAL_CALLBACK_RE);
    if (!match) return;
    const provider = match[1];
    const label = SOCIAL_LABEL[provider];
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const oauthError = params.get('error');
    window.history.replaceState(window.history.state, document.title, '/');

    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(SOCIAL_OAUTH_KEY) || 'null'); } catch {}
    localStorage.removeItem(SOCIAL_OAUTH_KEY);

    if (oauthError) {
      const cancelledByUser = oauthError === 'access_denied' || params.get('error_code') === 'KOE403';
      if (!cancelledByUser) console.error(`[${label} Auth]`, oauthError, params.get('error_description'));
      setError(cancelledByUser ? '' : `${label} 로그인에 실패했습니다. 다시 시도해주세요.`);
      return;
    }
    if (!code || !pending || pending.provider !== provider || pending.state !== returnedState
      || Date.now() - pending.createdAt > SOCIAL_OAUTH_MAX_AGE_MS) {
      setSocialCallbackPending(false);
      setError(`${label} 로그인 요청이 만료되었습니다. 다시 시도해주세요.`);
      return;
    }

    let cancelled = false;
    setLoading(provider);
    authPersistenceReady
      .then(() => exchangeSocialCode(provider, code, returnedState))
      .then(customToken => signInWithCustomToken(auth, customToken))
      .catch(e => {
        console.error(`[${label} Auth]`, e.code, e.message);
        if (!cancelled) {
          setSocialCallbackPending(false);
          setError(e.code === 'server-error'
            ? `${label} 로그인 서버에 문제가 있습니다. 잠시 후 다시 시도해주세요.`
            : `${label} 로그인에 실패했습니다. 다시 시도해주세요.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => { cancelled = true; };
  }, []); // mount 시 1회만

  /* ── Google/Apple 로그인 ──
     팝업은 클릭 직후 동기적으로 열어야 Safari/iOS가 차단하지 않는다. 그 전에 await 금지. */
  async function signInWithOAuth(providerKey, provider, label) {
    setLoading(providerKey);
    setError('');
    const startRedirect = () => {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, label);
      return auth.currentUser?.isAnonymous
        ? linkWithRedirect(auth.currentUser, provider)
        : signInWithRedirect(auth, provider);
    };
    try {
      if (isStandalonePWA() && !isIOS()) {
        await startRedirect();
        return;
      }
      const result = await (auth.currentUser?.isAnonymous
        ? linkWithPopup(auth.currentUser, provider)
        : signInWithPopup(auth, provider));
      onLoginRef.current({
        uid:    result.user.uid,
        name:   result.user.displayName,
        email:  result.user.email,
        photo:  result.user.photoURL,
        provider: providerKey,
      });
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/web-storage-unsupported') {
        try {
          await startRedirect();
          return;
        } catch (redirectError) {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          console.error(`[${label} Auth]`, redirectError.code, redirectError.message);
          setError(authErrorMessage(label, redirectError));
        }
      } else {
        const message = authErrorMessage(label, e);
        if (message) console.error(`[${label} Auth]`, e.code, e.message);
        setError(message);
      }
    } finally {
      setLoading(null);
    }
  }

  const handleGoogle = () => signInWithOAuth('google', googleProvider, 'Google');
  const handleApple = () => signInWithOAuth('apple', appleProvider, 'Apple');

  /* ── 카카오/네이버 로그인: 인가 코드 리다이렉트 ── */
  function startSocialLogin(provider) {
    const clientId = provider === 'kakao'
      ? import.meta.env.VITE_KAKAO_REST_API_KEY
      : import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId) {
      console.error(`[${SOCIAL_LABEL[provider]} Auth] client id is missing`);
      setError(`${SOCIAL_LABEL[provider]} 로그인을 지금 사용할 수 없습니다.`);
      return;
    }
    setLoading(provider);
    setError('');
    const state = randomState();
    localStorage.setItem(SOCIAL_OAUTH_KEY, JSON.stringify({ provider, state, createdAt: Date.now() }));
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: socialRedirectUri(provider),
      state,
    });
    const base = provider === 'kakao'
      ? 'https://kauth.kakao.com/oauth/authorize'
      : 'https://nid.naver.com/oauth2.0/authorize';
    window.location.assign(`${base}?${params}`);
  }

  const handleKakao = () => startSocialLogin('kakao');
  const handleNaver = () => startSocialLogin('naver');

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('주소 복사에 실패했습니다. 우측 상단 메뉴에서 외부 브라우저로 열어주세요.');
    }
  }

  const BUTTONS = [
    ...(APPLE_LOGIN_ENABLED ? [{
      id: 'apple',
      label: 'Apple로 계속하기',
      icon: <AppleIcon />,
      bg: '#000',
      text: '#fff',
      border: '#000',
      handler: handleApple,
    }] : []),
    {
      id: 'google',
      label: 'Google로 계속하기',
      icon: <GoogleIcon />,
      bg: '#fff',
      text: '#1f1f1f',
      border: '#e0e0e0',
      handler: handleGoogle,
    },
    {
      id: 'kakao',
      label: '카카오로 계속하기',
      icon: <KakaoIcon />,
      bg: '#FEE500',
      text: '#3C1E1E',
      border: '#FEE500',
      handler: handleKakao,
    },
    {
      id: 'naver',
      label: '네이버로 계속하기',
      icon: <NaverIcon />,
      bg: '#03C75A',
      text: '#fff',
      border: '#03C75A',
      handler: handleNaver,
    },
  ];

  /* 처음에는 로고 모션만 보여주고, 모션이 끝나면 로고가 올라가며 글자와 로그인 버튼이 나타난다.
     로그인 상태 확인 중이거나 카카오/네이버에서 돌아와 처리 중일 때는 로고 화면에 머문다. */
  const [formIn, setFormIn] = useState(false);
  useEffect(() => {
    if (!authReady || socialCallbackPending) { setFormIn(false); return undefined; }
    const remaining = APP_EPOCH + LOGO_INTRO_MS - performance.now();
    if (remaining <= 0) { setFormIn(true); return undefined; }
    const timer = setTimeout(() => setFormIn(true), remaining);
    return () => clearTimeout(timer);
  }, [authReady, socialCallbackPending]);

  const ease = 'cubic-bezier(.4,0,.2,1)';

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #3aa0ff, #f79fff)' }}>
      {activeLegal === 'terms' && (
        <LegalModal title="이용약관" content={TERMS_CONTENT} onClose={() => setActiveLegal(null)} />
      )}
      {activeLegal === 'privacy' && (
        <LegalModal title="개인정보처리방침" content={PRIVACY_CONTENT} onClose={() => setActiveLegal(null)} />
      )}

      {/* 로고: 화면 가운데에서 시작해 위로 올라가고, 그 아래로 글자가 나타난다 (시안 402×874 기준 308 → 177) */}
      <div
        className="absolute left-1/2 top-1/2 z-10 flex flex-col items-center"
        style={{
          transform: `translate(-50%, ${formIn ? 'max(-260px, calc(-50dvh + 40px))' : '-129px'})`,
          transition: `transform 0.8s ${ease}`,
        }}
      >
        <LogoMotion tone="white" epoch={APP_EPOCH} />
        <div
          className="flex flex-col items-center gap-1.5 text-center"
          style={{ opacity: formIn ? 1 : 0, transform: formIn ? 'none' : 'translateY(8px)', transition: `opacity 0.6s 0.25s ${ease}, transform 0.6s 0.25s ${ease}` }}
        >
          <h1 className="font-pretendard font-bold text-[28px] leading-[33px] text-white">Context Health</h1>
          <p className="font-pretendard font-normal text-[14px] leading-[17px] text-white whitespace-nowrap">
            AI 기반 운동·식단 관리로 더 건강한 하루를 만들어요
          </p>
        </div>
      </div>

      <div className="flex-1" />

      {/* 하단 로그인 버튼 영역 */}
      <div
        className="relative z-10 px-5 flex flex-col gap-2"
        aria-hidden={!formIn}
        style={{
          paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 16px))',
          opacity: formIn ? 1 : 0,
          transform: formIn ? 'none' : 'translateY(16px)',
          pointerEvents: formIn ? 'auto' : 'none',
          transition: `opacity 0.6s 0.35s ${ease}, transform 0.6s 0.35s ${ease}`,
        }}
      >
        {isInAppBrowser ? (
          <div className="w-full rounded-[16px] border border-[#e9ecef] bg-white/85 px-4 py-4 shadow-[0_8px_24px_rgba(23,26,29,0.08)]">
            <p className="font-pretendard font-semibold text-[16px] text-[#171a1d] text-center tracking-[-0.4px]">
              외부 브라우저에서 열어주세요
            </p>
            <p className="font-pretendard text-[13px] text-[#646d76] text-center leading-[19px] tracking-[-0.325px] mt-2">
              앱 내 브라우저에서는 로그인이 제한될 수 있어요. 우측 상단 메뉴에서 Safari 또는 Chrome으로 열면 정상 이용할 수 있습니다.
            </p>
            <Pressable
              pressScale={0.98}
              onClick={handleCopyLink}
              className="w-full h-[48px] mt-4 rounded-[12px] bg-[#7171FF] text-white font-pretendard font-semibold text-[14px] tracking-[-0.35px]"
            >
              {copied ? '링크가 복사되었습니다' : '링크 복사하기'}
            </Pressable>
          </div>
        ) : (
          <>
            {error && (
              <p role="alert" className="font-pretendard font-medium text-[13px] text-white text-center tracking-[-0.325px] rounded-xl bg-black/20 px-3 py-2">{error}</p>
            )}

            {BUTTONS.map(({ id, label, icon, bg, text, border, handler }) => (
              <Pressable
                key={id}
                pressScale={0.98}
                onClick={handler}
                disabled={!!loading || !formIn}
                className="w-full h-[52px] flex items-center justify-center gap-3 rounded-[14px] font-pretendard font-semibold text-[15px] tracking-[-0.375px] disabled:opacity-60"
                style={{ background: bg, color: text, border: `1.5px solid ${border}` }}
              >
                {loading === id ? (
                  <div className="w-5 h-5 border-2 rounded-full animate-spin"
                       style={{ borderColor: `${text}30`, borderTopColor: text }} />
                ) : (
                  <>
                    {icon}
                    {label}
                  </>
                )}
              </Pressable>
            ))}
          </>
        )}

        {!isInAppBrowser && (
          <p className="font-pretendard text-[12px] leading-[18px] text-white/80 text-center tracking-[-0.3px] mt-2">
            로그인 시 <button type="button" className="underline" onClick={() => setActiveLegal('terms')}>이용약관</button>
            {' 및 '}
            <button type="button" className="underline" onClick={() => setActiveLegal('privacy')}>개인정보처리방침</button>에 동의합니다
          </p>
        )}

        {isInAppBrowser && error && (
          <p role="alert" className="font-pretendard font-medium text-[13px] text-white text-center tracking-[-0.325px] rounded-xl bg-black/20 px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}
