import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';

import LoginScreen      from './components/screens/LoginScreen';
import OnboardingScreen from './components/screens/OnboardingScreen';
import HomeScreen       from './components/screens/HomeScreen';
import WorkoutMemoScreen from './components/screens/WorkoutMemoScreen';
import DietDetailScreen  from './components/screens/DietDetailScreen';
import AICoachScreen    from './components/screens/AICoachScreen';
import MyPageScreen     from './components/screens/MyPageScreen';
import Toast            from './components/common/Toast';

/* ── 프로필 localStorage 유틸 ── */
function loadProfile() {
  try { return JSON.parse(localStorage.getItem('user_profile')) || null; } catch { return null; }
}
function saveProfile(p) { localStorage.setItem('user_profile', JSON.stringify(p)); }

/* 탭 순서 (방향 판별용) */
const TAB_ORDER = { home: 0, coach: 1, my: 2 };

function App() {
  const [user, setUser]       = useState(undefined); // undefined = 로딩 중
  const [profile, setProfile] = useState(loadProfile);
  const [tab, setTab]         = useState('home');
  const [prevTab, setPrevTab] = useState('home');
  const [screen, setScreen]   = useState('home'); // home | memo | diet-detail

  const [showToast, setShowToast]       = useState(false);
  const [memoKey, setMemoKey]           = useState(0);
  const [dietKey, setDietKey]           = useState(0);
  const [editingLog, setEditingLog]     = useState(null);
  const [editingDietLog, setEditingDietLog] = useState(null);

  /* ── 인증 ── */
  useEffect(() => {
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); return; } catch {}
    }
    const unsub = onAuthStateChanged(auth, (fu) => {
      if (fu) {
        const u = { uid: fu.uid, name: fu.displayName, email: fu.email, photo: fu.photoURL, provider: 'google' };
        localStorage.setItem('auth_user', JSON.stringify(u));
        setUser(u);
      } else {
        setUser(null);
      }
    });
    return () => unsub();
  }, []);

  /* ── 핸들러 ── */
  function handleLogin(u)    { localStorage.setItem('auth_user', JSON.stringify(u)); setUser(u); }
  function handleOnboardingComplete(p) { saveProfile(p); setProfile(p); }
  function handleProfileSave(p)        { saveProfile(p); setProfile(p); }

  function handleNavChange(id) {
    if (id === tab) return;
    setPrevTab(tab);
    setTab(id);
    setScreen('home');
  }

  function handleSaveMemo() {
    setScreen('home'); setEditingLog(null);
    setShowToast(true); setMemoKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }
  function handleCardClick(data)     { setEditingLog(data);     setMemoKey(k => k + 1); setScreen('memo'); }
  function handleSaveDiet() {
    setScreen('home'); setEditingDietLog(null);
    setShowToast(true); setDietKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }
  function handleDietCardClick(data) { setEditingDietLog(data); setDietKey(k => k + 1);  setScreen('diet-detail'); }

  /* ── 로딩 ── */
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-[#0054d1]/20 border-t-[#0054d1] rounded-full animate-spin" />
      </div>
    );
  }

  /* 슬라이드 방향 — 오른쪽 탭이면 오른쪽에서, 왼쪽 탭이면 왼쪽에서 */
  const tabDir = (TAB_ORDER[tab] ?? 0) > (TAB_ORDER[prevTab] ?? 0) ? 'right' : 'left';

  return (
    <div className="min-h-screen bg-[#f1f3f5] flex justify-center items-start sm:items-center">
      <div className="w-full max-w-[430px] h-screen bg-white relative overflow-hidden shadow-2xl">

        {/* ── 로그인 ── */}
        {!user && (
          <div className="absolute inset-0 z-50">
            <LoginScreen onLogin={handleLogin} />
          </div>
        )}

        {/* ── 온보딩 ── */}
        {user && !profile && (
          <div className="absolute inset-0 z-40">
            <OnboardingScreen user={user} onComplete={handleOnboardingComplete} />
          </div>
        )}

        {/* ── 메인 콘텐츠 ── */}
        {user && profile && (
          <>
            {/* 홈: 항상 DOM 유지 / 다른 탭 활성 시 왼쪽으로 퇴장 */}
            <div className={`tab-home${tab !== 'home' ? ' inactive' : ''}`}>
              <HomeScreen
                user={user}
                onNavigateToMemo={() => { setEditingLog(null); setMemoKey(k => k + 1); setScreen('memo'); }}
                onCardClick={handleCardClick}
                onDietCardClick={handleDietCardClick}
                onNavChange={handleNavChange}
              />
            </div>

            {/* AI 코치 탭 — 방향 기반 슬라이드 */}
            {tab === 'coach' && (
              <div key="coach" className={`tab-overlay tab-from-${tabDir}`}>
                <AICoachScreen user={user} profile={profile} onNavChange={handleNavChange} />
              </div>
            )}

            {/* 마이페이지 탭 — 방향 기반 슬라이드 */}
            {tab === 'my' && (
              <div key="my" className={`tab-overlay tab-from-${tabDir}`}>
                <MyPageScreen user={user} profile={profile} onProfileSave={handleProfileSave} onNavChange={handleNavChange} />
              </div>
            )}

            {/* 메모 상세 — 오른쪽에서 슬라이드 (홈 탭에서만) */}
            {screen === 'memo' && tab === 'home' && (
              <div className="detail-overlay">
                <WorkoutMemoScreen
                  key={`memo-${memoKey}`}
                  onBack={() => setScreen('home')}
                  onSave={handleSaveMemo}
                  initialData={editingLog}
                />
              </div>
            )}

            {/* 식단 상세 — 오른쪽에서 슬라이드 (홈 탭에서만) */}
            {screen === 'diet-detail' && tab === 'home' && (
              <div className="detail-overlay">
                <DietDetailScreen
                  key={`diet-${dietKey}`}
                  onBack={() => setScreen('home')}
                  onSave={handleSaveDiet}
                  initialData={editingDietLog}
                />
              </div>
            )}
          </>
        )}

        <Toast show={showToast} message="저장되었습니다" />
      </div>
    </div>
  );
}

export default App;
