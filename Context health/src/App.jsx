import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { setSentryUser } from './lib/sentry';
import { loadUserData, saveUserData, loadAllCoachRooms, saveCoachRoom, deleteCoachRoom } from './lib/userStore';

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
import { refineDynamicCoachRoomMeta, STATIC_COACH_ROOM_IDS } from './utils/coachRooms';

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
    const result = {};
    STATIC_COACH_ROOM_IDS.forEach(roomId => { result[roomId] = parse(`coach_msgs_${roomId}`); });
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('coach_msgs_chat_')) continue;
      result[key.replace('coach_msgs_', '')] = parse(key);
    }
    return result;
  } catch { return {}; }
}

function loadCoachRoomMeta() {
  try {
    const result = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('coach_room_meta_')) continue;
      const meta = JSON.parse(localStorage.getItem(key));
      if (meta?.id) result[meta.id] = meta;
    }
    return result;
  } catch { return {}; }
}

function saveCoachRoomMeta(meta) {
  if (!meta?.id) return;
  try { localStorage.setItem(`coach_room_meta_${meta.id}`, JSON.stringify(meta)); } catch {}
}

/* ── AI 목표 localStorage 유틸 ── */
function loadAiGoals() {
  try { return JSON.parse(localStorage.getItem('ai_goals')) || []; } catch { return []; }
}

const APP_HISTORY_KEY = '__contextHealthView';

function makeHistoryState(index, view) {
  return { [APP_HISTORY_KEY]: true, index, view };
}

function isAppHistoryState(state) {
  return Boolean(state?.[APP_HISTORY_KEY]);
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
  const [exitingDetail, setExitingDetail] = useState(false);

  const [showToast, setShowToast]       = useState(false);
  const [memoKey, setMemoKey]           = useState(0);
  const [dietKey, setDietKey]           = useState(0);
  const [editingLog, setEditingLog]     = useState(null);
  const [editingDietLog, setEditingDietLog] = useState(null);
  const [coachRooms, setCoachRooms]     = useState(loadCoachRooms);
  const [coachRoomMeta, setCoachRoomMeta] = useState(loadCoachRoomMeta);
  const [coachRoom, setCoachRoom]       = useState(null); // null = 목록 | 'workout' | 'diet'
  const [coachPendingMessage, setCoachPendingMessage] = useState(null);
  const [coachOverlay, setCoachOverlay] = useState(null);
  const [aiGoals, setAiGoals]           = useState(loadAiGoals);
  const historyIndexRef = useRef(0);
  const latestViewRef = useRef({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
  const popRestoringRef = useRef(false);

  const currentView = () => ({
    tab,
    screen,
    coachRoom,
    coachOverlay: coachOverlay
      ? { roomId: coachOverlay.roomId, pendingMessage: coachOverlay.pendingMessage || null }
      : null,
  });

  function applyView(view) {
    if (!view) return;
    setPrevTab(latestViewRef.current.tab || 'home');
    setTab(view.tab || 'home');
    setScreen(view.screen || 'home');
    setCoachRoom(view.coachRoom || null);
    setCoachOverlay(view.coachOverlay || null);
    if ((view.screen || 'home') !== 'memo') setEditingLog(null);
    if ((view.screen || 'home') !== 'diet-detail') setEditingDietLog(null);
    if (view.screen === 'memo') setMemoKey(k => k + 1);
    if (view.screen === 'diet-detail') setDietKey(k => k + 1);
  }

  function pushAppHistory(nextView) {
    if (popRestoringRef.current) return;
    const index = historyIndexRef.current + 1;
    historyIndexRef.current = index;
    latestViewRef.current = nextView;
    window.history.pushState(makeHistoryState(index, nextView), '');
  }

  function navigateApp(nextView) {
    applyView(nextView);
    pushAppHistory(nextView);
  }

  function replaceApp(nextView) {
    applyView(nextView);
    latestViewRef.current = nextView;
    window.history.replaceState(makeHistoryState(historyIndexRef.current, nextView), '');
  }

  function closeHomeDetail() {
    replaceApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
  }

  function closeHomeDetailWithAnimation() {
    setExitingDetail(true);
    setTimeout(() => {
      setExitingDetail(false);
      closeHomeDetail();
    }, 340);
  }

  function goBackOrHome(fallbackView = { tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null }) {
    if (isAppHistoryState(window.history.state) && window.history.state.index > 0) {
      window.history.back();
      return;
    }
    navigateApp(fallbackView);
  }

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

  useEffect(() => {
    if (user !== undefined) setSentryUser(user);
  }, [user]);

  useEffect(() => {
    latestViewRef.current = currentView();
  }, [tab, screen, coachRoom, coachOverlay]);

  useEffect(() => {
    const initialView = currentView();
    if (!isAppHistoryState(window.history.state)) {
      window.history.replaceState(makeHistoryState(0, initialView), '');
    } else {
      historyIndexRef.current = Number(window.history.state.index || 0);
    }

    const handlePopState = (event) => {
      if (!isAppHistoryState(event.state)) return;
      popRestoringRef.current = true;
      historyIndexRef.current = Number(event.state.index || 0);
      const current = latestViewRef.current;
      const isClosingHomeDetail = current?.tab === 'home' && (current?.screen === 'memo' || current?.screen === 'diet-detail') && !current?.coachOverlay;
      const nextView = isClosingHomeDetail
        ? { tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null }
        : event.state.view;
      applyView(nextView);
      if (isClosingHomeDetail) {
        latestViewRef.current = nextView;
        window.history.replaceState(makeHistoryState(historyIndexRef.current, nextView), '');
      }
      window.setTimeout(() => { popRestoringRef.current = false; }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
        const nextMeta = {};
        for (const [roomId, value] of Object.entries(fsRooms)) {
          const data = Array.isArray(value) ? { messages: value, meta: null } : value;
          if (data?.messages) {
            next[roomId] = data.messages;
            try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(data.messages)); } catch {}
          }
          if (data?.meta?.id) {
            nextMeta[roomId] = data.meta;
            saveCoachRoomMeta(data.meta);
          }
        }
        if (Object.keys(nextMeta).length) setCoachRoomMeta(prevMeta => ({ ...prevMeta, ...nextMeta }));
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
    navigateApp({ tab: id, screen: 'home', coachRoom: id === 'coach' ? coachRoom : null, coachOverlay: null });
  }

  function handleCoachRoomOpen(roomId) {
    navigateApp({ tab: 'coach', screen: 'home', coachRoom: roomId, coachOverlay: null });
  }

  function handleOpenCoachWithMessage(roomId, message) {
    setCoachPendingMessage(message);
    navigateApp({ tab: 'coach', screen: 'home', coachRoom: roomId, coachOverlay: null });
  }

  function handleCoachMessagesChange(roomId, msgs) {
    let meta = coachRoomMeta[roomId] || null;
    const latestUserText = [...(msgs || [])].reverse().find(m => m.role === 'user' && m.text)?.text;
    const refinedMeta = latestUserText ? refineDynamicCoachRoomMeta(meta, latestUserText) : meta;
    if (refinedMeta && refinedMeta !== meta) {
      meta = refinedMeta;
      setCoachRoomMeta(prev => ({ ...prev, [roomId]: refinedMeta }));
      saveCoachRoomMeta(refinedMeta);
    }
    setCoachRooms(prev => ({ ...prev, [roomId]: msgs }));
    try { localStorage.setItem(`coach_msgs_${roomId}`, JSON.stringify(msgs)); } catch {}
    if (user?.uid) saveCoachRoom(user.uid, roomId, msgs, meta).catch(() => {});
  }

  function handleStartNewCoachRoom(meta, message) {
    saveCoachRoomMeta(meta);
    setCoachRoomMeta(prev => ({ ...prev, [meta.id]: meta }));
    setCoachPendingMessage(message);
    navigateApp({ tab: 'coach', screen: 'home', coachRoom: meta.id, coachOverlay: null });
  }

  function handleCoachRoomDelete(roomId) {
    setCoachRooms(prev => ({ ...prev, [roomId]: null }));
    setCoachRoomMeta(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    try { localStorage.removeItem(`coach_msgs_${roomId}`); } catch {}
    try { localStorage.removeItem(`coach_room_meta_${roomId}`); } catch {}
    if (coachRoom === roomId) {
      replaceApp({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null });
    }
    if (coachOverlay?.roomId === roomId) {
      replaceApp({ tab: 'home', screen, coachRoom: null, coachOverlay: null });
    }
    if (user?.uid) deleteCoachRoom(user.uid, roomId).catch(() => {});
  }

  function handleSaveMemo() {
    replaceApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
    setEditingLog(null);
    setShowToast(true); setMemoKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }
  function handleCardClick(data) {
    setEditingLog(data);
    navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null });
  }
  function handleSaveDiet() {
    replaceApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
    setEditingDietLog(null);
    setShowToast(true); setDietKey(k => k + 1);
    setTimeout(() => setShowToast(false), 3000);
  }
  function handleDietCardClick(data) {
    setEditingDietLog(data);
    navigateApp({ tab: 'home', screen: 'diet-detail', coachRoom: null, coachOverlay: null });
  }

  function addAiGoal(goal) {
    const next = [goal, ...aiGoals];
    try { localStorage.setItem('ai_goals', JSON.stringify(next)); } catch {}
    if (user?.uid) saveUserData(user.uid, { goals: next }).catch(() => {});
    setAiGoals(next);
  }

  function handleAcceptSuggestion(goal) {
    addAiGoal(goal);
    navigateApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
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
    return { transform: x === 0 ? 'none' : `translateX(${x}%)`, pointerEvents: panelId === tab ? 'auto' : 'none' };
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
                onNavigateToMemo={() => {
                  setEditingLog(null);
                  navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null });
                }}
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
                  roomMeta={coachRoomMeta}
                  onOpenRoom={(roomId, msg) => {
                    if (msg) handleOpenCoachWithMessage(roomId, msg);
                    else navigateApp({ tab: 'coach', screen: 'home', coachRoom: roomId, coachOverlay: null });
                  }}
                  onStartNewRoom={handleStartNewCoachRoom}
                  onDeleteRoom={handleCoachRoomDelete}
                  onNavChange={handleNavChange}
                />
              ) : (
                <AICoachScreen
                  key={coachRoom}
                  user={user}
                  profile={profile}
                  onNavChange={handleNavChange}
                  roomType={coachRoomMeta[coachRoom]?.type || coachRoom}
                  roomMeta={coachRoomMeta[coachRoom]}
                  savedMessages={coachRooms[coachRoom]}
                  onMessagesChange={(msgs) => handleCoachMessagesChange(coachRoom, msgs)}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onBack={() => goBackOrHome({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null })}
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
              <div style={{ position: 'absolute', inset: 0, zIndex: 20, animation: exitingDetail ? 'slideOutToRight 350ms cubic-bezier(0.4,0,1,1) forwards' : 'slideInFromRight 420ms cubic-bezier(0.42,0,0.58,1) both' }}>
                <WorkoutMemoScreen
                  key={`memo-${memoKey}`}
                  onBack={closeHomeDetailWithAnimation}
                  onSave={handleSaveMemo}
                  initialData={editingLog}
                  uid={user.uid}
                  profile={profile}
                  onOpenCoachWithMessage={(roomId, message) => {
                    navigateApp({
                      tab: 'home',
                      screen: 'memo',
                      coachRoom: null,
                      coachOverlay: { roomId, pendingMessage: message },
                    });
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
                  roomType={coachRoomMeta[coachOverlay.roomId]?.type || coachOverlay.roomId}
                  roomMeta={coachRoomMeta[coachOverlay.roomId]}
                  savedMessages={coachRooms[coachOverlay.roomId]}
                  onMessagesChange={(msgs) => handleCoachMessagesChange(coachOverlay.roomId, msgs)}
                  onAcceptSuggestion={addAiGoal}
                  onBack={() => goBackOrHome({ tab: 'home', screen, coachRoom: null, coachOverlay: null })}
                  pendingMessage={coachOverlay.pendingMessage}
                  onPendingMessageSent={() => setCoachOverlay(prev => prev ? { ...prev, pendingMessage: null } : prev)}
                />
              </div>
            )}

            {/* 식단 상세 — 오른쪽에서 슬라이드 (홈 탭에서만) */}
            {screen === 'diet-detail' && tab === 'home' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 20, animation: exitingDetail ? 'slideOutToRight 350ms cubic-bezier(0.4,0,1,1) forwards' : 'slideInFromRight 420ms cubic-bezier(0.42,0,0.58,1) both' }}>
                <DietDetailScreen
                  key={`diet-${dietKey}`}
                  onBack={closeHomeDetailWithAnimation}
                  onSave={handleSaveDiet}
                  initialData={editingDietLog}
                  uid={user.uid}
                  profile={profile}
                />
              </div>
            )}
            {/* 바텀 네비 — 탭 패널 외부에 위치, detail 화면에선 숨김 */}
            {screen === 'home' && !(tab === 'coach' && coachRoom !== null) && (
              <BottomNav
                activeId={tab}
                onChange={(id) => {
                  if (id === tab && tab === 'coach' && coachRoom !== null) {
                    goBackOrHome({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null });
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
