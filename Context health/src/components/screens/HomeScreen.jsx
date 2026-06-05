import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import WorkoutCard from '../dashboard/WorkoutCard';
import DietCard from '../dashboard/DietCard';
import GoalCard from '../dashboard/GoalCard';
import WeeklyVolumeChart from '../dashboard/WeeklyVolumeChart';
import DailyNutritionCard from '../dashboard/DailyNutritionCard';
import WeeklyCalorieChart from '../dashboard/WeeklyCalorieChart';
import { IcPencil, IcSpark } from '../icons/Icons';
import TopNav from '../common/TopNav';
import MainTab from '../common/MainTab';
import Toast from '../common/Toast';
import ConfirmModal from '../common/ConfirmModal';
import Pressable from '../common/Pressable';
import StatusSheet from '../common/StatusSheet';

const DIET_SECTION_BY_MEAL = {
  '아침': 'breakfast',
  '오전간식': 'am_snack',
  '점심': 'lunch',
  '오후간식': 'pm_snack',
  '저녁': 'dinner',
  '야식': 'night_snack',
};

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

function calcStreak(workoutLogs) {
  const DAY = 86400000;
  const uniqueDays = new Set(
    workoutLogs.map(log => {
      const d = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
      if (!d) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }).filter(Boolean)
  );
  const todayTime = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const start = uniqueDays.has(todayTime) ? todayTime : todayTime - DAY;
  if (!uniqueDays.has(start)) return 0;
  let streak = 0;
  let cur = start;
  while (uniqueDays.has(cur)) { streak++; cur -= DAY; }
  return streak;
}

function HomeScreen({ user, profile, aiGoals, onRemoveGoal, onNavigateToMemo, onCardClick, onDietCardClick, onOpenCoachRoom, onNavChange }) {
  const [mainTab, setMainTab] = useState("workout");
  const [fabOpen, setFabOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  const mainRef = useRef(null);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);
  const isRefreshingRef = useRef(false);

  const PULL_THRESHOLD = 52;
  const MAX_PULL = 76;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onMove = (e) => {
      if (!pullStartY.current || isRefreshingRef.current) return;
      if (el.scrollTop > 0) { isPulling.current = false; return; }
      const delta = e.touches[0].clientY - pullStartY.current;
      if (delta > 0) {
        isPulling.current = true;
        e.preventDefault();
        setPullDistance(Math.min(MAX_PULL, delta * 0.45));
      }
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  function handleTouchStart(e) {
    if (mainRef.current?.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  }

  function handleTouchEnd() {
    if (!isPulling.current) return;
    isPulling.current = false;
    pullStartY.current = 0;
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      isRefreshingRef.current = true;
      setPullDistance(0);
      setTimeout(() => {
        setRippleKey(k => k + 1);
        setIsRefreshing(false);
        isRefreshingRef.current = false;
      }, 1200);
    } else {
      setPullDistance(0);
    }
  }
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [dietLogs, setDietLogs] = useState([]);
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
        const sorted = active.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setWorkoutLogs(sorted.filter(d => !d.type || d.type === "workout"));
        setDietLogs(sorted.filter(d => d.type === "diet"));
      }, (err) => {
        console.error("Firestore 쿼리 오류:", err);
        if (!cancelled) setTimeout(subscribe, 4000);
      });
    }

    subscribe();
    return () => { cancelled = true; unsubRef?.(); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [user?.uid]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`coaching_insight_${mainTab}`);
      if (!stored) { setCoachingInsight(null); return; }
      const insight = JSON.parse(stored);
      const dismissedAt = parseInt(localStorage.getItem(`coaching_insight_dismissed_${mainTab}`) || '0');
      if (insight.timestamp > dismissedAt) setCoachingInsight(insight);
      else setCoachingInsight(null);
    } catch { setCoachingInsight(null); }
  }, [mainTab]);

  function dismissInsight() {
    localStorage.setItem(`coaching_insight_dismissed_${mainTab}`, String(Date.now()));
    setCoachingInsight(null);
  }

  function handleFabOption(type) {
    setFabOpen(false);
    if (type === "workout") onNavigateToMemo();
    if (type === "diet") onDietCardClick(null); // 새 식단 생성
  }

  async function handleRetryAI(data) {
    if (!data?.docId) return;
    if (retryingRef.current.has(data.docId)) return;
    retryingRef.current.add(data.docId);
    const rawText = data.originalText ||
      (data.sections || []).flatMap(s => (s.items || []).map(it => it.body)).filter(Boolean).join('\n');
    if (!rawText) return;
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const docRef = doc(db, 'logs', data.docId);
    await updateDoc(docRef, { aiStatus: 'processing', aiError: null });
    const { parseVolume } = await import('../../utils/utils.js');
    try {
      const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회", "note": "느낀점(선택)" }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘.
4. "양쪽" / "각 사이드" 같이 좌우 양쪽을 뜻하는 표기는 절대 삭제하지 말고 해당 세트의 body 텍스트 안에 그대로 유지해.
8. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마.
사용자 입력:\n${rawText}`;
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 15000);
      let res;
      try { res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: ctrl1.signal }); }
      finally { clearTimeout(t1); }
      const json = await res.json();
      if (json.error || !json.candidates?.[0]) throw new Error(json.error?.message || 'AI 응답 없음');
      const parts = json.candidates[0].content.parts;
      const text = (parts.find(p => !p.thought) ?? parts[parts.length - 1]).text;
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('JSON 배열 없음: ' + cleaned.slice(0, 100));
      const parsed = JSON.parse(match[0]);
      const sections = parsed.map(s => ({ part: s.part || '운동 부위', items: (s.items || []).map(it => ({ title: it.title, body: it.body, ...(it.note ? { note: it.note } : {}) })) }));
      const exercises = sections.flatMap(s => s.items.map(it => ({ name: it.title }))).filter(ex => ex.name);
      const totalVolume = parseVolume(sections, profile?.weight);
      const overloadMsg = `오늘 볼륨 ${totalVolume.toLocaleString()}kg`;
      await updateDoc(docRef, { sections, exercises, totalVolume, aiStatus: 'summarized', aiError: null });

      const commentPrompt = `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘.\n필수 포함 문구: "${overloadMsg}"\n규칙:\n1. 반드시 저 문구가 제일 앞에 나오게 해.\n2. 30자 이내로 짧고 강렬하게 한국어로 써.\n3. 순수 텍스트만 반환해.\n정보: 운동부위: ${data.title || ''}, 총 볼륨: ${totalVolume}kg`;
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 15000);
      let commentRes;
      try { commentRes = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: commentPrompt }] }] }), signal: ctrl2.signal }); }
      finally { clearTimeout(t2); }
      const commentJson = await commentRes.json();
      if (commentJson.candidates?.[0]) {
        const cParts = commentJson.candidates[0].content.parts;
        const aiComment = (cParts.find(p => !p.thought) ?? cParts[cParts.length - 1]).text.trim();
        await updateDoc(docRef, { aiComment, aiStatus: 'done' });
      } else {
        await updateDoc(docRef, { aiStatus: 'done' });
      }
    } catch (err) {
      await updateDoc(docRef, { aiStatus: 'error', aiError: `${err.name}: ${err.message}`.slice(0, 300) }).catch(() => {});
    } finally {
      retryingRef.current.delete(data.docId);
    }
  }

  function handleDeleteRequest(target) {
    const nextTarget = typeof target === 'string'
      ? workoutLogs.find(log => log.docId === target) || { docId: target, title: '쇠질 메모' }
      : target;
    if (!nextTarget?.docId) return;
    setDeleteTarget(nextTarget);
  }

  function handleDeleteCancel() {
    setDeleteTarget(null);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget?.docId) return;
    const docId = deleteTarget.docId;
    setDeleteTarget(null);
    setDeletingId(docId);
    setTimeout(async () => {
      await updateDoc(doc(db, "logs", docId), { deletedAt: serverTimestamp() });
      setDeletingId(null);
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
    setDateChangeTarget(null);
  }

  async function handleGoalComplete(goal) {
    if (isGoalSavingRef.current) return;
    isGoalSavingRef.current = true;
    try {
      const { addDoc, serverTimestamp } = await import('firebase/firestore');
      if (goal.type === 'workout') {
        const sectionsData = [{
          id: 1, part: "AI 제안 (코치 추천)",
          items: goal.items.map((it, i) => ({ id: i + 1, title: it.name, body: it.detail }))
        }];
        const exercises = goal.items.map(it => ({ name: it.name, thumbnail: "" }));
        await addDoc(collection(db, "logs"), {
          type: "workout", uid: user.uid, title: goal.title, exercises,
          sections: sectionsData, totalVolume: 0, 
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
      <div className="relative h-dvh w-full max-w-[430px] flex flex-col justify-end pointer-events-auto">
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.type === 'diet' ? '식단 기록을 삭제할까요?' : '쇠질 메모를 삭제할까요?'}
        subtitle={`${deleteTarget?.type === 'diet' ? '식단' : (deleteTarget?.title || '이')} 기록이 휴지통으로 이동됩니다.\n마이페이지 휴지통에서 30일 내 복원할 수 있습니다.`}
        confirmText="삭제"
        cancelText="취소"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* 헤더 */}
      <header className="z-20 flex-none flex flex-col">
        <TopNav title="내 상태" onTodoClick={() => setRoutineOpen(true)} />
        <MainTab 
          tabs={[{ id: 'workout', label: '쇠질' }, { id: 'diet', label: '식단' }]} 
          activeId={mainTab} 
          onChange={setMainTab} 
        />
      </header>

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
            background: 'radial-gradient(circle, rgba(52,118,238,0.13) 0%, transparent 70%)',
            animation: 'pullRefreshRipple 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
            zIndex: 10,
          }}
        />
      )}

      {/* Pull-to-refresh 인디케이터 */}
      <div
        className="flex-none flex justify-center items-center overflow-hidden"
        style={{
          height: isRefreshing ? 56 : pullDistance,
          transition: pullDistance === 0 ? 'height 0.45s cubic-bezier(.2,.8,.2,1)' : 'none',
        }}
      >
        <div
          className={`w-6 h-6 border-2 border-ui-3 border-t-brand rounded-full ${isRefreshing ? 'animate-spin' : ''}`}
          style={{
            opacity: isRefreshing ? 1 : Math.min(1, pullDistance / PULL_THRESHOLD),
            transform: isRefreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
          }}
        />
      </div>

      {/* 콘텐츠 */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto pb-[120px]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
      {/* AI 코칭 인사이트 카드 — 해당 탭에서만 노출 */}
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
            <button
              onClick={() => { dismissInsight(); onOpenCoachRoom?.(coachingInsight.roomType || 'powerbuilding'); }}
              className="w-full px-4 py-3 border-t border-ui-2 text-left font-pretendard text-caption-l font-semibold text-brand tracking-[-0.325px] transition-all duration-100 active:opacity-50 active:bg-ui-1"
            >
              이어서 대화하기 →
            </button>
          </div>
        )}

        {/* AI 추천 목표 카드 */}
        {aiGoals?.filter(g => g.type === mainTab).map(goal => (
          <GoalCard key={goal.id} goal={goal} onComplete={handleGoalComplete} onDismiss={onRemoveGoal} />
        ))}
        
        {/* 기존 로그 렌더링 시작 직전 구분선 (목표 카드가 있을 때만) */}
        {aiGoals?.some(g => g.type === mainTab) && (
          <div className="mx-4 mt-6 mb-4 flex items-center gap-3">
             <div className="h-px bg-ui-2 flex-1" />
             <span className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">이전 기록</span>
             <div className="h-px bg-ui-2 flex-1" />
          </div>
        )}

        {mainTab === "workout" ? (
          workoutLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 pt-16 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-ui-1 flex items-center justify-center text-3xl mb-1">🏋️</div>
              <p className="font-pretendard font-bold text-[17px] text-typo-strong tracking-[-0.4px]">첫 쇠질을 기록해봐요!</p>
              <p className="font-pretendard text-body-s text-typo-alternative text-center tracking-[-0.3px] leading-relaxed">AI가 거친 메모를 깔끔하게 정리해드려요</p>
              <Pressable pressScale={0.97} onClick={onNavigateToMemo} className="mt-2 px-6 py-3 bg-brand text-white rounded-2xl font-pretendard font-bold text-body-s tracking-[-0.35px]">
                기록 시작하기
              </Pressable>
            </div>
          ) : (() => {
            const streak = calcStreak(workoutLogs);
            return (
              <>
                {streak >= 2 && (
                  <div className="mx-4 mt-4 mb-1 flex items-center gap-2.5 bg-white rounded-[16px] border border-ui-2 px-4 py-3 shadow-[0_0_16px_rgba(3,27,38,0.06)]">
                    <span className="text-xl">🔥</span>
                    <p className="font-pretendard font-bold text-body-s text-typo-strong tracking-[-0.35px]">{streak}일 연속 쇠질 중!</p>
                    <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">Keep going</p>
                  </div>
                )}
                <WeeklyVolumeChart workoutLogs={workoutLogs} />
                {workoutLogs.map((d) => (
                  <WorkoutCard key={d.docId} data={d} onCardClick={onCardClick} onDelete={handleDeleteRequest} onChangeDate={handleDateChangeRequest} isDeleting={d.docId === deletingId} onRetryAI={handleRetryAI} />
                ))}
              </>
            );
          })()
        ) : (
          dietLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 pt-16 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-ui-1 flex items-center justify-center text-3xl mb-1">🥗</div>
              <p className="font-pretendard font-bold text-[17px] text-typo-strong tracking-[-0.4px]">오늘 뭐 먹었나요?</p>
              <p className="font-pretendard text-body-s text-typo-alternative text-center tracking-[-0.3px] leading-relaxed">자연어로 입력하면 AI가 영양소를 분석해요</p>
              <Pressable pressScale={0.97} onClick={() => onDietCardClick(null)} className="mt-2 px-6 py-3 bg-brand text-white rounded-2xl font-pretendard font-bold text-body-s tracking-[-0.35px]">
                식단 기록하기
              </Pressable>
            </div>
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
              <DailyNutritionCard dietLogs={dietLogs} profile={profile} />
              <WeeklyCalorieChart dietLogs={dietLogs} profile={profile} />
              {dietLogs.map((d) => (
                <div onClick={() => onDietCardClick(d)} key={d.docId}>
                  <DietCard data={d} isDeleting={d.docId === deletingId} targetKcal={profile?.targetKcal} profile={profile} onDelete={handleDeleteRequest} onChangeDate={handleDateChangeRequest} />
                </div>
              ))}
            </>
          )
        )}
      </main>

      {/* FAB 딤 */}
      {fabOpen && <div onClick={() => setFabOpen(false)} className="fixed inset-0 bg-black/40 z-[35]" />}

      {/* 쇠질/식단 메뉴 - FAB와 같은 위치에서 대체 */}
      <div className={`fixed bottom-[84px] right-[10px] z-[40] fab-menu${fabOpen ? " open" : ""} rounded-lg px-2 shadow-[0_0_6px_rgba(0,0,0,0.04)] bg-[linear-gradient(135deg,#228bed_0%,#c509d6_100%)]`}>
        <button onClick={() => handleFabOption("workout")} className="flex w-full items-center justify-center border-b border-white px-4 py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none transition-all duration-100 active:opacity-60">쇠질</button>
        <button onClick={() => handleFabOption("diet")} className="flex w-full items-center justify-center px-4 py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none border-none transition-all duration-100 active:opacity-60">식단</button>
      </div>

      {/* FAB 버튼 - 메뉴 열리면 숨김 */}
      {!fabOpen && (
        <Pressable pressScale={0.90} onClick={() => setFabOpen(true)} className="fixed bottom-[84px] right-[10px] z-[36] w-[48px] h-[48px] bg-brand rounded-full flex items-center justify-center shadow-fab border-none">
          <IcPencil />
        </Pressable>
      )}

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
