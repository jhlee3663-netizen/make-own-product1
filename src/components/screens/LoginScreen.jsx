import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../../lib/firebase';
import { signInWithPopup } from 'firebase/auth';

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
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#03C75A">
    <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
  </svg>
);

export default function LoginScreen({ onLogin }) {
  const [loading, setLoading] = useState(null); // 'google' | 'kakao' | 'naver'
  const [error, setError] = useState('');

  /* ── Naver SDK 초기화 및 콜백 처리 ── */
  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId || !window.naver) return;

    const naverLogin = new window.naver.LoginWithNaverId({
      clientId,
      callbackUrl: window.location.origin,
      isPopup: false,
      loginButton: { color: "green", type: 1, height: 1 } // 히든 버튼
    });
    naverLogin.init();

    // 콜백으로 돌아왔을 때 상태 확인
    window.addEventListener('load', () => {
      naverLogin.getLoginStatus((status) => {
        if (status) {
          const user = naverLogin.user;
          const userData = {
            uid:      `naver_${user.id}`,
            name:     user.name || '네이버 사용자',
            email:    user.email || '',
            photo:    user.profile_image || '',
            provider: 'naver',
          };
          localStorage.setItem('auth_user', JSON.stringify(userData));
          onLogin(userData);
          // 해시 제거 (깔끔한 URL 유지)
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
    });
  }, [onLogin]);

  /* ── Google 로그인 ── */
  async function handleGoogle() {
    setLoading('google');
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onLogin({
        uid:    result.user.uid,
        name:   result.user.displayName,
        email:  result.user.email,
        photo:  result.user.photoURL,
        provider: 'google',
      });
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Google 로그인에 실패했습니다.');
      }
    } finally {
      setLoading(null);
    }
  }

  /* ── Kakao 로그인 ── */
  function handleKakao() {
    const key = import.meta.env.VITE_KAKAO_APP_KEY;
    if (!key) { setError('VITE_KAKAO_APP_KEY가 .env에 없습니다.'); return; }
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
            onLogin(user);
            setLoading(null);
          },
          fail(err) { setError('프로필 조회 실패'); setLoading(null); console.error(err); },
        });
      },
      fail(err) { setError('Kakao 로그인 실패'); setLoading(null); console.error(err); },
    });
  }

  /* ── Naver 로그인 ── */
  function handleNaver() {
    const clientId = import.meta.env.VITE_NAVER_CLIENT_ID;
    if (!clientId) { setError('VITE_NAVER_CLIENT_ID가 .env에 없습니다.'); return; }
    
    const naverBtn = document.getElementById('naverIdLogin_loginButton');
    if (naverBtn) {
      naverBtn.click();
    } else {
      setError('네이버 로그인 초기화 실패');
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
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      {/* 배경 그라디언트 */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#f0f7ff] via-white to-white pointer-events-none" />

      {/* 상단 일러스트 영역 */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-8 pt-16 pb-4">
        {/* 앱 아이콘 */}
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#0054d1] to-[#228bed] flex items-center justify-center shadow-lg shadow-[#0054d1]/30 mb-6">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M20 8C13.373 8 8 13.373 8 20C8 26.627 13.373 32 20 32C26.627 32 32 26.627 32 20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M26 8L32 8L32 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M32 8L22 18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="4" fill="white"/>
          </svg>
        </div>

        {/* 앱명 */}
        <h1 className="font-pretendard font-bold text-[28px] tracking-[-0.7px] text-[#171a1d] mb-2 text-center">
          Context Health
        </h1>
        <p className="font-pretendard font-normal text-[15px] tracking-[-0.375px] text-[#646d76] text-center leading-[22px] mb-10">
          AI 기반 운동·식단 관리로<br/>더 건강한 하루를 만들어요
        </p>

        {/* 특징 카드 3개 */}
        <div className="w-full flex flex-col gap-3 mb-10">
          {[
            { emoji: '🏋️', title: '운동 기록', desc: 'AI가 운동 내용을 분석해 자동 정리' },
            { emoji: '🥗', title: '식단 관리', desc: '탄·단·지 자동 계산으로 맞춤 식단' },
            { emoji: '📊', title: '목표 달성', desc: '일별 칼로리·영양소 현황 한눈에 확인' },
          ].map(({ emoji, title, desc }) => (
            <div key={title} className="flex items-center gap-3 bg-[#f8f9fa] rounded-[14px] px-4 py-3">
              <span className="text-[22px] w-8 text-center">{emoji}</span>
              <div>
                <p className="font-pretendard font-semibold text-[14px] text-[#171a1d] tracking-[-0.35px] m-0">{title}</p>
                <p className="font-pretendard font-normal text-[12px] text-[#868e96] tracking-[-0.3px] m-0 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 로그인 버튼 영역 */}
      <div className="relative z-10 px-5 pb-10 flex flex-col gap-3">
        {error && (
          <p className="font-pretendard text-[13px] text-[#e05a2b] text-center tracking-[-0.325px] -mb-1">{error}</p>
        )}

        {BUTTONS.map(({ id, label, icon, bg, text, border, handler }) => (
          <button
            key={id}
            onClick={handler}
            disabled={!!loading}
            className="w-full h-[52px] flex items-center justify-center gap-3 rounded-[14px] font-pretendard font-semibold text-[15px] tracking-[-0.375px] transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
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
          </button>
        ))}

        <p className="font-pretendard text-[12px] text-[#adb5bd] text-center tracking-[-0.3px] mt-1">
          로그인 시 <span className="underline cursor-pointer">이용약관</span> 및 <span className="underline cursor-pointer">개인정보처리방침</span>에 동의합니다
        </p>

        {/* 네이버 로그인을 위한 숨겨진 버튼 */}
        <div id="naverIdLogin" style={{ display: 'none' }}></div>
      </div>
    </div>
  );
}
