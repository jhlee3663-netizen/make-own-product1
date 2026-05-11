import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import WorkoutCard from '../dashboard/WorkoutCard';
import DietCard from '../dashboard/DietCard';
import GoalCard from '../dashboard/GoalCard';
import { IcPencil, IcSpark } from '../icons/Icons';
import TopNav from '../common/TopNav';
import MainTab from '../common/MainTab';

function HomeScreen({ user, profile, aiGoals, onRemoveGoal, onNavigateToMemo, onCardClick, onDietCardClick, onOpenCoachRoom }) {
  const [mainTab, setMainTab] = useState("workout");
  const [fabOpen, setFabOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [dietLogs, setDietLogs] = useState([]);
  const [coachingInsight, setCoachingInsight] = useState(null);
  const [isGoalSaving, setIsGoalSaving] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "logs"), where("uid", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs
        .map(d => ({ ...d.data(), docId: d.id }))
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setWorkoutLogs(all.filter(d => !d.type || d.type === "workout"));
      setDietLogs(all.filter(d => d.type === "diet"));
    }, (err) => console.error("Firestore 쿼리 오류:", err));
    return () => unsub();
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

  function handleDelete(docId) {
    setDeletingId(docId);
    setTimeout(async () => {
      await deleteDoc(doc(db, "logs", docId));
      setDeletingId(null);
    }, 400);
  }

  async function handleGoalComplete(goal) {
    if (isGoalSaving) return;
    setIsGoalSaving(true);
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
        const kcal = goal.items.reduce((acc, it) => acc + (parseInt(it.detail)||0), 0);
        await addDoc(collection(db, "logs"), {
          type: "diet", uid: user.uid, kcal, carb:0, protein:0, fat:0,
          timestamp: serverTimestamp(), aiComment: "식단 목표 완료!"
        });
      }
      onRemoveGoal(goal.id);
    } catch(e) { console.error("Goal save error:", e); }
    finally { setIsGoalSaving(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <header className="z-20 flex-none flex flex-col">
        <TopNav title="할 일" />
        <MainTab 
          tabs={[{ id: 'workout', label: '쇠질' }, { id: 'diet', label: '식단' }]} 
          activeId={mainTab} 
          onChange={setMainTab} 
        />
      </header>

      {/* 콘텐츠 */}
      <main className="flex-1 overflow-y-auto pb-[120px]">
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
              <button onClick={dismissInsight} className="p-1 text-typo-alternative transition-all duration-100 active:scale-[0.82] active:opacity-50 rounded-full">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
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

        {mainTab === "workout"
          ? workoutLogs.length === 0
            ? <div className="text-center text-typo-alternative text-body-s mt-10">기록된 쇠질이 없습니다.</div>
            : workoutLogs.map((d) => <WorkoutCard key={d.docId} data={d} onCardClick={onCardClick} onDelete={handleDelete} isDeleting={d.docId === deletingId} />)
          : dietLogs.length === 0
            ? <div className="text-center text-typo-alternative text-body-s mt-10">기록된 식단이 없습니다.</div>
            : dietLogs.map((d) => (
                <div onClick={() => onDietCardClick(d)} key={d.docId}>
                  <DietCard data={d} isDeleting={d.docId === deletingId} targetKcal={profile?.targetKcal} />
                </div>
              ))
        }
      </main>

      {/* FAB 딤 */}
      {fabOpen && <div onClick={() => setFabOpen(false)} className="fixed inset-0 bg-black/40 z-[35]" />}

      {/* FAB 메뉴 */}
      <div className="fixed bottom-[84px] right-[10px] z-[40] flex flex-col items-end gap-3">
        <div className={`fab-menu${fabOpen ? " open" : ""} rounded-lg px-2 shadow-[0_0_6px_rgba(0,0,0,0.04)] bg-[linear-gradient(135deg,#228bed_0%,#c509d6_100%)]`}>
          <button onClick={() => handleFabOption("workout")} className="flex w-full items-center justify-center border-b border-white px-4 py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none transition-all duration-100 active:opacity-60">쇠질</button>
          <button onClick={() => handleFabOption("diet")} className="flex w-full items-center justify-center px-4 py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none border-none transition-all duration-100 active:opacity-60">식단</button>
        </div>
        {!fabOpen && (
          <button onClick={() => setFabOpen(true)} className="w-[48px] h-[48px] bg-brand rounded-full flex items-center justify-center shadow-fab border-none transition-all duration-150 active:scale-[0.90] active:brightness-90">
            <IcPencil />
          </button>
        )}
      </div>

    </div>
  );
}

export default HomeScreen;
