import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import Button from '../common/Button';
import WorkoutCard from '../dashboard/WorkoutCard';
import DietCard from '../dashboard/DietCard';
import { IcPencil } from '../icons/Icons';
import TopNav from '../common/TopNav';
import MainTab from '../common/MainTab';
import BottomNav from '../common/BottomNav';

const MOCK_DIET = [
  { date: "25. 3. 18", kcal: 2743, goal: 2700, carb: 55, protein: 31, fat: 14, aiComment: "칼로리 최적! 단백질만 조금 더 보충해봐요." },
  { date: "25. 3. 17", kcal: 2210, goal: 2700, carb: 50, protein: 35, fat: 15, aiComment: "균형 잡힌 식단이에요! 오늘도 화이팅!" },
  { date: "25. 3. 16", kcal: 1980, goal: 2700, carb: 48, protein: 38, fat: 14, aiComment: "섭취가 조금 부족해요. 건강한 간식을 챙겨봐요!" },
];

function HomeScreen({ onNavigateToMemo, onCardClick, onDietCardClick, onNavChange }) {
  const [mainTab, setMainTab] = useState("workout");
  const [fabOpen, setFabOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [dietLogs, setDietLogs] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const wDocs = [];
      const dDocs = [];
      snap.forEach(d => { 
        const data = d.data(); 
        if (!data.type || data.type === "workout") wDocs.push({ ...data, docId: d.id }); 
        if (data.type === "diet") dDocs.push({ ...data, docId: d.id });
      });
      setWorkoutLogs(wDocs);
      setDietLogs(dDocs);
    });
    return () => unsub();
  }, []);

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
        {mainTab === "workout"
          ? workoutLogs.length === 0
            ? <div className="text-center text-typo-alternative text-body-s mt-10">기록된 쇠질이 없습니다.</div>
            : workoutLogs.map((d) => <WorkoutCard key={d.docId} data={d} onCardClick={onCardClick} onDelete={handleDelete} isDeleting={d.docId === deletingId} />)
          : dietLogs.length === 0
            ? <div className="text-center text-typo-alternative text-body-s mt-10">기록된 식단이 없습니다.</div>
            : dietLogs.map((d) => (
                <div onClick={() => onDietCardClick(d)} key={d.docId}>
                  <DietCard data={d} isDeleting={d.docId === deletingId} />
                </div>
              ))
        }
      </main>

      {/* FAB 딤 */}
      {fabOpen && <div onClick={() => setFabOpen(false)} className="fixed inset-0 bg-black/40 z-[35]" />}

      {/* FAB 메뉴 */}
      <div className="fixed bottom-[84px] right-4 z-[40] flex flex-col items-end gap-3">
        <div className={`fab-menu${fabOpen ? " open" : ""} bg-brand rounded-lg px-4`}>
          <button onClick={() => handleFabOption("workout")} className="flex w-full py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none border-none text-left">쇠질</button>
          <button onClick={() => handleFabOption("diet")} className="flex w-full py-2 text-white text-body-s font-semibold tracking-[-0.35px] whitespace-nowrap bg-none border-none text-left">식단</button>
        </div>
        {!fabOpen && (
          <button onClick={() => setFabOpen(true)} className="w-[48px] h-[48px] bg-brand rounded-full flex items-center justify-center shadow-fab border-none">
            <IcPencil />
          </button>
        )}
      </div>

      <BottomNav activeId="home" onChange={onNavChange} />
    </div>
  );
}

export default HomeScreen;
