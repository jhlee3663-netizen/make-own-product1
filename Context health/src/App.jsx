import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { setSentryUser } from './lib/sentry';
import { loadUserData, saveUserData, loadAllCoachRooms, saveCoachRoom, deleteCoachRoom } from './lib/userStore';
import { clearLegacyPersonalStorage, getUserStorage, getUserStorageKeys, prepareUserStorage, removeUserStorage, setUserStorage } from './lib/userStorage';

import LoginScreen      from './components/screens/LoginScreen';
import SplashScreen     from './components/screens/SplashScreen';
import OnboardingScreen from './components/screens/OnboardingScreen';
import ConsentScreen from './components/screens/ConsentScreen';
import HomeScreen       from './components/screens/HomeScreen';
import WorkoutMemoScreen from './components/screens/WorkoutMemoScreen';
import DietDetailScreen  from './components/screens/DietDetailScreen';
import CoachListScreen  from './components/screens/CoachListScreen';
import AICoachScreen    from './components/screens/AICoachScreen';
import MyPageScreen     from './components/screens/MyPageScreen';
import McpAuthorizeScreen from './components/screens/McpAuthorizeScreen';
import Toast            from './components/common/Toast';
import BottomNav        from './components/common/BottomNav';
import AnalysisScreen   from './components/screens/AnalysisScreen';
import { refineDynamicCoachRoomMeta, STATIC_COACH_ROOM_IDS } from './utils/coachRooms';
import { captureMcpAuthorizeRequest } from './lib/mcpConnection';
import FeedScreen from './components/social/FeedScreen';
import SocialLayer, { BellButton } from './components/social/SocialLayer';
import { MyTab } from './components/social/ProfileScreen';
import { InvitePreviewPage } from './components/social/InviteParts';
import { socialCall } from './lib/socialApi';
import { enablePush, onNativePushOpen, pushPermission, pushSupported, refreshPushToken } from './lib/push';

/* 초대 링크(/i/{code})로 들어오면 코드를 기억해 두고 주소는 앱 첫 화면으로 바꾼다.
   로그인·온보딩이 끝난 뒤 초대 받기 시트를 연다. */
const PENDING_INVITE_KEY = 'pending_invite';
/* 공유된 글 링크(/p/{key})도 기억해 두었다가 로그인 뒤 그 글을 연다 */
const PENDING_POST_KEY = 'pending_post';
function capturePostFromPath() {
  const m = window.location.pathname.match(/^\/p\/([^/]{3,120})$/);
  if (m) {
    const key = decodeURIComponent(m[1]);
    try { localStorage.setItem(PENDING_POST_KEY, key); } catch { /* 무시 */ }
    window.history.replaceState(window.history.state, '', '/');
    return key;
  }
  try { return localStorage.getItem(PENDING_POST_KEY); } catch { return null; }
}

function captureInviteFromPath() {
  const m = window.location.pathname.match(/^\/i\/([A-Za-z0-9_-]{3,40})$/);
  if (m) {
    try { localStorage.setItem(PENDING_INVITE_KEY, m[1]); } catch { /* 저장 공간이 없으면 이번 화면에서만 쓴다 */ }
    window.history.replaceState(window.history.state, '', '/');
    return m[1];
  }
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
}

/* ── 프로필 localStorage 유틸 ── */
function loadProfile(uid) {
  try { return JSON.parse(getUserStorage(uid, 'user_profile')) || null; } catch { return null; }
}
function saveProfile(uid, profile) { setUserStorage(uid, 'user_profile', JSON.stringify(profile)); }

/* ── 코치 메시지 localStorage 유틸 ── */
function loadCoachRooms(uid) {
  try {
    const parse = (key) => {
      const raw = getUserStorage(uid, key);
      if (!raw) return null;
      return JSON.parse(raw).map(m => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : undefined }));
    };
    const result = {};
    STATIC_COACH_ROOM_IDS.forEach(roomId => { result[roomId] = parse(`coach_msgs_${roomId}`); });
    getUserStorageKeys(uid).forEach((key) => {
      if (!key?.startsWith('coach_msgs_chat_')) return;
      result[key.replace('coach_msgs_', '')] = parse(key);
    });
    return result;
  } catch { return {}; }
}

function loadCoachRoomMeta(uid) {
  try {
    const result = {};
    getUserStorageKeys(uid).forEach((key) => {
      if (!key?.startsWith('coach_room_meta_')) return;
      const meta = JSON.parse(getUserStorage(uid, key));
      if (meta?.id) result[meta.id] = meta;
    });
    return result;
  } catch { return {}; }
}

function saveCoachRoomMeta(uid, meta) {
  if (!meta?.id) return;
  setUserStorage(uid, `coach_room_meta_${meta.id}`, JSON.stringify(meta));
}

/* ── AI 목표 localStorage 유틸 ── */
function loadAiGoals(uid) {
  try { return JSON.parse(getUserStorage(uid, 'ai_goals')) || []; } catch { return []; }
}

const APP_HISTORY_KEY = '__contextHealthView';

function makeHistoryState(index, view) {
  return { [APP_HISTORY_KEY]: true, index, view };
}

function isAppHistoryState(state) {
  return Boolean(state?.[APP_HISTORY_KEY]);
}


const SPLASH_MIN_MS = 1600; // LogoMotion 인트로가 끝나는 시간

function App() {
  const [user, setUser]       = useState(undefined); // undefined = 로딩 중
  const [profile, setProfile] = useState(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const [userDataReady, setUserDataReady] = useState(false);
  const [splashHold, setSplashHold] = useState(true);
  const hadSessionRef = useRef(Boolean(localStorage.getItem('auth_user'))); // 이 기기에 로그인 기록이 있는지
  const splashStartRef = useRef(Date.now());
  const [tab, setTab]         = useState('home');
  const [prevTab, setPrevTab] = useState('home');
  const [screen, setScreen]   = useState('home'); // home | memo | diet-detail
  const [exitingDetail, setExitingDetail] = useState(false);

  const [showToast, setShowToast]       = useState(false);
  const [toastMessage, setToastMessage] = useState('저장되었습니다');
  const toastTimerRef = useRef(null);
  const [memoKey, setMemoKey]           = useState(0);
  const [dietKey, setDietKey]           = useState(0);
  const [editingLog, setEditingLog]     = useState(null);
  const [editingDietLog, setEditingDietLog] = useState(null);
  const [editingDietMeal, setEditingDietMeal] = useState(null);
  const [coachRooms, setCoachRooms]     = useState(() => loadCoachRooms(null));
  const [coachRoomMeta, setCoachRoomMeta] = useState({});
  const [coachRoomLimitReached, setCoachRoomLimitReached] = useState(false);
  const [coachRoom, setCoachRoom]       = useState(null); // null = 목록 | 'workout' | 'diet'
  const [coachPendingMessage, setCoachPendingMessage] = useState(null);
  const [coachOverlay, setCoachOverlay] = useState(null);
  const [aiGoals, setAiGoals]           = useState([]);
  const [mcpAuthorizeRequest, setMcpAuthorizeRequest] = useState(captureMcpAuthorizeRequest);
  /* 피드·친구 */
  const [socialStack, setSocialStack] = useState([]);
  const [socialMe, setSocialMe] = useState(null);
  const [importReq, setImportReq] = useState(null);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const [pendingInvite, setPendingInvite] = useState(captureInviteFromPath);
  const [pendingPost, setPendingPost] = useState(capturePostFromPath);
  const [inviteSheetCode, setInviteSheetCode] = useState(null);
  const [invitePreviewDismissed, setInvitePreviewDismissed] = useState(false);
  const [pushAsk, setPushAsk] = useState(null);
  const setupCallbackRef = useRef(null);
  const stackSeqRef = useRef(0);
  const historyIndexRef = useRef(0);
  const latestViewRef = useRef({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
  const popRestoringRef = useRef(false);
  const detailBackGuardRef = useRef(null);
  const registerDetailBackGuard = useCallback((guard) => {
    detailBackGuardRef.current = guard;
  }, []);

  function showAppToast(message) {
    window.clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setShowToast(true);
    toastTimerRef.current = window.setTimeout(() => setShowToast(false), 4000);
  }

  function reportSyncFailure() {
    showAppToast('서버에 저장되지 않았어요. 인터넷 연결 후 다시 시도해주세요.');
  }

  const currentView = () => ({
    tab,
    screen,
    social: socialStack,
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
    setSocialStack(view.social || []);
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
  const loadedUidRef = useRef(null);
  loadedUidRef.current = user?.uid || null;

  useEffect(() => {
    let active = true;
    const authTimeout = window.setTimeout(() => {
      if (!active) return;
      setUser(current => current === undefined ? null : current);
      setUserDataReady(true);
    }, 8000);
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu || fu.uid !== loadedUidRef.current) setUserDataReady(false);
      if (!fu) {
        window.clearTimeout(authTimeout);
        localStorage.removeItem('auth_user');
        if (active) {
          setUser(null);
          setUserDataReady(true);
        }
        return;
      }

      let storedUser = null;
      try {
        storedUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
      } catch {}

      // 기존 Kakao/Naver 익명 세션은 저장 정보를 지우지 않고 로그인 화면으로 보낸다.
      // 재로그인 시 Google은 계정 연결, Kakao/Naver는 서버 이전으로 기존 데이터를 보존한다.
      if (fu.isAnonymous) {
        window.clearTimeout(authTimeout);
        if (active) {
          setUser(null);
          setUserDataReady(true);
        }
        return;
      }

      try {
        const tokenResult = await fu.getIdTokenResult();
        if (!active) return;
        window.clearTimeout(authTimeout);
        const claimedProvider = tokenResult.claims.socialProvider;
        const provider = claimedProvider
          || (fu.providerData.some(item => item.providerId === 'google.com') ? 'google'
          : fu.providerData.some(item => item.providerId === 'apple.com') ? 'apple'
          : 'unknown');
        const sameStoredUser = storedUser?.uid === fu.uid ? storedUser : null;

        prepareUserStorage(fu.uid, storedUser?.uid);

        const nextUser = {
          uid: fu.uid,
          name: fu.displayName || sameStoredUser?.name || '사용자',
          email: fu.email || tokenResult.claims.socialEmail || sameStoredUser?.email || '',
          photo: fu.photoURL || sameStoredUser?.photo || '',
          provider,
        };
        localStorage.setItem('auth_user', JSON.stringify(nextUser));
        setUser(nextUser);
      } catch (error) {
        window.clearTimeout(authTimeout);
        console.error('[Auth state]', error);
        if (active) {
          localStorage.removeItem('auth_user');
          setUser(null);
          setUserDataReady(true);
        }
      }
    });
    return () => {
      active = false;
      window.clearTimeout(authTimeout);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (user !== undefined) setSentryUser(user);
  }, [user]);

  /* 시작 화면 최소 표시 시간: 로고가 다 그려지는 SPLASH_MIN_MS 동안은 넘어가지 않는다. */
  const loadingUser = user === undefined || Boolean(user && !userDataReady);
  useEffect(() => {
    if (loadingUser) {
      splashStartRef.current = Date.now();
      setSplashHold(true);
      return undefined;
    }
    const remaining = SPLASH_MIN_MS - (Date.now() - splashStartRef.current);
    if (remaining <= 0) { setSplashHold(false); return undefined; }
    const timer = window.setTimeout(() => setSplashHold(false), remaining);
    return () => window.clearTimeout(timer);
  }, [loadingUser]);

  useEffect(() => {
    /* 다른 탭에서 '다른 계정'으로 바뀐 경우에만 새로고침한다.
       로그아웃·일시적인 값 변화는 onAuthStateChanged가 처리하므로 여기서 새로고침하지 않는다.
       (탭끼리 서로 새로고침시키며 로그인 화면으로 튕기던 문제 방지) */
    let timer;
    const handleAccountStorageChange = (event) => {
      if (event.key !== 'auth_user') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        let storedUid = null;
        try { storedUid = JSON.parse(localStorage.getItem('auth_user') || 'null')?.uid || null; } catch {}
        const renderedUid = user?.uid || null;
        if (storedUid && renderedUid && storedUid !== renderedUid) window.location.reload();
      }, 1500);
    };
    window.addEventListener('storage', handleAccountStorageChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', handleAccountStorageChange);
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setOnboardingDone(false);
      setConsentDone(false);
      setAiGoals([]);
      setCoachRooms(loadCoachRooms(null));
      setCoachRoomMeta({});
      setCoachRoomLimitReached(false);
      return;
    }
    clearLegacyPersonalStorage();
    const cachedProfile = loadProfile(user.uid);
    setProfile(cachedProfile);
    setOnboardingDone(Boolean(getUserStorage(user.uid, 'onboarding_completed') || cachedProfile));
    setConsentDone(Boolean(getUserStorage(user.uid, 'consent_agreed')));
    setAiGoals(loadAiGoals(user.uid));
    setCoachRooms(loadCoachRooms(user.uid));
    setCoachRoomMeta(loadCoachRoomMeta(user.uid));
  }, [user?.uid]);

  useEffect(() => {
    latestViewRef.current = currentView();
  }, [tab, screen, coachRoom, coachOverlay, socialStack]);

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
      const previousIndex = historyIndexRef.current;
      const nextIndex = Number(event.state.index || 0);
      const current = latestViewRef.current;
      const isClosingHomeDetail = current?.tab === 'home' && (current?.screen === 'memo' || current?.screen === 'diet-detail') && !current?.coachOverlay;
      if (isClosingHomeDetail && detailBackGuardRef.current && !detailBackGuardRef.current()) {
        historyIndexRef.current = previousIndex;
        window.history.pushState(makeHistoryState(previousIndex, current), '');
        window.setTimeout(() => { popRestoringRef.current = false; }, 0);
        return;
      }
      historyIndexRef.current = nextIndex;
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
      const [userData, coachRoomResult] = await Promise.all([
        loadUserData(user.uid),
        loadAllCoachRooms(user.uid),
      ]);
      if (cancelled) return;
      if (userData?.profile) {
        saveProfile(user.uid, userData.profile);
        setProfile(userData.profile);
      } else {
        removeUserStorage(user.uid, 'user_profile');
        setProfile(null);
      }
      // 건강정보 동의는 서버 기록이 기준이다. 기기 캐시만 있으면 다시 받는다.
      if (userData?.consent?.health) {
        setUserStorage(user.uid, 'consent_agreed', '1');
        setConsentDone(true);
      } else {
        removeUserStorage(user.uid, 'consent_agreed');
        setConsentDone(false);
      }
      if (userData?.onboardingDone || userData?.profile) {
        setUserStorage(user.uid, 'onboarding_completed', '1');
        setOnboardingDone(true);
        if (!userData?.onboardingDone) {
          saveUserData(user.uid, { onboardingDone: true }).catch(reportSyncFailure);
        }
      }
      if (userData?.goals) {
        setUserStorage(user.uid, 'ai_goals', JSON.stringify(userData.goals));
        setAiGoals(userData.goals);
      }
      const fsRooms = coachRoomResult.rooms;
      setCoachRoomLimitReached(coachRoomResult.hasMore);
      setCoachRooms(prev => {
        const next = { ...prev };
        const nextMeta = {};
        for (const [roomId, value] of Object.entries(fsRooms)) {
          const data = Array.isArray(value) ? { messages: value, meta: null } : value;
          if (data?.messages) {
            next[roomId] = data.messages;
            setUserStorage(user.uid, `coach_msgs_${roomId}`, JSON.stringify(data.messages));
          }
          if (data?.meta?.id) {
            nextMeta[roomId] = data.meta;
            saveCoachRoomMeta(user.uid, data.meta);
          }
        }
        if (Object.keys(nextMeta).length) setCoachRoomMeta(prevMeta => ({ ...prevMeta, ...nextMeta }));
        return next;
      });
    }
    sync().catch(reportSyncFailure).finally(() => {
      if (!cancelled) setUserDataReady(true);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  /* ── 핸들러 ── */
  // Firebase가 확인한 인증 상태만 계정 전환의 기준으로 사용한다.
  // 공급자 콜백에서 auth_user를 먼저 덮어쓰면 레거시 캐시 소유자 판정이 바뀔 수 있다.
  function handleLogin() {}
  async function handleConsentAgree(consent) {
    if (!user?.uid) return;
    await saveUserData(user.uid, { consent });
    setUserStorage(user.uid, 'consent_agreed', '1');
    setConsentDone(true);
  }
  function handleOnboardingComplete(p) {
    setUserStorage(user?.uid, 'onboarding_completed', '1');
    saveProfile(user?.uid, p); setProfile(p); setOnboardingDone(true);
    if (user?.uid) saveUserData(user.uid, { profile: p, onboardingDone: true }).catch(reportSyncFailure);
  }
  async function handleProfileSave(p) {
    saveProfile(user?.uid, p); setProfile(p);
    if (!user?.uid) return;
    let timeoutId;
    try {
      await Promise.race([
        saveUserData(user.uid, { profile: p }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('profile-save-timeout')), 8000);
        }),
      ]);
    } catch (error) {
      reportSyncFailure();
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
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
      saveCoachRoomMeta(user?.uid, refinedMeta);
    }
    setCoachRooms(prev => ({ ...prev, [roomId]: msgs }));
    setUserStorage(user?.uid, `coach_msgs_${roomId}`, JSON.stringify(msgs));
    if (user?.uid) saveCoachRoom(user.uid, roomId, msgs, meta).catch(reportSyncFailure);
  }

  function handleStartNewCoachRoom(meta, message) {
    saveCoachRoomMeta(user?.uid, meta);
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
    removeUserStorage(user?.uid, `coach_msgs_${roomId}`);
    removeUserStorage(user?.uid, `coach_room_meta_${roomId}`);
    if (coachRoom === roomId) {
      replaceApp({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null });
    }
    if (coachOverlay?.roomId === roomId) {
      replaceApp({ tab: 'home', screen, coachRoom: null, coachOverlay: null });
    }
    if (user?.uid) deleteCoachRoom(user.uid, roomId).catch(reportSyncFailure);
  }

  function handleSaveMemo() {
    replaceApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
    setEditingLog(null);
    setMemoKey(k => k + 1);
    showAppToast('저장되었습니다');
  }
  function handleCardClick(data) {
    setEditingLog(data);
    navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null });
  }
  function handleSaveDiet() {
    replaceApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
    setEditingDietLog(null);
    setDietKey(k => k + 1);
    showAppToast('저장되었습니다');
  }
  function handleDietCardClick(data, mealId = null) {
    setEditingDietLog(data);
    setEditingDietMeal(mealId);
    navigateApp({ tab: 'home', screen: 'diet-detail', coachRoom: null, coachOverlay: null });
  }

  function addAiGoal(goal) {
    const next = [goal, ...aiGoals];
    setUserStorage(user?.uid, 'ai_goals', JSON.stringify(next));
    if (user?.uid) saveUserData(user.uid, { goals: next }).catch(reportSyncFailure);
    setAiGoals(next);
  }

  function handleAcceptSuggestion(goal) {
    addAiGoal(goal);
    navigateApp({ tab: 'home', screen: 'home', coachRoom: null, coachOverlay: null });
  }

  function handleRemoveGoal(goalId) {
    const next = aiGoals.filter(g => g.id !== goalId);
    setUserStorage(user?.uid, 'ai_goals', JSON.stringify(next));
    if (user?.uid) saveUserData(user.uid, { goals: next }).catch(reportSyncFailure);
    setAiGoals(next);
  }

  /* ── 피드·친구 ── */
  const refreshSocialMe = useCallback(async () => {
    try {
      const me = await socialCall('me');
      setSocialMe(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const socialReady = Boolean(user?.uid && consentDone && onboardingDone && userDataReady);
  useEffect(() => {
    if (!socialReady) { setSocialMe(null); return undefined; }
    refreshSocialMe();
    refreshPushToken(user.uid);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSocialMe(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refreshSocialMe, 120000);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer); };
  }, [socialReady, user?.uid, refreshSocialMe]);

  /* 초대 링크로 들어온 사람: 로그인·온보딩이 끝나면 초대 받기 시트 */
  useEffect(() => {
    if (!socialReady || !pendingInvite) return;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* 무시 */ }
    setInviteSheetCode(pendingInvite);
    setPendingInvite(null);
  }, [socialReady, pendingInvite]);

  /* 공유 링크로 들어온 글 열기 */
  useEffect(() => {
    if (!socialReady || !pendingPost) return;
    try { localStorage.removeItem(PENDING_POST_KEY); } catch { /* 무시 */ }
    const key = pendingPost;
    setPendingPost(null);
    navigateApp({ tab: 'feed', screen: 'home', coachRoom: null, coachOverlay: null, social: [{ id: `shared-${Date.now()}`, type: key.startsWith('log:') ? 'post' : 'routine', props: { key } }] });
  }, [socialReady, pendingPost]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 첫 친구가 생긴 순간에만 폰 알림 권한을 묻는다 */
  useEffect(() => {
    const count = socialMe?.profile?.friendCount || 0;
    if (!user?.uid || count < 1 || !pushSupported()) return;
    if (getUserStorage(user.uid, 'push_asked')) return;
    let cancelled = false;
    pushPermission().then((permission) => {
      if (cancelled || permission !== 'default') return;
      setUserStorage(user.uid, 'push_asked', '1');
      setPushAsk({ name: null });
    }).catch(() => { /* 다음에 다시 */ });
    return () => { cancelled = true; };
  }, [socialMe?.profile?.friendCount, user?.uid]);

  /* 폰 알림을 눌러 앱이 열리면 알림 목록으로 */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => { if (event.data?.type === 'push-open') socialNav.push('notifications', {}); };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  });

  /* 앱(iOS·Android)에서 알림을 눌렀을 때도 같은 곳으로 */
  useEffect(() => {
    let stop = null;
    onNativePushOpen(() => socialNav.push('notifications', {})).then((off) => { stop = off; }).catch(() => {});
    return () => { if (stop) stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pushSocial(type, props = {}) {
    stackSeqRef.current += 1;
    const entry = { id: `${type}-${Date.now()}-${stackSeqRef.current}`, type, props };
    navigateApp({ ...currentView(), screen: 'home', social: [...socialStack, entry] });
  }

  function popSocial() {
    if (!socialStack.length) return;
    if (isAppHistoryState(window.history.state) && window.history.state.index > 0) window.history.back();
    else replaceApp({ ...currentView(), social: socialStack.slice(0, -1) });
  }

  const socialNav = {
    uid: user?.uid,
    authName: user?.name,
    me: socialMe,
    toast: showAppToast,
    push: pushSocial,
    pop: popSocial,
    refreshMe: refreshSocialMe,
    goTab: (id) => navigateApp({ tab: id, screen: 'home', coachRoom: null, coachOverlay: null, social: [] }),
    /* 아이디가 없으면 처음 설정을 먼저 하고, 끝나면 하려던 일을 이어서 한다 (IA 4-4) */
    requireProfile: async (fn) => {
      if (socialMe?.profile?.handle) return fn();
      const latest = await refreshSocialMe();
      if (latest?.profile?.handle) return fn();
      setupCallbackRef.current = fn;
      pushSocial('setup', {});
      return undefined;
    },
    finishSetup: () => {
      const fn = setupCallbackRef.current;
      setupCallbackRef.current = null;
      popSocial();
      if (fn) window.setTimeout(() => Promise.resolve(fn()).catch(() => {}), 320);
    },
    cancelSetup: () => { setupCallbackRef.current = null; popSocial(); },
    startImport: (req) => setImportReq(req),
    openInviteShare: () => socialNav.requireProfile(() => setInviteShareOpen(true)),
    openRecord: (type) => {
      if (type === 'workout') {
        setEditingLog(null);
        navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null, social: [] });
      } else {
        handleDietCardClick(null);
      }
    },
    openMemo: (initialData) => {
      setEditingLog(initialData);
      navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null, social: [] });
    },
    openDiet: (initialData, mealId) => handleDietCardClick(initialData, mealId),
    renderSettings: () => (
      <MyPageScreen
        user={user}
        profile={profile}
        onProfileSave={handleProfileSave}
        onNavChange={handleNavChange}
        onBack={popSocial}
        social={{
          me: socialMe,
          onOpen: (id) => {
            if (id === 'friends' || id === 'visibility') socialNav.requireProfile(() => pushSocial(id, {}));
            else pushSocial(id, {});
          },
        }}
      />
    ),
    enablePush: async () => {
      try { return await enablePush(user?.uid); } catch { return false; }
    },
  };

  /* ── 로그인 화면 ──
     로그인된 적이 없는 기기에서는 로그인 상태를 확인하는 동안에도 같은 로그인 화면(로고 모션)을 띄워
     확인이 끝난 뒤 화면이 바뀌지 않고 그대로 버튼이 나타나게 한다. */
  if (user === null || (user === undefined && !hadSessionRef.current)) {
    return (
      <div className="app-stage min-h-dvh bg-[#f1f3f5] flex justify-center items-start sm:items-center">
        <div className="app-frame w-full max-w-[430px] h-dvh relative overflow-hidden shadow-2xl">
          <LoginScreen onLogin={handleLogin} authReady={user === null} />
          {pendingInvite && !invitePreviewDismissed && user === null && (
            <div className="absolute inset-0 z-50">
              <InvitePreviewPage code={pendingInvite} onStart={() => setInvitePreviewDismissed(true)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── 로딩 (시작 화면) ──
     기록을 금방 불러와도 로고 모션이 완성될 때까지는 시작 화면을 유지한다. */
  if (user === undefined || (user && (!userDataReady || splashHold))) {
    return (
      <div className="app-stage min-h-dvh bg-[#f1f3f5] flex justify-center items-start sm:items-center">
        <div className="app-frame w-full max-w-[430px] h-dvh relative overflow-hidden shadow-2xl">
          <SplashScreen />
        </div>
      </div>
    );
  }

  /* 탭 순서: 홈(0) | 코치(1) | 마이(2) — 인덱스 기반으로 정확한 방향 결정 */
  const TAB_ORDER = ['home', 'feed', 'coach', 'analysis', 'my'];
  function tabStyle(panelId) {
    const pIdx = TAB_ORDER.indexOf(panelId);
    const aIdx = TAB_ORDER.indexOf(tab);
    const x = pIdx < aIdx ? -5 : pIdx > aIdx ? 5 : 0; // 화면 폭의 5%만 비켜 둔다 (index.css .tab-panel)
    return { transform: x === 0 ? 'none' : `translateX(${x}%)`, opacity: x === 0 ? 1 : 0, pointerEvents: panelId === tab ? 'auto' : 'none' };
  }
  function tabClass(panelId) {
    return `tab-panel${(panelId === tab || panelId === prevTab) ? '' : ' no-transition'}`;
  }

  return (
    <div className="app-stage min-h-dvh bg-[#f1f3f5] flex justify-center items-start sm:items-center">
      <div className="app-frame w-full max-w-[430px] h-dvh bg-white relative overflow-hidden shadow-2xl">

        {/* ── Claude 커넥터 연결 동의 ── */}
        {user && mcpAuthorizeRequest && (
          <McpAuthorizeScreen user={user} request={mcpAuthorizeRequest} onClose={() => setMcpAuthorizeRequest(null)} />
        )}

        {/* ── 약관·건강정보 동의 ── */}
        {user && !consentDone && (
          <div className="absolute inset-0 z-50">
            <ConsentScreen onAgree={handleConsentAgree} />
          </div>
        )}

        {/* ── 온보딩 ── */}
        {user && consentDone && !onboardingDone && (
          <div className="absolute inset-0 z-40">
            <OnboardingScreen user={user} onComplete={handleOnboardingComplete} />
          </div>
        )}

        {/* ── 메인 콘텐츠 ── */}
        {user && consentDone && onboardingDone && (
          <>
            {/* 홈 탭 */}
            <div className={tabClass('home')} style={tabStyle('home')} inert={tab !== 'home' ? '' : undefined} aria-hidden={tab !== 'home'}>
              <HomeScreen
                active={tab === 'home' && screen === 'home'}
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
                bell={<BellButton unread={socialMe?.unreadCount || 0} onClick={() => pushSocial('notifications', {})} />}
              />
            </div>

            {/* 피드 탭 (코치 자리) */}
            <div className={tabClass('feed')} style={tabStyle('feed')} inert={tab !== 'feed' ? '' : undefined} aria-hidden={tab !== 'feed'}>
              <FeedScreen nav={socialNav} active={tab === 'feed' && !socialStack.length} />
            </div>

            {/* AI 코치 탭 */}
            <div className={tabClass('coach')} style={tabStyle('coach')} inert={tab !== 'coach' ? '' : undefined} aria-hidden={tab !== 'coach'}>
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
                  historyLimitReached={coachRoomLimitReached}
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

            {/* 분석 탭 */}
            <div className={tabClass('analysis')} style={tabStyle('analysis')} inert={tab !== 'analysis' ? '' : undefined} aria-hidden={tab !== 'analysis'}>
              <AnalysisScreen
                user={user}
                profile={profile}
                active={tab === 'analysis'}
                onAskCoach={(message) => handleOpenCoachWithMessage('powerbuilding', message)}
                onBack={() => handleNavChange('home')}
                onEditGoal={() => handleNavChange('my')}
                onRecord={(type) => {
                  if (type === 'workout') {
                    setEditingLog(null);
                    navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null });
                  } else if (type === 'diet') {
                    handleDietCardClick(null);
                  } else {
                    handleNavChange('home');
                  }
                }}
              />
            </div>

            {/* 마이페이지 탭 */}
            <div className={tabClass('my')} style={tabStyle('my')} inert={tab !== 'my' ? '' : undefined} aria-hidden={tab !== 'my'}>
              {/* 마이 탭 = 내 프로필. 설정(예전 마이)은 오른쪽 위 톱니바퀴로 연다 */}
              <MyTab nav={socialNav} active={tab === 'my' && !socialStack.length} />
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
                  registerBackGuard={registerDetailBackGuard}
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
                  initialMeal={editingDietMeal}
                  uid={user.uid}
                  profile={profile}
                  registerBackGuard={registerDetailBackGuard}
                />
              </div>
            )}
            {/* 바텀 네비 — 탭 패널 외부에 위치, detail 화면에선 숨김 */}
            {/* 피드·친구 화면 층 */}
            <SocialLayer
              stack={socialStack}
              nav={socialNav}
              importReq={importReq}
              onImportClose={() => setImportReq(null)}
              inviteShareOpen={inviteShareOpen}
              onInviteShareClose={() => setInviteShareOpen(false)}
              inviteCode={inviteSheetCode}
              onInviteClose={() => setInviteSheetCode(null)}
              pushAsk={pushAsk}
              onPushAskClose={() => setPushAsk(null)}
            />

            {screen === 'home' && !socialStack.length && !(tab === 'coach' && coachRoom !== null) && (
              <BottomNav
                activeId={tab}
                onChange={(id) => {
                  if (id === tab && tab === 'coach' && coachRoom !== null) {
                    goBackOrHome({ tab: 'coach', screen: 'home', coachRoom: null, coachOverlay: null });
                  } else {
                    handleNavChange(id);
                  }
                }}
                onMemo={(type) => {
                  if (type === 'workout') {
                    setEditingLog(null);
                    navigateApp({ tab: 'home', screen: 'memo', coachRoom: null, coachOverlay: null });
                  } else {
                    handleDietCardClick(null);
                  }
                }}
              />
            )}
          </>
        )}

        {/* 시트·팝업을 하단 내비보다 위에 그리는 층 (components/social/ui.jsx overlay) */}
        <div id="app-overlay" className="absolute inset-0 z-[70] pointer-events-none" />
        <Toast show={showToast} message={toastMessage} />
      </div>
    </div>
  );
}

export default App;
