import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { loadUserData, saveUserData, loadAllCoachRooms, saveCoachRoom } from './lib/userStore';

import LoginScreen      from './components/screens/LoginScreen';
import OnboardingScreen from './components/screens/OnboardingScreen';
import HomeScreen       from './components/screens/HomeScreen';
import WorkoutMemoScreen from './components/screens/WorkoutMemoScreen';
import DietDetailScreen  from './components/screens/DietDetailScreen';
import CoachListScreen  from './components/screens/CoachListScreen';
import AICoachScreen    from './components/screens/AICoachScreen';
import MyPageScreen     from './components/screens/MyPageScreen';
import Toast            from './components/common/Toast';
import BottomNav        from './components/common/BottomNav';

/* ── 프로필 localStorage 유틸 ── */
function loadProfile() {
  try { return JSON.parse(localStorage.getItem('user_profile')) || null; } catch { return null; }
}
function saveProfile(p) { localStorage.setItem('user_profile', JSON.stringify(p)); }

/* ── 코치 메시지 localStorage 유틸 ── */
function loadCoachRooms() {
  try {
    const parse = (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw).map(m => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : undefined }));
    };
    return { 
      powerbuilding: parse('coach_msgs_powerbuilding'), 
      dumbbell: parse('coach_msgs_dumbbell'),
      diet: parse('coach_msgs_diet'),
      mobility: parse('coach_msgs_mobility'),
      routine: parse('coach_msgs_routine')
    };
  } catch { return {}; }
}

/* ── AI 목표 localStorage 유틸 ── */
function loadAiGoals() {
  try { return JSON.parse(localStorage.getItem('ai_goals')) || []; } catch { return []; }
}


function App() {
  const [user, setUser]       = useState(undefined); // undefined = 로딩 중
  const [profile, setProfile] = useState(loadProfile);
  const [onboardingDone, setOnboardingDone] = useState(() =>
    !!localStorage.getItem('onboarding_completed') || !!loadProfile()
  );
  const [userDataReady, setUserDataReady] = useState(false);
  const [tab, setTab]         = useState('home');
  const [prevTab, setPrevTab] = useState('home');
  const [screen, setScreen]   = useState('home'); // home | memo | diet-detail

  const [showToast, setShowToast]       = useState(false);
  const [memoKey, setMemoKey]           = useState(0);
  const [dietKey, setDietKey]           = useState(0);
  const [editingLog, setEditingLog]     = useState(null);
  const [editingDietLog, setEditingDietLog] = useState(null);
  const [coachRooms, setCoachRooms]     = useState(loadCoachRooms);
  const [coachRoom, setCoachRoom]       = useState(null); // null = 목록 | 'workout' | 'diet'
  const [coachPendingMessage, setCoachPendingMessage] = useState(null);
  const [coachOverlay, setCoachOverlay] = useState(null);
  const [aiGoals, setAiGoals]           = useState(loadAiGoals);

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
        setUserDataReady(true);
      }
    });
    return () => unsub();
  }, []);

  /* ── Firestore 동기화 (로그인 후 1회) ── */
  useEffect(() => {
    if (!user?.uid) {
      if (user !== undefined) setUserDataReady(true);
      return;
    }
    let cancelled = false;
    async function sync() {
      setUserDataReady(false);
      const [userData, fsRooms] = await Promise.all([
        loadUserData(user.uid),
        loadAllCoachRooms(user.uid),
      ]);
      if (cancelled) return;
      if (userData?.profile) {
        saveProfile(userData.profile);
        setProfile(userData.profile);
      }
      if (userData?.onboardingDone || userData?.profile) {
        localStorage.setItem('onboarding_completed', '1');
        setOnboardingDone(true);
        if (!userData?.onboardingDone) {
          saveUserData(user.uid, { onboardingDone: true }).catch(() => {});
        }
      }
      if (userData?.goals) {
        localStorage.setItem('ai_goals', JSON.stringify(userData.goals));
        setAiGoals(userData.goals);
      }
      setCoachRooms(prev => {
        const next = { ...prev };
        for (const [roomId, msgs] of Object.entries(fsRooms)) {
          if (msgs) {
            next[roomId] = msgs;
            try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(msgs)); } catch {}
          }
        }
        return next;
      });
    }
    sync().catch(() => {}).finally(() => {
      if (!cancelled) setUserDataReady(true);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  /* ── 핸들러 ── */
  function handleLogin(u)    { localStorage.setItem('auth_user', JSON.stringify(u)); setUser(u); }
  function handleOnboardingComplete(p) {
    localStorage.setItem('onboarding_completed', '1');
    saveProfile(p); setProfile(p); setOnboardingDone(true);
    if (user?.uid) saveUserData(user.uid, { profile: p, onboardingDone: true }).catch(() => {});
  }
  function handleProfileSave(p) {
    saveProfile(p); setProfile(p);
    if (user?.uid) saveUserData(user.uid, { profile: p }).catch(() => {});
  }

  function handleNavChange(id) {
    if (id === tab) return;
    setPrevTab(tab);
    setTab(id);
    setScreen('home');
    if (id !== 'coach') setCoachRoom(null);
  }

  function handleCoachRoomOpen(roomId) {
    setPrevTab(tab);
    setTab('coach');
    setCoachRoom(roomId);
  }

  function handleOpenCoachWithMessage(roomId, message) {
    setCoachPendingMessage(message);
    setCoachRoom(roomId);
    setPrevTab(tab);
    setTab('coach');
    setScreen('home');
  }

  function handleCoachMessagesChange(roomId, msgs) {
    setCoachRooms(prev => ({ ...prev, [roomId]: msgs }));
    try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(msgs)); } catch {}
    if (user?.uid) saveCoachRoom(user.uid, roomId, msgs).catch(() => {});
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

  function addAiGoal(goal) {
    const next = [goal, ...aiGoals];
    try { localStorage.setItem('ai_goals', JSON.stringify(next)); } catch {}
    if (user?.uid) saveUserData(user.uid, { goals: next }).catch(() => {});
    setAiGoals(next);
  }

  function handleAcceptSuggestion(goal) {
    addAiGoal(goal);
    setPrevTab(tab);
    setTab('home');
    setCoachRoom(null);
  }

  function handleRemoveGoal(goalId) {
    const next = aiGoals.filter(g => g.id !== goalId);
    try { localStorage.setItem('ai_goals', JSON.stringify(next)); } catch {}
    if (user?.uid) saveUserData(user.uid, { goals: next }).catch(() => {});
    setAiGoals(next);
  }

  /* ── 로딩 ── */
  if (user === undefined || (user && !userDataReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-[#3476EE]/20 border-t-[#3476EE] rounded-full animate-spin" />
      </div>
    );
  }

  /* 탭 순서: 홈(0) | 코치(1) | 마이(2) — 인덱스 기반으로 정확한 방향 결정 */
  const TAB_ORDER = ['home', 'coach', 'my'];
  function tabStyle(panelId) {
    const pIdx = TAB_ORDER.indexOf(panelId);
    const aIdx = TAB_ORDER.indexOf(tab);
    const x = pIdx < aIdx ? -100 : pIdx > aIdx ? 100 : 0;
    return { transform: `translateX(${x}%)`, pointerEvents: panelId === tab ? 'auto' : 'none' };
  }
  function tabClass(panelId) {
    return `tab-panel${(panelId === tab || panelId === prevTab) ? '' : ' no-transition'}`;
  }

  return (
    <div className="min-h-dvh bg-[#f1f3f5] flex justify-center items-start sm:items-center">
      <div className="w-full max-w-[430px] h-dvh bg-white relative overflow-hidden shadow-2xl">

        {/* ── 로그인 ── */}
        {!user && (
          <div className="absolute inset-0 z-50">
            <LoginScreen onLogin={handleLogin} />
          </div>
        )}

        {/* ── 온보딩 ── */}
        {user && !onboardingDone && (
          <div className="absolute inset-0 z-40">
            <OnboardingScreen user={user} onComplete={handleOnboardingComplete} />
          </div>
        )}

        {/* ── 메인 콘텐츠 ── */}
        {user && onboardingDone && (
          <>
            {/* 홈 탭 */}
            <div className={tabClass('home')} style={tabStyle('home')}>
              <HomeScreen
                user={user}
                profile={profile}
                aiGoals={aiGoals}
                onRemoveGoal={handleRemoveGoal}
                onNavigateToMemo={() => { setEditingLog(null); setMemoKey(k => k + 1); setScreen('memo'); }}
                onCardClick={handleCardClick}
                onDietCardClick={handleDietCardClick}
                onNavChange={handleNavChange}
                onOpenCoachRoom={handleCoachRoomOpen}
              />
            </div>

            {/* AI 코치 탭 */}
            <div className={tabClass('coach')} style={tabStyle('coach')}>
              {coachRoom === null ? (
                <CoachListScreen
                  rooms={coachRooms}
                  onOpenRoom={(roomId, msg) => {
                    if (msg) handleOpenCoachWithMessage(roomId, msg);
                    else setCoachRoom(roomId);
                  }}
                  onNavChange={handleNavChange}
                />
              ) : (
                <AICoachScreen
                  key={coachRoom}
                  user={user}
                  profile={profile}
                  onNavChange={handleNavChange}
                  roomType={coachRoom}
                  savedMessages={coachRooms[coachRoom]}
                  onMessagesChange={(msgs) => handleCoachMessagesChange(coachRoom, msgs)}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onBack={() => setCoachRoom(null)}
                  pendingMessage={coachPendingMessage}
                  onPendingMessageSent={() => setCoachPendingMessage(null)}
                />
              )}
            </div>

            {/* 마이페이지 탭 */}
            <div className={tabClass('my')} style={tabStyle('my')}>
              <MyPageScreen user={user} profile={profile} onProfileSave={handleProfileSave} onNavChange={handleNavChange} />
            </div>

            {/* 메모 상세 — 오른쪽에서 슬라이드 (홈 탭에서만) */}
            {screen === 'memo' && tab === 'home' && (
              <div className="detail-overlay">
                <WorkoutMemoScreen
                  key={`memo-${memoKey}`}
                  onBack={() => setScreen('home')}
                  onSave={handleSaveMemo}
                  initialData={editingLog}
                  uid={user.uid}
                  onOpenCoachWithMessage={(roomId, message) => {
                    setCoachOverlay({ roomId, pendingMessage: message });
                    setPrevTab('home');
                    setTab('home');
                  }}
                />
              </div>
            )}

            {coachOverlay && tab === 'home' && (
              <div className="absolute inset-0 z-[45] bg-white">
                <AICoachScreen
                  key={`coach-overlay-${coachOverlay.roomId}`}
                  user={user}
                  profile={profile}
                  roomType={coachOverlay.roomId}
                  savedMessages={coachRooms[coachOverlay.roomId]}
                  onMessagesChange={(msgs) => handleCoachMessagesChange(coachOverlay.roomId, msgs)}
                  onAcceptSuggestion={addAiGoal}
                  onBack={() => setCoachOverlay(null)}
                  pendingMessage={coachOverlay.pendingMessage}
                  onPendingMessageSent={() => setCoachOverlay(prev => prev ? { ...prev, pendingMessage: null } : prev)}
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
                  uid={user.uid}
                  profile={profile}
                />
              </div>
            )}
            {/* 바텀 네비 — 탭 패널 외부에 위치, detail 화면에선 숨김 */}
            {screen === 'home' && (
              <BottomNav
                activeId={tab}
                onChange={(id) => {
                  if (id === tab && tab === 'coach' && coachRoom !== null) {
                    setCoachRoom(null);
                  } else {
                    handleNavChange(id);
                  }
                }}
              />
            )}
          </>
        )}

        <Toast show={showToast} message="저장되었습니다" />
      </div>
    </div>
  );
}

export default App;
