import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider } from '../../lib/firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import Pressable from '../common/Pressable';


/* ── 아이콘 ── */
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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

const BUBBLES = [
  { id: 1, text: '운동',       left: '74%', top: '49%', bg: 'rgba(142,185,255,0.08)', delay: '0s',   dur: '7s'   },
  { id: 2, text: '루틴',       left: '8%',  top: '43%', bg: 'rgba(100,255,252,0.08)', delay: '1.8s', dur: '8s'   },
  { id: 3, text: '탄단지',     left: '5%',  top: '63%', bg: 'rgba(142,185,255,0.08)', delay: '0.6s', dur: '9s'   },
  { id: 4, text: '스쿼트',     left: '18%', top: '67%', bg: 'rgba(139,255,191,0.08)', delay: '4.5s', dur: '8s'   },
  { id: 5, text: '헬스',       left: '70%', top: '41%', bg: 'rgba(142,185,255,0.08)', delay: '1.2s', dur: '9.5s' },
  { id: 6, text: '데드리프트', left: '55%', top: '56%', bg: 'rgba(100,255,252,0.08)', delay: '3.5s', dur: '8.5s' },
];

const isKakaoInAppBrowser = () =>
  typeof navigator !== 'undefined' && /KAKAOTALK/i.test(navigator.userAgent);

const isNaverInAppBrowser = () =>
  typeof navigator !== 'undefined' && /NAVER\(inapp|NaverApp|com\.naver\.naver/i.test(navigator.userAgent);

const isStandalonePWA = () =>
  typeof window !== 'undefined' && window.navigator.standalone === true;

const isIOS = () =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export default function LoginScreen({ onLogin }) {
  const [loading, setLoading] = useState(null); // 'google' | 'kakao' | 'naver'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [bubbleStates, setBubbleStates] = useState({});
  const isInAppBrowser = isKakaoInAppBrowser() || isNaverInAppBrowser();

  // 최신 onLogin 참조 유지 — useEffect deps에 onLogin을 넣으면 App.jsx 재렌더 시
  // 함수 참조가 바뀌어 getRedirectResult 등이 중복 호출되는 문제 방지
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  function popBubble(id) {
    if (bubbleStates[id]) return;
    setBubbleStates(prev => ({ ...prev, [id]: 'popping' }));
    setTimeout(() => {
      setBubbleStates(prev => ({ ...prev, [id]: 'hidden' }));
      setTimeout(() => {
        setBubbleStates(prev => { const next = { ...prev }; delete next[id]; return next; });
      }, 3000 + Math.random() * 3000);
    }, 300);
  }

  /* ── Google redirect 결과 처리 (standalone PWA / popup-blocked fallback 후 복귀) ── */
  useEffect(() => {
    getRedirectResult(auth)
      .then(result => {
        if (result?.user) {
          onLoginRef.current({
            uid:    result.user.uid,
            name:   result.user.displayName,
            email:  result.user.email,
            photo:  result.user.photoURL,
            provider: 'google',
          });
        }
      })
      .catch(e => {
        if (e.code !== 'auth/popup-closed-by-user') {
          setError('Google 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
      });
  }, []); // mount 시 1회만 — onLogin ref로 최신 참조 사용

  /* ── Naver 콜백 처리 (OAuth redirect 후 복귀 시 access_token이 hash에 존재) ── */
  useEffect(() => {
    if (!window.location.hash.includes('access_token')) return;
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId || !window.naver) return;

    const naverLogin = new window.naver.LoginWithNaverId({
      clientId,
      callbackUrl: window.location.origin,
      isPopup: false,
      loginButton: { color: 'green', type: 1, height: 1 },
    });
    naverLogin.init();

    naverLogin.getLoginStatus((status) => {
      if (!status) return;
      const u = naverLogin.user;
      const userData = {
        uid:      `naver_${u.id}`,
        name:     u.name || '네이버 사용자',
        email:    u.email || '',
        photo:    u.profile_image || '',
        provider: 'naver',
      };
      localStorage.setItem('auth_user', JSON.stringify(userData));
      onLoginRef.current(userData);
      window.history.replaceState({}, document.title, window.location.pathname);
    });
  }, []); // mount 시 1회만

  /* ── Google 로그인 ── */
  async function handleGoogle() {
    setLoading('google');
    setError('');
    try {
      // iOS는 standalone 포함 redirect 시 ITP가 인증 쿠키 차단 → popup 사용
      // 비iOS standalone PWA(Android 등)만 redirect
      if (isStandalonePWA() && !isIOS()) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      const result = await signInWithPopup(auth, googleProvider);
      onLoginRef.current({
        uid:    result.user.uid,
        name:   result.user.displayName,
        email:  result.user.email,
        photo:  result.user.photoURL,
        provider: 'google',
      });
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/web-storage-unsupported') {
        // 팝업 차단 또는 sessionStorage 차단(시크릿 모드 등) → redirect fallback
        // Firebase redirect는 sessionStorage 대신 indexedDB/localStorage 사용하므로 iOS에서도 시도
        await signInWithRedirect(auth, googleProvider);
      } else if (e.code !== 'auth/popup-closed-by-user') {
        setError('Google 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
        console.error('[Google Auth]', e.code, e.message);
      }
    } finally {
      setLoading(null);
    }
  }

  /* ── Kakao 로그인 ── */
  function handleKakao() {
    try {
      const key = import.meta.env.VITE_KAKAO_APP_KEY;
      if (!key) { setError('VITE_KAKAO_APP_KEY가 .env에 없습니다.'); return; }
      if (!window.Kakao) { setError('카카오 SDK를 불러오지 못했습니다. 페이지를 새로고침 해주세요.'); return; }
      setLoading('kakao');
      setError('');

      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(key);
      }

      window.Kakao.Auth.login({
        success() {
          window.Kakao.API.request({
            url: '/v2/user/me',
            success(res) {
              const profile = res.kakao_account?.profile;
              const user = {
                uid:      `kakao_${res.id}`,
                name:     profile?.nickname || '카카오 사용자',
                email:    res.kakao_account?.email || '',
                photo:    profile?.profile_image_url || '',
                provider: 'kakao',
              };
              localStorage.setItem('auth_user', JSON.stringify(user));
              onLoginRef.current(user);
              setLoading(null);
            },
            fail(err) {
              setError('프로필 조회 실패: ' + JSON.stringify(err));
              setLoading(null);
            },
          });
        },
        fail(err) {
          const msg = err?.code === 'KOE009'
            ? '카카오 앱 설정 오류입니다. 잠시 후 다시 시도하거나 Google 로그인을 이용해주세요.'
            : `Kakao 로그인 실패: ${err?.msg || JSON.stringify(err)}`;
          setError(msg);
          setLoading(null);
        },
      });
    } catch (err) {
      setError('에러 발생: ' + err.message);
      setLoading(null);
      console.error(err);
    }
  }

  /* ── Naver 로그인 ── */
  // SDK 버튼 방식 대신 직접 OAuth URL redirect
  // (SDK 버튼은 init() 호출 전까지 DOM에 없어서 버튼 클릭 방식이 불안정함)
  function handleNaver() {
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId) { setError('VITE_NAVER_CLIENT_ID가 .env에 없습니다.'); return; }
    setLoading('naver');
    const state = Math.random().toString(36).substring(2, 15);
    const redirectUri = encodeURIComponent(window.location.origin);
    window.location.href = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;
  }

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

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-white">

      {/* 그라디언트 오버레이 — 흰 화면에서 퍼지듯 등장 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 140% 55% at 50% 0%, #d9efff 0%, #ecf2fe 29%, #fbfdff 64%, #ffffff 100%)',
          animation: 'loginGradientIn 1s cubic-bezier(.4,0,.2,1) forwards',
        }}
      />

      {/* 플로팅 말풍선 */}
      {BUBBLES.map(({ id, text, left, top, bg, delay, dur }) => {
        const state = bubbleStates[id];
        if (state === 'hidden') return null;
        return (
          <div
            key={id}
            className="absolute z-[1] cursor-pointer"
            style={{
              left,
              top,
              animation: state === 'popping'
                ? 'bubblePop 0.3s ease-out forwards'
                : `bubbleFloat ${dur} ${delay} ease-in-out infinite`,
            }}
            onClick={() => popBubble(id)}
          >
            <div
              className="px-4 py-2 rounded-full font-pretendard font-medium text-[12px] text-[#646d76] whitespace-nowrap"
              style={{
                background: bg,
                boxShadow: '0px 1px 2px rgba(23,26,29,0.05), 0px 1px 2px rgba(23,26,29,0.1)',
              }}
            >
              {text}
            </div>
          </div>
        );
      })}

      {/* 중앙 콘텐츠 */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-[39px] pt-[8vh]">
        {/* 텍스트 */}
        <div
          className="flex flex-col items-center gap-2 w-full text-center"
          style={{ animation: 'loginTextIn 0.8s 0.2s cubic-bezier(.4,0,.2,1) both' }}
        >
          <h1 className="font-pretendard font-bold text-[28px] text-[#171a1d] w-full">
            Context Health
          </h1>
          <p className="font-pretendard font-normal text-[15px] text-[#646d76] w-full leading-snug">
            AI 기반 운동·식단 관리로 더 건강한 하루를 만들어요
          </p>
        </div>

        {/* 로고 이미지 — 텍스트와 버튼 사이 중앙 배치 */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-[228px] h-[228px] shrink-0"
            style={{ animation: 'loginLogoIn 1s 0.1s cubic-bezier(.34,1.56,.64,1) both' }}
          >
            <img src="/logo-main.png" alt="Context Health logo" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* 하단 로그인 버튼 영역 */}
      <div
        className="relative z-10 px-5 flex flex-col gap-3"
        style={{ paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 16px))', animation: 'loginButtonsIn 0.7s 0.4s cubic-bezier(.4,0,.2,1) both' }}
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
              className="w-full h-[48px] mt-4 rounded-[12px] bg-[#3476EE] text-white font-pretendard font-semibold text-[14px] tracking-[-0.35px]"
            >
              {copied ? '링크가 복사되었습니다' : '링크 복사하기'}
            </Pressable>
          </div>
        ) : (
          <>
            {error && (
              <p className="font-pretendard text-[13px] text-[#e05a2b] text-center tracking-[-0.325px] -mb-1">{error}</p>
            )}

            {BUTTONS.map(({ id, label, icon, bg, text, border, handler }) => (
              <Pressable
                key={id}
                pressScale={0.98}
                onClick={handler}
                disabled={!!loading}
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
          <p className="font-pretendard text-[12px] text-[#adb5bd] text-center tracking-[-0.3px] mt-1">
            로그인 시 <span className="underline cursor-pointer">이용약관</span> 및 <span className="underline cursor-pointer">개인정보처리방침</span>에 동의합니다
          </p>
        )}

        {isInAppBrowser && error && (
          <p className="font-pretendard text-[13px] text-[#e05a2b] text-center tracking-[-0.325px] -mb-1">{error}</p>
        )}

        {/* 네이버 SDK 콜백 처리용 컨테이너 (숨김) */}
        <div id="naverIdLogin" style={{ display: 'none' }}></div>
      </div>
    </div>
  );
}
