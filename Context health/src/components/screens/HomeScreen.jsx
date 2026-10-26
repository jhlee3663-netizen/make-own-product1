import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  startAfter,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import WorkoutCard from '../dashboard/WorkoutCard';
import DietCard from '../dashboard/DietCard';
import GoalCard from '../dashboard/GoalCard';
import { HomeDateRow, HomeTabs, NECK_BREAK, PullGap, SheetCorners, WeekStrip } from '../home/HomeHeader';
import WeightInputRow from '../home/WeightInputRow';
import WorkoutSummary from '../home/WorkoutSummary';
import { TodayDietCard } from '../home/DietDay';
import { localDateKey } from '../../lib/bodyLogs';
import { cardioWeek, dietDay, groupByDate, lastDays, logDateKey, partGrid } from '../../lib/homeSummary';
import { IcSpark } from '../icons/Icons';
import { KEEP_REMARKS_RULE, preserveUserRemarks } from '../../utils/workoutNotes';
import Toast from '../common/Toast';
import ConfirmModal from '../common/ConfirmModal';
import Pressable from '../common/Pressable';
import PressCard from '../common/PressCard';
import StatusSheet from '../common/StatusSheet';
import { formatCardioDuration } from '../../utils/utils';
import { buildStrengthMessage, compareWithPrevious, describeForPrompt, gradeSession } from '../../lib/strengthProgress';
import { BODY_PARTS } from '../../utils/exerciseData';
import { getUserStorage, setUserStorage } from '../../lib/userStorage';
import { generateContent, extractText } from '../../lib/aiClient';

const DIET_SECTION_BY_MEAL = {
  '아침': 'breakfast',
  '오전간식': 'am_snack',
  '점심': 'lunch',
  '오후간식': 'pm_snack',
  '저녁': 'dinner',
  '야식': 'night_snack',
};

const BODY_PART_OPTIONS = BODY_PARTS.join(', ');

const DIET_SECTION_LABELS = {
  breakfast: '아침',
  am_snack: '오전간식',
  lunch: '점심',
  pm_snack: '오후간식',
  dinner: '저녁',
  night_snack: '야식',
};

function parseDietGoalDetail(detail = '') {
  const text = String(detail || '');
  const numberAfter = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };
  return {
    kcal: numberAfter(/(\d[\d,]*)\s*kcal/i),
    carb: numberAfter(/탄(?:수|수화물)?\s*(\d[\d,]*)\s*g/i),
    protein: numberAfter(/단(?:백질)?\s*(\d[\d,]*)\s*g/i),
    fat: numberAfter(/지(?:방)?\s*(\d[\d,]*)\s*g/i),
  };
}

const FIRST_CARDS = 6;
const MORE_CARDS = 12;

function ListLabel({ children }) {
  return (
    <div className="px-5 pt-1.5 flex items-center gap-2">
      <span className="font-pretendard font-semibold text-[12px] leading-[14px] text-[#868e96] tracking-[-0.3px]">{children}</span>
      <span className="flex-1 h-px bg-[#e9ecef]" />
    </div>
  );
}

function HomeScreen({ user, profile, aiGoals, onRemoveGoal, onNavigateToMemo, onCardClick, onDietCardClick, onOpenCoachRoom, onNavChange, active = true, bell = null }) {
  const [mainTab, setMainTab] = useState("workout");
  const [dateKey, setDateKey] = useState(() => localDateKey());
  // 지난 기록은 처음에 몇 장만 그리고, 목록 끝이 보일 때마다 이어서 그린다 (탭을 바꿀 때 수백 장을 한꺼번에 그리지 않게)
  // 탭이나 날짜가 바뀌면 처음 장수로 돌아간다 (다시 그리는 일을 한 번 더 만들지 않도록 값에서 바로 계산한다)
  const listKey = `${mainTab}-${dateKey}`;
  const [shown, setShown] = useState({ key: listKey, count: FIRST_CARDS });
  const shownCount = shown.key === listKey ? shown.count : FIRST_CARDS;
  const moreRef = useRef(null);
  useEffect(() => {
    const target = moreRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) setShown(prev => ({ key: listKey, count: (prev.key === listKey ? prev.count : FIRST_CARDS) + MORE_CARDS }));
    }, { root: mainRef.current, rootMargin: '600px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  });
  // 홈이 보이는 동안에는 폰 상단 바 색을 보라 상단에 맞춘다
  useEffect(() => {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    metas.forEach(meta => meta.setAttribute('content', active ? '#7171FF' : '#ffffff'));
    return () => metas.forEach(meta => meta.setAttribute('content', '#ffffff'));
  }, [active]);
  // 홈으로 돌아올 때마다 카드가 한 줄씩 다시 쌓여 올라오게 한다 (목록을 새로 그리지 않고 모션만 다시 재생)
  const listRef = useRef(null);
  const enteredRef = useRef(false);
  useEffect(() => {
    if (!enteredRef.current) { enteredRef.current = true; return; }
    const el = listRef.current;
    if (!active || !el) return;
    el.classList.remove('stagger-in');
    void el.offsetWidth;
    el.classList.add('stagger-in');
  }, [active]);
  const [deletingId, setDeletingId] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  const mainRef = useRef(null);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullRef = useRef(0);      // 지금 당겨진 거리 (그리기용 state와 같은 값)
  const pullAnimRef = useRef(0);

  const PULL_THRESHOLD = 52;
  const MAX_PULL = 76;
  const REFRESH_GAP = 56; // 새로고침하는 동안 벌어져 있는 틈

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onMove = (e) => {
      if (!pullStartY.current || isRefreshingRef.current) return;
      const delta = e.touches[0].clientY - pullStartY.current;
      // 당기다 말고 다시 올리거나 스크롤로 넘어가면, 당긴 모양을 남기지 않고 원래대로 되돌린다
      if (el.scrollTop > 0 || delta <= 0) {
        if (isPulling.current) { isPulling.current = false; pullRef.current = 0; setPullDistance(0); }
        return;
      }
      isPulling.current = true;
      e.preventDefault();
      cancelAnimationFrame(pullAnimRef.current);
      pullRef.current = Math.min(MAX_PULL, delta * 0.45);
      setPullDistance(pullRef.current);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  function handleTouchStart(e) {
    // 주간 띠를 옆으로 넘기는 손짓은 새로고침으로 받지 않는다
    if (e.target.closest?.('[data-no-pull]')) { pullStartY.current = 0; return; }
    if (mainRef.current?.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  }

  /* 당긴 거리를 손가락 없이 목표값까지 부드럽게 옮긴다.
     높이만 따로 줄이면 탭과 시트를 잇는 목이 먼저 사라져 틈이 보이므로, 당긴 거리 자체를 되돌려
     목이 다시 굵어지며 붙는 과정까지 그대로 보이게 한다. */
  function settlePull(to, done) {
    cancelAnimationFrame(pullAnimRef.current);
    const from = pullRef.current;
    if (Math.abs(from - to) < 0.5) { pullRef.current = to; setPullDistance(to); done?.(); return; }
    const start = performance.now();
    const duration = 420;
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      pullRef.current = from + (to - from) * eased;
      setPullDistance(pullRef.current);
      if (k < 1) pullAnimRef.current = requestAnimationFrame(step);
      else done?.();
    };
    pullAnimRef.current = requestAnimationFrame(step);
  }

  function handleTouchEnd() {
    pullStartY.current = 0;
    if (isRefreshingRef.current) return;
    const pulled = isPulling.current;
    isPulling.current = false;
    if (pulled && pullRef.current >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      isRefreshingRef.current = true;
      settlePull(REFRESH_GAP);
      setTimeout(() => {
        setRippleKey(k => k + 1);
        setIsRefreshing(false);
        isRefreshingRef.current = false;
        settlePull(0);
      }, 1200);
    } else {
      settlePull(0);
    }
  }
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [dietLogs, setDietLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false); // 첫 기록을 받기 전에는 '기록 없음' 화면을 띄우지 않는다
  const [olderLogs, setOlderLogs] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [hasOlderLogs, setHasOlderLogs] = useState(false);
  const [olderLogsLoading, setOlderLogsLoading] = useState(false);
  const [olderLogsError, setOlderLogsError] = useState('');
  const paginationStartedRef = useRef(false);
  const [coachingInsight, setCoachingInsight] = useState(null);
  const isGoalSavingRef = useRef(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dateChangeTarget, setDateChangeTarget] = useState(null);
  const [dateInput, setDateInput] = useState('');
  const prevAiStatusRef = useRef({});
  const toastTimerRef = useRef(null);
  const retryingRef = useRef(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    let unsubRef = null;
    paginationStartedRef.current = false;
    setOlderLogs([]);
    setOlderCursor(null);
    setHasOlderLogs(false);
    setOlderLogsError('');

    function subscribe() {
      if (cancelled) return;
      const q = query(collection(db, "logs"), where("uid", "==", user.uid), orderBy("timestamp", "desc"), limit(200));
      unsubRef = onSnapshot(q, (snap) => {
        if (cancelled) return;
        const all = snap.docs.map(d => ({ ...d.data(), docId: d.id }));
        all.forEach(d => {
          if (d.type !== 'workout') return;
          const prev = prevAiStatusRef.current[d.docId];
          if ((prev === 'processing' || prev === 'summarized') && d.aiStatus === 'done') {
            const msg = d.overloadMsg ? `✨ ${d.overloadMsg}` : '✨ AI 기록 정리 완료!';
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            setToast({ show: true, message: msg });
            toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
          }
          prevAiStatusRef.current[d.docId] = d.aiStatus;
        });

        const active = all.filter(d => !d.deletedAt);
        const sorted = active.sort((a, b) => (b.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER) - (a.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER));
        setWorkoutLogs(sorted.filter(d => !d.type || d.type === "workout"));
        setDietLogs(sorted.filter(d => d.type === "diet"));
        setLogsLoaded(true);
        if (!paginationStartedRef.current) {
          setOlderCursor(snap.docs.at(-1) || null);
          setHasOlderLogs(snap.size === 200);
        }
      }, (err) => {
        console.error("Firestore 쿼리 오류:", err);
        if (!cancelled) setTimeout(subscribe, 4000);
      });
    }

    subscribe();
    return () => { cancelled = true; unsubRef?.(); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [user?.uid]);

  async function loadOlderLogs() {
    if (!user?.uid || !olderCursor || olderLogsLoading) return;
    paginationStartedRef.current = true;
    setOlderLogsLoading(true);
    setOlderLogsError('');
    try {
      const nextQuery = query(
        collection(db, 'logs'),
        where('uid', '==', user.uid),
        orderBy('timestamp', 'desc'),
        startAfter(olderCursor),
        limit(200),
      );
      const snap = await getDocs(nextQuery);
      const nextLogs = snap.docs
        .map(item => ({ ...item.data(), docId: item.id }))
        .filter(item => !item.deletedAt);
      setOlderLogs(current => {
        const merged = new Map(current.map(item => [item.docId, item]));
        nextLogs.forEach(item => merged.set(item.docId, item));
        return [...merged.values()].sort((a, b) => (b.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER) - (a.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER));
      });
      setOlderCursor(snap.docs.at(-1) || null);
      setHasOlderLogs(snap.size === 200);
    } catch (error) {
      console.error('이전 기록 조회 실패:', error);
      setOlderLogsError('이전 기록을 불러오지 못했어요. 다시 시도해주세요.');
    } finally {
      setOlderLogsLoading(false);
    }
  }

  const mergeVisibleLogs = (firstPage, type) => {
    const merged = new Map(firstPage.map(item => [item.docId, item]));
    olderLogs.filter(item => type === 'workout' ? (!item.type || item.type === 'workout') : item.type === 'diet')
      .forEach(item => merged.set(item.docId, item));
    return [...merged.values()].sort((a, b) => (b.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER) - (a.timestamp?.seconds ?? Number.MAX_SAFE_INTEGER));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleWorkoutLogs = useMemo(() => mergeVisibleLogs(workoutLogs, 'workout'), [workoutLogs, olderLogs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleDietLogs = useMemo(() => mergeVisibleLogs(dietLogs, 'diet'), [dietLogs, olderLogs]);

  useEffect(() => {
    try {
      const stored = getUserStorage(user?.uid, `coaching_insight_${mainTab}`);
      if (!stored) { setCoachingInsight(null); return; }
      const insight = JSON.parse(stored);
      const dismissedAt = parseInt(getUserStorage(user?.uid, `coaching_insight_dismissed_${mainTab}`) || '0');
      if (insight.timestamp > dismissedAt) setCoachingInsight(insight);
      else setCoachingInsight(null);
    } catch { setCoachingInsight(null); }
  }, [mainTab, user?.uid]);

  function dismissInsight() {
    setUserStorage(user?.uid, `coaching_insight_dismissed_${mainTab}`, String(Date.now()));
    setCoachingInsight(null);
  }

  /* 다시 시도할 때의 요약 문구. 무게 기록이 있으면 탑세트 추정 1RM 기준(src/lib/strengthProgress.js). */
  function retryProgress(data, sections) {
    const index = visibleWorkoutLogs.findIndex(log => log.docId === data.docId);
    return compareWithPrevious(sections, index >= 0 ? visibleWorkoutLogs.slice(index + 1) : []);
  }
  function buildRetrySummaryMessage(totalVolume, cardioMinutes = 0, progress = null) {
    const strength = buildStrengthMessage(progress);
    if (strength) return strength;
    if (totalVolume === 0 && cardioMinutes > 0) {
      return `오늘 유산소 ${formatCardioDuration(cardioMinutes)} 기록!`;
    }
    return totalVolume > 0
      ? `오늘 볼륨 ${totalVolume.toLocaleString()}kg`
      : '운동 기록 저장 완료!';
  }
  const retryCommentPrompt = (overloadMsg, data, progress, totalVolume, cardioMinutes) =>
    `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘.\n필수 포함 문구: "${overloadMsg}"\n규칙:\n1. 반드시 저 문구가 제일 앞에 나오게 해.\n2. 저 문구 뒤에 15자 이내의 짧고 강렬한 한마디만 한국어로 덧붙여.\n3. 순수 텍스트만 반환해.\n정보: 운동부위: ${data.title || ''}, 종목별 기록: ${describeForPrompt(progress)}, 총 볼륨: ${totalVolume}kg, 유산소 시간: ${cardioMinutes}분`;

  async function handleRetryAI(data) {
    if (!data?.docId) return;
    if (retryingRef.current.has(data.docId)) return;
    retryingRef.current.add(data.docId);
    const existingSections = (data.sections || []).filter(s => (s.items || []).some(it => it.title || it.body));
    const hasStructuredSections = existingSections.length > 0;
    const rawText = data.originalText ||
      (data.sections || []).flatMap(s => (s.items || []).map(it => it.body)).filter(Boolean).join('\n');
    if (!rawText && !hasStructuredSections) {
      retryingRef.current.delete(data.docId);
      return;
    }
    const docRef = doc(db, 'logs', data.docId);
    await updateDoc(docRef, { aiStatus: 'processing', aiStartedAt: serverTimestamp(), aiError: null });
    const { parseCardioMinutes, parseVolume } = await import('../../utils/utils.js');
    try {
      if (hasStructuredSections) {
        const totalVolume = data.totalVolume || parseVolume(existingSections, profile?.weight);
        const cardioMinutes = data.cardioMinutes || parseCardioMinutes(existingSections);
        const progress = retryProgress(data, existingSections);
        const overloadMsg = buildRetrySummaryMessage(totalVolume, cardioMinutes, progress);
        const commentPrompt = retryCommentPrompt(overloadMsg, data, progress, totalVolume, cardioMinutes);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        let aiComment = overloadMsg;
        try {
          const commentJson = await generateContent({ contents: [{ parts: [{ text: commentPrompt }] }], signal: ctrl.signal });
          aiComment = extractText(commentJson).trim() || overloadMsg;
        } catch {}
        finally { clearTimeout(timer); }
        await updateDoc(docRef, { aiComment, overloadMsg, totalVolume, cardioMinutes, aiStatus: 'done', aiError: null });
        return;
      }

      const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)" }] }]
중요 규칙:
0. part는 반드시 다음 카테고리 중 하나여야 한다: ${BODY_PART_OPTIONS}
0-1. 클라이밍, 러닝/조깅, 사이클, 인터벌, 줄넘기, 로잉머신 등 유산소성 운동은 반드시 '유산소'로 분류할 것.
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
4. "양쪽" / "각 사이드" 같이 좌우 양쪽을 뜻하는 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
7. ${KEEP_REMARKS_RULE}
8. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.
사용자 입력:\n${rawText}`;
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 45000);
      let json;
      try { json = await generateContent({ contents: [{ parts: [{ text: prompt }] }], signal: ctrl1.signal }); }
      finally { clearTimeout(t1); }
      const text = extractText(json);
      if (!text) throw new Error('AI 응답 없음');
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('JSON 배열 없음: ' + cleaned.slice(0, 100));
      const parsed = preserveUserRemarks(JSON.parse(match[0]), data.originalText || existingSections);
      const sections = parsed.map(s => ({ part: s.part || '운동 부위', items: (s.items || []).map(it => ({ title: it.title, body: it.body, ...(it.note ? { note: it.note } : {}) })) }));
      const exercises = sections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
      const totalVolume = parseVolume(sections, profile?.weight);
      const cardioMinutes = parseCardioMinutes(sections);
      const progress = retryProgress(data, sections);
      const overloadMsg = buildRetrySummaryMessage(totalVolume, cardioMinutes, progress);
      await updateDoc(docRef, { sections, exercises, totalVolume, cardioMinutes, overloadMsg, aiStatus: 'summarized', aiError: null });

      const commentPrompt = retryCommentPrompt(overloadMsg, data, progress, totalVolume, cardioMinutes);
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 45000);
      let aiComment = overloadMsg;
      try {
        const commentJson = await generateContent({ contents: [{ parts: [{ text: commentPrompt }] }], signal: ctrl2.signal });
        aiComment = extractText(commentJson).trim() || overloadMsg;
      } catch {}
      finally { clearTimeout(t2); }
      await updateDoc(docRef, { aiComment, aiStatus: 'done', aiError: null });
    } catch (err) {
      const fallbackSections = hasStructuredSections ? existingSections : (data.sections || []);
      const totalVolume = data.totalVolume || parseVolume(fallbackSections, profile?.weight);
      const cardioMinutes = data.cardioMinutes || parseCardioMinutes(fallbackSections);
      const fallbackComment = buildRetrySummaryMessage(totalVolume, cardioMinutes, retryProgress(data, fallbackSections));
      await updateDoc(docRef, {
        aiComment: fallbackComment,
        overloadMsg: fallbackComment,
        totalVolume,
        cardioMinutes,
        aiStatus: 'done',
        aiError: null,
      }).catch(() => {});
    } finally {
      retryingRef.current.delete(data.docId);
    }
  }

  function handleDeleteRequest(target) {
    const nextTarget = typeof target === 'string'
      ? visibleWorkoutLogs.find(log => log.docId === target) || { docId: target, title: '운동 메모' }
      : target;
    if (!nextTarget?.docId) return;
    setDeleteTarget(nextTarget);
  }

  function handleDeleteCancel() {
    setDeleteTarget(null);
  }

  /* QA-13: 삭제가 실패하면 숨겨둔 카드를 되돌리고 실패를 알린다.
     성공했을 때만 목록에서 사라진 상태를 유지한다. */
  function handleDeleteConfirm() {
    if (!deleteTarget?.docId) return;
    const docId = deleteTarget.docId;
    setDeleteTarget(null);
    setDeletingId(docId);
    setTimeout(async () => {
      try {
        await updateDoc(doc(db, "logs", docId), { deletedAt: serverTimestamp() });
        setOlderLogs(current => current.filter(item => item.docId !== docId));
      } catch (error) {
        console.error('기록 삭제 실패:', error);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ show: true, message: '삭제하지 못했어요. 잠시 후 다시 시도해주세요.' });
        toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
      } finally {
        setDeletingId(null);
      }
    }, 400);
  }

  function handleDateChangeRequest(data) {
    const dt = data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    setDateInput(`${y}-${m}-${d}`);
    setDateChangeTarget(data);
  }

  async function handleDateChangeConfirm() {
    if (!dateChangeTarget?.docId || !dateInput) return;
    const newDate = new Date(`${dateInput}T12:00:00`);
    await updateDoc(doc(db, 'logs', dateChangeTarget.docId), { timestamp: Timestamp.fromDate(newDate) });
    setOlderLogs(current => current.map(item => item.docId === dateChangeTarget.docId
      ? { ...item, timestamp: Timestamp.fromDate(newDate) }
      : item));
    setDateChangeTarget(null);
  }

  async function handleGoalComplete(goal) {
    if (isGoalSavingRef.current) return;
    isGoalSavingRef.current = true;
    try {
      const { addDoc, serverTimestamp } = await import('firebase/firestore');
      if (goal.type === 'workout') {
        const { parseCardioMinutes } = await import('../../utils/utils.js');
        const sectionsData = [{
          id: 1, part: "AI 제안 (코치 추천)",
          items: goal.items.map((it, i) => ({ id: i + 1, title: it.name, body: it.detail }))
        }];
        const exercises = goal.items.map(it => ({ name: it.name, thumbnail: "" }));
        const cardioMinutes = parseCardioMinutes(sectionsData);
        await addDoc(collection(db, "logs"), {
          type: "workout", uid: user.uid, title: goal.title, exercises,
          sections: sectionsData, totalVolume: 0, cardioMinutes,
          timestamp: serverTimestamp(), aiComment: "목표 달성! 대단합니다!"
        });
      } else {
        const sectionsMap = {};
        (goal.items || []).forEach((it, i) => {
          const mealLabel = it.meal || (i < 1 ? '아침' : i < 2 ? '점심' : i < 3 ? '저녁' : '간식');
          const sectionId = DIET_SECTION_BY_MEAL[mealLabel] || (mealLabel.includes('간식') ? 'pm_snack' : 'dinner');
          const nutrients = parseDietGoalDetail(it.detail);
          if (!sectionsMap[sectionId]) {
            sectionsMap[sectionId] = { id: sectionId, name: DIET_SECTION_LABELS[sectionId] || mealLabel, items: [] };
          }
          sectionsMap[sectionId].items.push({
            id: `${Date.now()}_${i}`,
            name: it.name,
            ...nutrients,
            source: 'ai-goal',
          });
        });
        const sections = Object.values(sectionsMap);
        const totals = sections.flatMap(s => s.items).reduce((acc, item) => ({
          kcal: acc.kcal + Number(item.kcal || 0),
          carb: acc.carb + Number(item.carb || 0),
          protein: acc.protein + Number(item.protein || 0),
          fat: acc.fat + Number(item.fat || 0),
        }), { kcal: 0, carb: 0, protein: 0, fat: 0 });
        await addDoc(collection(db, "logs"), {
          type: "diet",
          uid: user.uid,
          goal: profile?.targetKcal || 2500,
          kcal: totals.kcal,
          carb: totals.carb,
          protein: totals.protein,
          fat: totals.fat,
          sections,
          timestamp: serverTimestamp(),
          aiComment: "AI 식단 목표 완료!",
        });
      }
      onRemoveGoal(goal.id);
    } catch(e) { console.error("Goal save error:", e); }
    finally { isGoalSavingRef.current = false; }
  }

  const dateChangeSheet = dateChangeTarget ? (
    <div className="fixed inset-0 z-[100] flex justify-center pointer-events-none">
      <div className="relative h-dvh w-full md:max-w-[430px] flex flex-col justify-end pointer-events-auto">
        <div onClick={() => setDateChangeTarget(null)} className="absolute inset-0 bg-black/50" />
        <div className="relative bg-white rounded-t-[24px] px-5 pt-4 pb-[calc(40px+env(safe-area-inset-bottom))] shadow-lg">
          <div className="w-10 h-1 bg-ui-2 rounded-full mx-auto mb-5" />
          <p className="font-pretendard font-semibold text-body-l text-typo-strong tracking-[-0.45px] mb-4">날짜 변경</p>
          <input
            type="date"
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full bg-ui-1 rounded-xl px-4 py-3 font-pretendard text-body-s text-typo-strong outline-none border border-ui-3 focus:border-brand mb-4 transition-colors"
          />
          <Pressable
            pressScale={0.97}
            onClick={handleDateChangeConfirm}
            className="w-full h-[52px] bg-brand rounded-2xl font-pretendard font-bold text-body-s text-white tracking-[-0.375px]"
          >
            변경하기
          </Pressable>
        </div>
      </div>
    </div>
  ) : null;

  /* ── 날짜 중심 보기 ── */
  const todayKey = localDateKey();
  const isToday = dateKey === todayKey;
  // 달력에서든 주간 띠에서든 미래 날짜로는 갈 수 없다
  function changeDate(key) {
    if (key > todayKey) {
      // 아무 반응 없이 막으면 고장 난 것처럼 보이므로 이유를 알려준다
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ show: true, message: '아직 오지 않은 날은 볼 수 없어요' });
      toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
      return;
    }
    setDateKey(key);
  }
  // 탭과 시트를 잇는 목이 끊어진 상태 (충분히 당겼거나 새로고침 중)
  const pullDetached = isRefreshing || pullDistance >= NECK_BREAK;
  const recentDays = lastDays(dateKey, 7);
  const workoutByDate = useMemo(() => groupByDate(visibleWorkoutLogs), [visibleWorkoutLogs]);
  const dietByDate = useMemo(() => groupByDate(visibleDietLogs), [visibleDietLogs]);
  const markedDays = useMemo(() => new Set((mainTab === 'workout' ? workoutByDate : dietByDate).keys()), [mainTab, workoutByDate, dietByDate]);
  const previousWorkouts = useMemo(() => visibleWorkoutLogs.filter(log => logDateKey(log) < dateKey), [visibleWorkoutLogs, dateKey]);
  const previousDiets = useMemo(() => visibleDietLogs.filter(log => logDateKey(log) < dateKey), [visibleDietLogs, dateKey]);
  const summaryGrid = useMemo(() => partGrid(workoutByDate, lastDays(dateKey, 7)), [workoutByDate, dateKey]);
  const summaryCardio = useMemo(() => cardioWeek(workoutByDate, lastDays(dateKey, 7)), [workoutByDate, dateKey]);
  // 주간 띠가 매번 다시 그려지지 않게 같은 함수를 넘긴다
  const changeDateRef = useRef(null);
  const stableChangeDate = useCallback(key => changeDateRef.current?.(key), []);
  changeDateRef.current = changeDate;
  const openTodo = useCallback(() => setRoutineOpen(true), []);
  const dayWorkouts = workoutByDate.get(dateKey) || [];
  // 지난 기록은 처음에 몇 장만 그리고 나머지는 잠시 뒤에 그린다 (첫 등장 모션이 버벅이지 않게)
  const shownPreviousWorkouts = previousWorkouts.slice(0, shownCount);
  const dayDietLogs = dietByDate.get(dateKey) || [];
  const dayDiet = dietDay(dayDietLogs);
  // 새 식단 기록은 오늘 날짜로 저장되므로, 지난 날짜는 이미 있는 기록만 고칠 수 있다
  const dietEditable = isToday || dayDietLogs.length > 0;
  // 끼니 줄을 누르면 그 끼니로 바로 연다
  const openDayDiet = mealId => onDietCardClick(dayDietLogs[0] || null, typeof mealId === 'string' ? mealId : null);

  // 카드마다 직전 같은 종목과 비교한 탑세트 추정 1RM 결과 (배지·요약 줄에 함께 쓴다)
  const progressById = useMemo(() => {
    const map = new Map();
    visibleWorkoutLogs.forEach((d, i) => map.set(d.docId, compareWithPrevious(d.sections || [], visibleWorkoutLogs.slice(i + 1))));
    return map;
  }, [visibleWorkoutLogs]);
  const workoutCard = (d, highlight) => {
    const progress = progressById.get(d.docId);
    const deload = /디로딩/.test(d.overloadMsg || d.aiComment || '');
    return (
      <WorkoutCard key={d.docId} data={d} highlight={highlight} perfGrade={gradeSession(progress, { deload })} progressLine={deload ? '' : buildStrengthMessage(progress)} onCardClick={onCardClick} onDelete={handleDeleteRequest} onChangeDate={handleDateChangeRequest} isDeleting={d.docId === deletingId} onRetryAI={handleRetryAI} />
    );
  };

  const insightCard = (
    <>
        {coachingInsight && coachingInsight.category === mainTab && (
          <div className="mx-4 mt-4 mb-1 bg-white rounded-2xl border border-ui-2 shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#228bed] to-[#c509d6] flex items-center justify-center flex-shrink-0">
                  <IcSpark />
                </div>
                <span className="font-pretendard font-semibold text-caption-l text-typo-normal tracking-[-0.325px]">AI 코치의 한마디</span>
              </div>
              <Pressable pressScale={0.85} onClick={dismissInsight} className="p-1 text-typo-alternative rounded-full">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </Pressable>
            </div>
            <p className="px-4 pb-3 font-pretendard text-body-s text-typo-secondary tracking-[-0.35px] overflow-hidden whitespace-nowrap text-ellipsis">
              {coachingInsight.text}
            </p>
            <PressCard
              onClick={() => { dismissInsight(); onOpenCoachRoom?.(coachingInsight.roomType || 'powerbuilding'); }}
              radius={0}
              innerRadius="8px 8px 12px 12px"
              pad={false}
              className="border-t border-ui-2 cursor-pointer"
            >
              <span className="block px-4 py-3 font-pretendard text-caption-l font-semibold text-brand tracking-[-0.325px]">이어서 대화하기 →</span>
            </PressCard>
          </div>
        )}
    </>
  );
  const goalCards = (
    <>
        {aiGoals?.filter(g => g.type === mainTab).map(goal => (
          <GoalCard key={goal.id} goal={goal} onComplete={handleGoalComplete} onDismiss={onRemoveGoal} />
        ))}
    </>
  );

  // isolate: 홈 안의 붙어 있는 상단(z-30)이 홈 밖의 화면(식단·운동 입력) 위로 올라오지 않게 가둔다.
  // PC 폭에서는 탭 패널이 층을 따로 만들지 않아, 이게 없으면 홈 상단이 입력 화면의 상단을 덮는다.
  return (
    <div className="relative isolate h-full overflow-hidden bg-[#f8f9fa]">
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.type === 'diet' ? '식단 기록을 삭제할까요?' : '운동 메모를 삭제할까요?'}
        subtitle={`${deleteTarget?.type === 'diet' ? '식단' : (deleteTarget?.title || '이')} 기록이 휴지통으로 이동됩니다.\n마이페이지 휴지통에서 30일 내 복원할 수 있습니다.`}
        confirmText="삭제"
        cancelText="취소"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Pull-to-refresh 파동 효과 */}
      {rippleKey > 0 && (
        <div
          key={rippleKey}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 1400,
            height: 1400,
            top: -570,
            left: '50%',
            marginLeft: -700,
            background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 70%)',
            animation: 'pullRefreshRipple 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
            zIndex: 40,
          }}
        />
      )}

      {/* 화면 전체가 하나의 스크롤. 날짜 줄과 탭은 위에 붙고, 주간 띠는 스크롤하면 가려진다. */}
      <main
        ref={mainRef}
        className="h-full overflow-y-auto overscroll-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <HomeDateRow dateKey={dateKey} todayKey={todayKey} onDateChange={stableChangeDate} onTodoClick={openTodo} bell={bell} />
        <WeekStrip dateKey={dateKey} todayKey={todayKey} markedDays={markedDays} onDateChange={stableChangeDate} />
        <HomeTabs tab={mainTab} onTabChange={setMainTab} pull={pullDistance} detached={pullDetached} />

        {/* 당겨서 새로고침: 시트가 아래로 내려가며 생기는 보라 틈. 탭과 시트가 물방울처럼 늘어지다 끊어진다. */}
        <PullGap
          height={pullDistance}
          pull={pullDistance}
          detached={pullDetached}
          tabIndex={mainTab === 'workout' ? 0 : 1}
          width={mainRef.current?.clientWidth || 390}
          animate={false}
        >
          <div
            className={`relative w-6 h-6 border-2 border-white/30 border-t-white rounded-full ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              opacity: isRefreshing ? 1 : Math.min(1, Math.max(0, (pullDistance - NECK_BREAK) / (PULL_THRESHOLD - NECK_BREAK))),
              transform: isRefreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
            }}
          />
        </PullGap>

        {/* 당기는 동안에는 시트를 1px 올려 틈과 겹친다. 틈 높이가 소수점이라 경계에 보라색 실선이 비치기 때문이다. */}
        <div className="relative z-[15] bg-[#f8f9fa] min-h-full pb-[120px]" style={pullDistance > 0 ? { marginTop: -1 } : undefined}>
        <SheetCorners />
        <div ref={listRef} key={`${mainTab}-${dateKey}`} className="stagger-in flex flex-col gap-3 pt-[14px]">
        {!logsLoaded ? null : mainTab === "workout" ? (
          visibleWorkoutLogs.length === 0 ? (
            <>
              <WeightInputRow uid={user?.uid} dateKey={dateKey} />
              <div className="flex flex-col items-center px-8 pt-20 gap-2">
                <p className="font-pretendard font-bold text-[18px] text-typo-strong tracking-[-0.4px]">아직 운동 기록이 없어요</p>
                <p className="font-pretendard text-body-s text-typo-alternative text-center tracking-[-0.3px] leading-relaxed">첫 운동을 기록하면 여기에 차곡차곡 쌓여요</p>
                <Pressable pressScale={0.97} onClick={onNavigateToMemo} className="mt-3 px-6 py-3 bg-brand text-white rounded-2xl font-pretendard font-bold text-body-s tracking-[-0.35px]">
                  운동 기록하기
                </Pressable>
              </div>
            </>
          ) : (
            <>
              <WeightInputRow uid={user?.uid} dateKey={dateKey} />
              <WorkoutSummary days={recentDays} grid={summaryGrid} cardio={summaryCardio} />
              {insightCard}
              {goalCards}
              {dayWorkouts.length > 0 ? dayWorkouts.map(d => workoutCard(d, true)) : (
                <div className="px-4">
                  <div className="rounded-[20px] border border-dashed border-[#dee2e6] px-4 py-3 flex items-center justify-between gap-3">
                    <p className="font-pretendard font-medium text-[14px] leading-5 text-[#868e96] tracking-[-0.35px]">{isToday ? '오늘은 아직 운동 기록이 없어요' : '이 날은 운동 기록이 없어요'}</p>
                    {isToday && (
                      <Pressable pressScale={0.93} onClick={onNavigateToMemo} className="flex-none font-pretendard font-bold text-[13px] text-brand tracking-[-0.325px]">기록하기</Pressable>
                    )}
                  </div>
                </div>
              )}
              {previousWorkouts.length > 0 && <ListLabel>이전 기록</ListLabel>}
              {shownPreviousWorkouts.map(d => workoutCard(d, false))}
            </>
          )
        ) : (
          <>
              {!profile?.targetKcal && (
                <div className="mx-4 mt-4 mb-1 bg-[#fff8f0] rounded-[20px] border border-[#ffd8a8] px-4 py-3.5 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">🎯</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-pretendard font-bold text-body-s text-[#e67700] tracking-[-0.35px]">목표 칼로리를 설정해보세요</p>
                    <p className="font-pretendard text-caption-m text-typo-alternative mt-0.5 tracking-[-0.3px]">설정하면 오늘 달성률을 확인할 수 있어요</p>
                  </div>
                  <Pressable pressScale={0.93} onClick={() => onNavChange?.('mypage')} className="flex-shrink-0 font-pretendard text-caption-l font-bold text-[#e67700] tracking-[-0.3px]">
                    설정 →
                  </Pressable>
                </div>
              )}

            <TodayDietCard
              intake={{
                totals: dayDiet.totals,
                isToday,
                target: Number(profile?.targetKcal || 0),
                week: recentDays.map(day => ({ ...day, kcal: (dietByDate.get(day.key) || []).reduce((sum, log) => sum + Number(log.kcal || 0), 0) })),
                onClick: dietEditable ? openDayDiet : undefined,
                onLongPress: dayDietLogs[0] ? () => handleDeleteRequest(dayDietLogs[0]) : undefined,
              }}
              meals={{ meals: dayDiet.meals, editable: dietEditable, onOpen: openDayDiet }}
            />
            {insightCard}
            {goalCards}
            {previousDiets.length > 0 && <ListLabel>최근 기록</ListLabel>}
            {previousDiets.slice(0, shownCount).map((d) => (
                <DietCard key={d.docId} data={d} onCardClick={onDietCardClick} isDeleting={d.docId === deletingId} targetKcal={profile?.targetKcal} profile={profile} onDelete={handleDeleteRequest} onChangeDate={handleDateChangeRequest} />
            ))}
          </>
        )}
        </div>
        <div ref={moreRef} aria-hidden="true" className="h-px" />
        {(hasOlderLogs || olderLogsError) && (
          <div className="px-4 pt-3 pb-2 text-center">
            {olderLogsError && (
              <p role="alert" className="mb-2 font-pretendard text-caption-m text-[#e03e52]">{olderLogsError}</p>
            )}
            <Pressable
              pressScale={0.97}
              onClick={loadOlderLogs}
              disabled={olderLogsLoading}
              className="w-full h-12 rounded-2xl border border-ui-3 bg-white font-pretendard text-body-s font-semibold text-brand disabled:opacity-50"
            >
              {olderLogsLoading ? '불러오는 중…' : '이전 기록 더 보기'}
            </Pressable>
          </div>
        )}
        </div>
      </main>

      {/* 날짜 변경 바텀시트 */}
      {dateChangeSheet && typeof document !== 'undefined'
        ? createPortal(dateChangeSheet, document.body)
        : dateChangeSheet}

      <Toast show={toast.show} message={toast.message} />

      {routineOpen && (
        <StatusSheet
          onClose={() => setRoutineOpen(false)}
          workoutLogs={workoutLogs}
          dietLogs={dietLogs}
          profile={profile}
        />
      )}
    </div>
  );
}

export default HomeScreen;
