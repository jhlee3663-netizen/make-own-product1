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
import WorkoutCard from '../dashboard/WorkoutCard';
import DietCard from '../dashboard/DietCard';
import { IcPencil, IcHome, IcGrid, IcUser } from '../icons/Icons';

const MOCK_DIET = [
  { date: "25. 3. 18", kcal: 2743, goal: 2700, carb: 55, protein: 31, fat: 14, aiComment: "칼로리 최적! 단백질만 조금 더 보충해봐요." },
  { date: "25. 3. 17", kcal: 2210, goal: 2700, carb: 50, protein: 35, fat: 15, aiComment: "균형 잡힌 식단이에요! 오늘도 화이팅!" },
  { date: "25. 3. 16", kcal: 1980, goal: 2700, carb: 48, protein: 38, fat: 14, aiComment: "섭취가 조금 부족해요. 건강한 간식을 챙겨봐요!" },
];

function HomeScreen({ onNavigateToMemo, onCardClick }) {
  const [mainTab, setMainTab] = useState("workout");
  const [fabOpen, setFabOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = [];
      snap.forEach(d => { 
        const data = d.data(); 
        if (!data.type || data.type === "workout") docs.push({ ...data, docId: d.id }); 
      });
      setWorkoutLogs(docs);
    });
    return () => unsub();
  }, []);

  function handleFabOption(type) {
    setFabOpen(false);
    if (type === "workout") onNavigateToMemo();
    else setSheetOpen(true);
  }

  function handleDelete(docId) {
    setDeletingId(docId);
    setTimeout(async () => {
      await deleteDoc(doc(db, "logs", docId));
      setDeletingId(null);
    }, 400);
  }

  async function handleSave() {
    if (!inputVal.trim()) return;
    setSaving(true);
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY; 
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const prompt = `사용자 텍스트를 분석해 순수 JSON만 반환해라. title:핵심 운동부위 짧은 명사, exercises:[{name,sets:[]}], aiComment:동기부여 한줄평. 텍스트:${inputVal}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      const json = await res.json();
      if (!json.candidates) throw new Error("AI 응답 실패: " + JSON.stringify(json));
      let txt = json.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(txt);
      await addDoc(collection(db, "logs"), { 
        type: "workout", 
        timestamp: serverTimestamp(), 
        originalText: inputVal, 
        title: parsed.title || "새로운 기록", 
        exercises: parsed.exercises || [], 
        aiComment: parsed.aiComment || "완벽하게 기록되었습니다!" 
      });
      setInputVal(""); setSheetOpen(false);
    } catch (e) { 
      console.error("Home AI Error:", e);
      alert("AI 파싱 에러: " + e.message); 
    }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 헤더 */}
      <header style={{ background: "#fff", borderBottom: "1px solid #f1f3f5", zIndex: 20, flexShrink: 0 }}>
        <div style={{ height: 60, padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src="./logo.png" alt="로고" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
          <button style={{ display: "flex", alignItems: "center", gap: 4, color: "#9e9e9e", fontSize: 16, fontWeight: 600, letterSpacing: "-.4px", background: "none", border: "none" }}>
            할 일
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        </div>
        <div style={{ display: "flex", background: "#fff" }}>
          {["workout", "diet"].map(tab => (
            <button 
              key={tab} 
              onClick={() => setMainTab(tab)}
              style={{ 
                flex: 1, padding: "8px 0", textAlign: "center", fontSize: 16, 
                fontWeight: mainTab === tab ? 600 : 500, 
                color: mainTab === tab ? "#0054d1" : "#9e9e9e", 
                borderBottom: mainTab === tab ? "2px solid #0054d1" : "2px solid transparent", 
                letterSpacing: "-.4px", transition: "all .2s",
                background: "none", borderLeft: "none", borderRight: "none", borderTop: "none"
              }}
            >
              {tab === "workout" ? "쇠질" : "식단"}
            </button>
          ))}
        </div>
      </header>

      {/* 콘텐츠 */}
      <main style={{ flex: 1, overflowY: "auto", paddingBottom: 120 }}>
        {mainTab === "workout"
          ? workoutLogs.length === 0
            ? <div style={{ textAlign: "center", color: "#9e9e9e", fontSize: 14, marginTop: 40 }}>기록된 쇠질이 없습니다.</div>
            : workoutLogs.map((d) => <WorkoutCard key={d.docId} data={d} onCardClick={onCardClick} onDelete={handleDelete} isDeleting={d.docId === deletingId} />)
          : MOCK_DIET.map((d, i) => <DietCard key={i} data={d} />)
        }
      </main>

      {/* FAB 딤 */}
      {fabOpen && <div onClick={() => setFabOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 35 }} />}

      {/* FAB 메뉴 */}
      <div style={{ position: "fixed", bottom: 84, right: 16, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
        <div className={`fab-menu${fabOpen ? " open" : ""}`} style={{ background: "#0054d1", borderRadius: 8, padding: "0 16px" }}>
          <button onClick={() => handleFabOption("workout")} style={{ display: "flex", width: "100%", padding: 8, color: "#fff", fontSize: 14, fontWeight: 600, letterSpacing: "-.35px", whiteSpace: "nowrap", background: "none", border: "none", textAlign: "left" }}>쇠질</button>
          <button onClick={() => handleFabOption("diet")} style={{ display: "flex", width: "100%", padding: 8, color: "#fff", fontSize: 14, fontWeight: 600, letterSpacing: "-.35px", whiteSpace: "nowrap", background: "none", border: "none", textAlign: "left" }}>식단</button>
        </div>
        {!fabOpen && (
          <button onClick={() => setFabOpen(true)} style={{ width: 40, height: 40, background: "#0054d1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,84,209,.4)", border: "none" }}>
            <IcPencil />
          </button>
        )}
      </div>

      {/* 하단 탭 */}
      <nav style={{ position: "fixed", bottom: 0, width: "100%", background: "#fff", borderTop: "1px solid #e9ecef", borderRadius: "16px 16px 0 0", height: 68, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 20, boxShadow: "0 -4px 16px rgba(3,7,19,.06)" }}>
        {[["홈", true], ["분석", false], ["마이", false]].map(([l, a], i) => (
          <button key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1, padding: 8, color: a ? "#0054d1" : "#adb5bd", background: "none", border: "none" }}>
            {i === 0 && <IcHome active={a} />}{i === 1 && <IcGrid />}{i === 2 && <IcUser />}
            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, letterSpacing: "-.3px" }}>{l}</span>
          </button>
        ))}
      </nav>

      {/* 바텀시트 */}
      {sheetOpen && <div onClick={() => setSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 40 }} />}
      <div className={`bottom-sheet${sheetOpen ? " open" : ""}`} style={{ position: "fixed", bottom: 0, left: 0, width: "100%", background: "#fff", borderRadius: "24px 24px 0 0", padding: "24px 16px 32px", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,.08)" }}>
        <div style={{ width: 40, height: 4, background: "#e9ecef", borderRadius: 9999, margin: "0 auto 20px" }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#171a1d", letterSpacing: "-.45px", marginBottom: 16, lineHeight: "28px" }}>🥗 식단 기록</h3>
        <textarea value={inputVal} onChange={e => setInputVal(e.target.value)} style={{ width: "100%", height: 120, background: "#f8f9fa", border: "1.5px solid #e9ecef", borderRadius: 12, padding: "14px 16px", fontSize: 15, fontFamily: "Pretendard,sans-serif", lineHeight: 1.6, color: "#171a1d", outline: "none", resize: "none", marginBottom: 16 }} placeholder="예: 닭가슴살 200g, 현미밥 1공기" />
        <button onClick={handleSave} disabled={saving} style={{ width: "100%", height: 52, background: "#0054d1", color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: "-.4px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,84,209,.3)", border: "none" }}>
          {saving ? "AI 분석 중..." : "AI 자동 기록"}
        </button>
      </div>
    </div>
  );
}

export default HomeScreen;
