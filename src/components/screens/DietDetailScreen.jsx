import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { IcBack, IcSave, IcSpark, IcMore } from '../icons/Icons';
import Button from '../common/Button';
import { AutoTextarea } from '../common/AutoTextarea';
import DonutChart from '../dashboard/DonutChart';

const DEFAULT_SECTIONS = [
  { id: "breakfast", name: "아침", items: [] },
  { id: "am_snack", name: "오전 간식", items: [] },
  { id: "lunch", name: "점심", items: [] },
  { id: "pm_snack", name: "오후 간식", items: [] },
  { id: "dinner", name: "저녁", items: [] }
];

export default function DietDetailScreen({ onBack, onSave, initialData }) {
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [goalKcal, setGoalKcal] = useState(2500);
  const [saving, setSaving] = useState(false);
  
  // AI 입력 상태
  const [aiInputs, setAiInputs] = useState({});
  const [analyzingId, setAnalyzingId] = useState(null);

  useEffect(() => {
    if (initialData) {
      setSections(initialData.sections || DEFAULT_SECTIONS);
      setGoalKcal(initialData.goal || 2500);
    } else {
      setSections(DEFAULT_SECTIONS);
    }
  }, [initialData]);

  // 계산
  const totals = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0;
    sections.forEach(sec => {
      sec.items.forEach(item => {
        kcal += Number(item.kcal || 0);
        carb += Number(item.carb || 0);
        protein += Number(item.protein || 0);
        fat += Number(item.fat || 0);
      });
    });
    return { kcal, carb, protein, fat };
  }, [sections]);

  async function handleAIAnalyze(secId) {
    const text = aiInputs[secId]?.trim();
    if (!text) return;
    
    setAnalyzingId(secId);
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const prompt = `다음 먹은 음식 메모를 분석해 순수 JSON 배열만 반환해라. 
      형식: [{"name": "음식명(수량포함)", "kcal": 숫자, "carb": 숫자(g), "protein": 숫자(g), "fat": 숫자(g)}]
      메모: "${text}"`;
      
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      const json = await res.json();
      if (!json.candidates) throw new Error("AI 응답 실패");
      
      let txt = json.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();
      const newItems = JSON.parse(txt);
      
      setSections(prev => prev.map(sec => {
        if (sec.id === secId) {
          return {
            ...sec,
            items: [...sec.items, ...newItems.map(item => ({ ...item, id: Math.random().toString(36).substr(2, 9) }))]
          };
        }
        return sec;
      }));
      
      setAiInputs(prev => ({ ...prev, [secId]: "" }));
    } catch (e) {
      alert("AI 퍼싱 에러: " + e.message);
    } finally {
      setAnalyzingId(null);
    }
  }

  function handleRemoveItem(secId, itemId) {
    setSections(prev => prev.map(sec => {
      if (sec.id === secId) {
        return { ...sec, items: sec.items.filter(i => i.id !== itemId) };
      }
      return sec;
    }));
  }

  async function handleSaveClick() {
    setSaving(true);
    try {
      const isNew = !initialData?.docId;
      const totalItems = sections.reduce((acc, sec) => acc + sec.items.length, 0);
      
      let aiComment = initialData?.aiComment || "";
      
      // 항목이 있는데 코멘트가 없거나 새 글이면 간단히 한줄평 생성
      if (totalItems > 0 && (!aiComment || isNew)) {
        const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
        const prompt = `총 ${totals.kcal}kcal, 탄수화물 ${totals.carb}g, 단백질 ${totals.protein}g, 지방 ${totals.fat}g을 섭취했습니다. 이거에 대해 짧고 동기부여되는 다이어트 칭찬 한줄평을 써주세요. 순수 텍스트만.`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        const json = await res.json();
        if (json.candidates) {
          aiComment = json.candidates[0].content.parts[0].text.trim();
        } else {
          aiComment = "오늘 하루도 멋지게 식단 완료!";
        }
      }

      const docData = {
        type: "diet",
        goal: goalKcal,
        kcal: totals.kcal,
        carb: totals.carb,
        protein: totals.protein,
        fat: totals.fat,
        sections,
        aiComment: aiComment || "식단이 기록되었습니다."
      };

      if (isNew) {
        await addDoc(collection(db, "logs"), { ...docData, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "logs", initialData.docId), { ...docData, timestamp: serverTimestamp() });
      }
      onSave(); // 모달 닫고 토스트
    } catch (e) {
      alert("저장 실패: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const ds = initialData?.timestamp ? new Date(initialData.timestamp.seconds * 1000) : new Date();
  const dateStr = `${String(ds.getFullYear()).slice(2)}. ${ds.getMonth() + 1}. ${ds.getDate()}`;

  return (
    <div className="flex flex-col h-full bg-ui-1 overflow-hidden relative">
      {/* 상단 네비게이션 */}
      <header className="flex-none bg-white/90 backdrop-blur-[32px] border-b border-ui-3/50 sticky top-0 z-20">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-ui-2 active:bg-ui-3">
            <IcBack />
          </button>
          
          <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-title-m font-bold text-typo-strong tracking-[-0.5px] m-0 font-pretendard">
            식단 기록
          </h1>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveClick} 
              disabled={saving}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-ui-2 active:bg-ui-3"
            >
              <IcSave />
            </button>
            <button className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-ui-2 active:bg-ui-3">
              <IcMore />
            </button>
          </div>
        </div>
      </header>

      {/* 스크롤 콘텐츠 */}
      <main className="flex-1 overflow-y-auto pb-[120px]">
        {/* Sticky 요약 카드 */}
        <div className="bg-white px-6 py-6 mb-2 border-b border-ui-2 sticky top-0 z-10 shadow-sm">
           <div className="flex flex-col gap-2 pb-4 border-b border-[#f1f3f5]">
            <div className="inline-flex bg-[#0054d1]/10 px-2 py-1 rounded-[8px] w-fit">
              <span className="text-[13px] text-[#0054d1] font-pretendard tracking-[-0.325px] whitespace-nowrap">오늘의 식단</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[24px] font-semibold text-[#171a1d] leading-[32px] tracking-[-0.6px] m-0 font-pretendard">
                {totals.kcal.toLocaleString()} kcal
              </p>
              <span className="text-[14px] text-[#646d76] tracking-[-0.35px] font-pretendard m-0">{dateStr}</span>
            </div>
            <p className="text-[14px] text-[#868e96] tracking-[-0.35px] m-0 font-pretendard">목표 {goalKcal.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <DonutChart carb={totals.carb} protein={totals.protein} fat={totals.fat} />
            <div className="flex flex-col gap-2">
              {[
                { c: "#3385ff", l: "탄수화물", v: totals.carb },
                { c: "#e05a2b", l: "단백질", v: totals.protein },
                { c: "#e8a126", l: "지방", v: totals.fat }
              ].map((item) => (
                <div key={item.l} className="flex gap-1.5 items-center">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.c }} />
                  <span className="text-[12px] font-medium text-[#adb5bd] whitespace-nowrap font-pretendard tracking-[-0.3px]">{item.l}</span>
                  <span className="text-[12px] font-semibold text-typo-strong whitespace-nowrap font-pretendard ml-auto">{item.v}g</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 식단 슬롯들 */}
        {sections.map(sec => (
          <div key={sec.id} className="bg-white border-b border-ui-2 mb-2">
            <div className="px-5 pt-6 pb-2">
              <h3 className="text-title-s font-bold text-typo-strong tracking-[-0.5px]">{sec.name}</h3>
            </div>
            
            {/* 항목 리스트 */}
            {sec.items.length > 0 && (
              <div className="px-5 pb-2 flex flex-col gap-3">
                {sec.items.map(item => (
                  <div key={item.id} className="flex flex-col border border-ui-2 rounded-xl p-3 bg-ui-1/30 relative group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-body-m font-semibold text-typo-normal">{item.name}</span>
                      <span className="text-body-s font-medium text-brand">{item.kcal} kcal</span>
                    </div>
                    <div className="flex gap-3 text-[12px] font-medium text-typo-secondary">
                      <span>탄 {item.carb}g</span>
                      <span>단 {item.protein}g</span>
                      <span>지 {item.fat}g</span>
                    </div>
                    {/* 삭제 버튼 */}
                    <button 
                      onClick={() => handleRemoveItem(sec.id, item.id)}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-white rounded-full border border-ui-3 opacity-0 group-hover:opacity-100 transition-opacity text-typo-alternative text-[16px] leading-none"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 입력 폼 */}
            <div className="px-5 pb-6 pt-2 flex items-end gap-2">
              <div className="flex-1">
                <AutoTextarea 
                  value={aiInputs[sec.id] || ""}
                  onChange={(e) => setAiInputs(p => ({ ...p, [sec.id]: e.target.value }))}
                  placeholder={`${sec.name}에 먹은 식단을 적어주세요\n(예: 고구마 하나랑 우유 한잔)`}
                  className="font-pretendard text-body-s font-medium text-typo-strong tracking-[-0.35px] leading-lh-2xs bg-ui-1 rounded-xl w-full px-4 py-3 placeholder:text-ui-4 border border-transparent focus:border-ui-3 transition-colors outline-none"
                />
              </div>
              <button 
                onClick={() => handleAIAnalyze(sec.id)}
                disabled={analyzingId === sec.id || !(aiInputs[sec.id]?.trim())}
                className="w-10 h-10 flex-none bg-brand text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-ui-3 transition-colors cursor-pointer"
              >
                {analyzingId === sec.id ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <IcSpark size={20} />
                )}
              </button>
            </div>
          </div>
        ))}

        {saving && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
             <div className="bg-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
               <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
               <span className="font-pretendard text-body-m font-semibold text-typo-strong">식단 저장 중...</span>
             </div>
           </div>
        )}
      </main>
    </div>
  );
}
