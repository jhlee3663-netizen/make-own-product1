import React, { useState, useEffect, useRef } from 'react';
import { IcBack, IcSave, IcMore, IcKeyboard, IcAI, IcUndo, IcRedo, IcSpark, IcPlus, IcHome, IcChat, IcUser } from '../icons/Icons';
import { AutoTextarea } from '../common/AutoTextarea';
import WorkoutTaskItem from '../common/WorkoutTaskItem';
import Button from '../common/Button';
import { db } from '../../lib/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { parseVolume } from '../../utils/utils';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

/* =========================================================
   WorkoutMemoScreen
   ========================================================= */
export default function WorkoutMemoScreen({ onBack, onSave, initialData }) {
  const [sections, setSections] = useState(() => {
    if (initialData && initialData.sections && initialData.sections.length > 0) {
      return initialData.sections.map((s, i) => ({
        id: i + 1,
        part: s.part || "",
        items: (s.items || []).map((it, j) => ({ id: j + 1, title: it.title || "", body: it.body || "" }))
      }));
    }
    return [{
      id: 1, part: "하체", items: [
        { id: 1, title: "스쿼트", body: "60kg  10회  3세트" },
        { id: 2, title: "레그프레스", body: "100kg 12회  3세트" },
      ]
    }];
  });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [bsOpen, setBsOpen] = useState(false);
  const [isBsLoading, setIsBsLoading] = useState(false);
  const [parsedSections, setParsedSections] = useState([]);

  async function handleSummarize() {
    setAiMenuOpen(false);
    setBsOpen(true);
    setIsBsLoading(true);
    try {
      const rawText = sections.map(s => `부위: ${s.part}\n${s.items.map(i => `- 종목: ${i.title}\n  기록: ${i.body}`).join('\n')}`).join('\n\n');
      const prompt = `다음 사용자의 거친 운동 메모 데이터를 보기 좋게 정리해서 JSON 배열로 반환해줘.
응답 형식: [{ "part": "운동부위", "items": [{ "title": "운동종목", "body": "• 세트 1: 20kg 15회\\n• 세트 2: 40kg 20회" }] }]
중요 규칙:
1. 각 세트별 기록은 반드시 '• 세트 N: 무게 횟수' 형태로 작성해줘.
2. 여러 세트인 경우 쉼표(,) 대신 반드시 줄바꿈(\\n)으로 구분해서 작성해줘.
3. [가장 중요] 세트 번호(N)는 종목이 바뀌더라도 절대 1부터 다시 시작하지 말고, 이전 종목의 마지막 세트 번호에 이어서 전체 누적으로 계속 카운트해줘. (예: 앞 종목이 3세트에서 끝났으면 다음 종목은 세트 4부터 시작)
4. JSON 이외의 다른 텍스트(마크다운 등)는 절대 포함하지 마. 원본을 잘 파악해서 깔끔하게 정리해.

사용자 입력:
${rawText}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      if (!json.candidates || !json.candidates[0]) throw new Error("AI 응답 실패");
      const text = json.candidates[0].content.parts[0].text;
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);

      setParsedSections(parsed.map(s => ({
        id: Date.now() + Math.random(),
        part: s.part || "운동 부위",
        items: (s.items || []).map(it => ({ id: Date.now() + Math.random(), title: it.title, body: it.body }))
      })));
    } catch (e) {
      console.error("AI 글 정리 에러:", e);
    } finally {
      setIsBsLoading(false);
    }
  }

  function updatePart(secId, val) {
    setSections(prev => prev.map(s => s.id === secId ? { ...s, part: val } : s));
  }
  function updateItem(secId, itemId, field, val) {
    setSections(prev => prev.map(s =>
      s.id !== secId ? s : {
        ...s,
        items: s.items.map(it => it.id !== itemId ? it : { ...it, [field]: val })
      }
    ));
  }
  function addItem(secId) {
    setSections(prev => prev.map(s =>
      s.id !== secId ? s : { ...s, items: [...s.items, { id: Date.now(), title: "", body: "" }] }
    ));
  }
  function addSection() {
    const id = Date.now();
    setSections(prev => [...prev, { id, part: "", items: [{ id: id + 1, title: "", body: "" }] }]);
  }

  const ST = { fontFamily: "Pretendard,sans-serif", fontSize: 18, fontWeight: 600, color: "#171A1D", letterSpacing: "-0.45px", lineHeight: "28px", background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 };
  const TT = { fontFamily: "Pretendard,sans-serif", fontSize: 16, fontWeight: 600, color: "#495057", letterSpacing: "-0.4px", lineHeight: "24px", background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 };
  const BT = { fontFamily: "Pretendard,sans-serif", fontSize: 14, fontWeight: 500, color: "#646D76", letterSpacing: "-0.35px", lineHeight: "20px", background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 };

  async function handleSave() {
    try {
      const title = sections.map(s => s.part).filter(Boolean).join(", ") || "운동 기록";
      const exercises = sections
        .flatMap(s => s.items.map(it => ({ name: it.title })))
        .filter(ex => ex.name);
      const originalText = sections
        .flatMap(s => s.items.map(it => it.body))
        .filter(Boolean)
        .join("\n");
      const sectionsData = sections.map(s => ({
        part: s.part,
        items: s.items.map(it => ({ title: it.title, body: it.body }))
      }));

      // 1단계: 볼륨 계산 및 이전 기록 "인덱스 없이" 조회
      const totalVolume = parseVolume(sections);
      let lastVolume = 0;
      const currentParts = sections.map(s => s.part).filter(Boolean);

      if (currentParts.length > 0) {
        const q = query(
          collection(db, "logs"),
          orderBy("timestamp", "desc"),
          limit(50)
        );
        const querySnapshot = await getDocs(q);
        
        for (const d of querySnapshot.docs) {
          if (initialData && d.id === initialData.docId) continue;
          const data = d.data();
          if (data.type !== "workout") continue;
          
          const hasMatch = currentParts.some(p => (data.title || "").includes(p));
          if (hasMatch && data.totalVolume) {
            lastVolume = data.totalVolume;
            break;
          }
        }
      }

      let overloadMsg = "";
      if (lastVolume > 0) {
        const diff = totalVolume - lastVolume;
        const pct = ((diff / lastVolume) * 100).toFixed(1);
        overloadMsg = `오늘 볼륨 ${totalVolume.toLocaleString()}kg, 저번보다 ${Math.abs(pct)}% 과부하 ${diff >= 0 ? "성공" : "실패"}!`;
      } else {
        overloadMsg = `오늘 첫 기록 볼륨 ${totalVolume.toLocaleString()}kg 달성!`;
      }

      // 2단계: Firestore에 저장
      let docRef;
      if (initialData && initialData.docId) {
        docRef = doc(db, "logs", initialData.docId);
        await updateDoc(docRef, { title, exercises, originalText, sections: sectionsData, totalVolume });
      } else {
        const res = await addDoc(collection(db, "logs"), {
          type: "workout",
          timestamp: serverTimestamp(),
          title, exercises, originalText, sections: sectionsData, totalVolume
        });
        docRef = res;
      }

      if (onSave) onSave();

      // 3단계: Gemini로 한줄평 생성
      try {
        const workoutSummary = `운동부위: ${title}, 총 볼륨: ${totalVolume}kg, 이전 대비 분석: ${overloadMsg}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
        const prompt = `운동 기록을 분석해서 동기부여가 되는 한줄평을 써줘. 
필수 포함 문구: "${overloadMsg}"
규칙: 
1. 반드시 저 문구가 제일 앞에 나오게 해.
2. 30자 이내로 짧고 강렬하게 한국어로 써.
3. 순수 텍스트만 반환해.
정보: ${workoutSummary}`;
        
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const json = await res.json();
        if (json.candidates && json.candidates[0]) {
          const aiComment = json.candidates[0].content.parts[0].text.trim();
          await updateDoc(docRef, { aiComment });
        }
      } catch (aiErr) {
        console.error("AI 한줄평 실패:", aiErr);
      }
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    }
  }

  return (
    <div className="flex flex-col bg-ui-1 w-full h-full overflow-hidden">

      {/* 상단 네비게이션 */}
      <header className="flex-none bg-white/90 backdrop-blur-[32px] border-b border-ui-3/50">
        <div className="flex items-center justify-between h-9 px-4">
          <span className="font-pretendard text-body-s font-medium text-black/60">9:41</span>
          <svg width="60" height="12" viewBox="0 0 60 12" fill="none" className="mt-2">
            <rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity=".35" />
            <rect x="2" y="2" width="16" height="8" rx="2" fill="black" />
          </svg>
        </div>
        <div className="relative flex items-center justify-between px-4 h-14">
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent">
            <IcBack />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 font-pretendard text-title-s font-semibold text-black tracking-[-0.5px] whitespace-nowrap m-0">
            쇠질 메모
          </h1>
          <div className="flex items-center gap-4">
            <button onClick={handleSave} className="flex items-center justify-center w-8 h-8 rounded-full">
              <IcSave />
            </button>
            <button className="flex items-center justify-center w-8 h-8 rounded-full">
              <IcMore />
            </button>
          </div>
        </div>
      </header>

      {/* 중앙 스크롤 영역 */}
      <main className="flex-1 overflow-y-auto">

        {/* 툴바 */}
        <div className="flex items-center justify-between bg-white px-6 py-3 border-b border-ui-2">
          <div className="flex items-center gap-4">
            <button className="w-6 h-6 flex items-center justify-center"><IcKeyboard /></button>
            <div className="relative">
              <button onClick={() => setAiMenuOpen(!aiMenuOpen)} className="w-6 h-6 flex items-center justify-center">
                <IcAI active={aiMenuOpen} />
              </button>
              {aiMenuOpen && (
                <>
                  <div onClick={() => setAiMenuOpen(false)} className="fixed inset-0 z-[98]" />
                  <div className="absolute top-[calc(100%+12px)] left-0 w-[279px] py-2 bg-gradient-to-br from-[#DFDDFF] via-[#ECEFFB] to-[#EFFBED] border border-ui-4 rounded-[24px] shadow-lg z-[99] flex flex-col text-left origin-top-left animate-[dropdownEnter_0.25s_cubic-bezier(0.16,1,0.3,1)_forwards]">
                    <button onClick={handleSummarize} className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer">
                      <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">글 정리</span>
                      <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">글을 자동으로 정리해줘요</span>
                    </button>
                    <button className="px-4 py-2 flex flex-col gap-1 w-full bg-transparent border-none outline-none text-left font-pretendard cursor-pointer">
                      <span className="text-body-m font-normal text-typo-normal tracking-[-0.4px] leading-lh-xs">피드백</span>
                      <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs">기록에 기반해 자세한 피드백을 알려드려요</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-6 h-6 flex items-center justify-center"><IcUndo /></button>
            <button className="w-6 h-6 flex items-center justify-center"><IcRedo /></button>
          </div>
        </div>

        {/* 섹션 목록 */}
        {sections.map(sec => (
          <div key={sec.id}>

            {/* 운동 부위 헤더 */}
            <div className="flex items-center gap-2 bg-white px-4 pt-8 pb-4 border-b border-ui-2 mt-2 first:mt-0">
              <input
                value={sec.part}
                onChange={e => updatePart(sec.id, e.target.value)}
                placeholder="운동 부위 (예: 하체)"
                className="font-pretendard text-title-s font-bold text-typo-strong tracking-[-0.5px] leading-lh-sm bg-transparent border-none outline-none w-full p-0 placeholder:text-ui-4"
              />
              <button className="flex items-center justify-center w-6 h-6 flex-none text-ui-3 hover:text-brand transition-colors">
                <IcSpark size={20} />
              </button>
            </div>

            {/* 종목 항목들 */}
            {sec.items.map(item => (
              <WorkoutTaskItem
                key={item.id}
                title={item.title}
                body={item.body}
                onTitleChange={(val) => updateItem(sec.id, item.id, "title", val)}
                onBodyChange={(val) => updateItem(sec.id, item.id, "body", val)}
              />
            ))}

            {/* [+] 항목 추가 */}
            <div className="p-2">
              <Button
                variant="secondary"
                size="l"
                fullWidth
                onClick={() => addItem(sec.id)}
              >
                <IcPlus color="#868e96" />
              </Button>
            </div>

          </div>
        ))}

        {/* 새 운동 부위 추가 */}
        <div className="px-4 pt-2 pb-8">
          <Button
            variant="dashed"
            size="l"
            fullWidth
            onClick={addSection}
            className="gap-1.5"
          >
            <IcPlus color="#868e96" size={16} />
            새 운동 부위 추가
          </Button>
        </div>

      </main>

      {/* 하단 탭 (메모 작성시에도 보임) */}
      <nav className="flex-none bg-white border-t border-ui-3 rounded-t-[16px] shadow-[0_-6px_16px_rgba(3,7,19,0.1)]">
        <div className="flex items-center">
          {[["홈", true], ["분석", false], ["마이", false]].map(([l, a], i) => (
            <button key={i} className={`flex flex-col flex-1 items-center gap-0.5 py-2 ${a ? 'text-brand' : 'text-ui-6'}`}>
              {i === 0 && <IcHome active={a} />}{i === 1 && <IcChat />}{i === 2 && <IcUser />}
              <span className="font-pretendard text-caption-l font-medium">{l}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* AI 글 정리 바텀시트 */}
      {bsOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          {/* 백드롭 */}
          <div
            onClick={() => setBsOpen(false)}
            className="absolute inset-0 bg-[#171719]/50 animate-[bsFadeIn_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]"
          />

          {/* 바텀시트 컨텐츠 */}
          <div className="relative bg-ui-2 rounded-t-[24px] px-4 pb-8 flex flex-col items-center animate-[bottomSheetUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)_forwards] shadow-lg max-h-[90vh]">
            {/* 둥근 드래그 핸들 */}
            <div className="py-3 w-full flex justify-center">
              <div className="w-10 h-1 rounded-full bg-ui-3/60" />
            </div>

            <div className="flex items-center justify-between w-full mb-4">
              <div className="flex items-center gap-4">
                <IcSpark />
                <span className="text-body-l font-semibold text-typo-normal tracking-[-0.45px] leading-lh-sm font-pretendard">글 정리</span>
              </div>
              <button onClick={() => setBsOpen(false)} className="flex items-center justify-center w-6 h-6 bg-transparent border-none outline-none cursor-pointer">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="var(--typo-normal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* 그라디언트 카드 부분 */}
            <div className={`w-full rounded-2xl p-4 flex flex-col gap-6 bg-gradient-to-br from-[#EDECFF] via-[#ECEFFB] to-[#EFFBED] bg-[length:200%_200%] ${isBsLoading ? 'animate-[bsGradientMove_2.5s_ease_infinite]' : ''}`}>
              {isBsLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[250px] gap-4">
                  <div className="w-10 h-10 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" />
                  <span className="text-[15px] font-medium text-typo-secondary font-pretendard">AI가 메모를 예쁘게 정리하고 있어요...</span>
                </div>
              ) : parsedSections.length === 0 ? (
                <div className="min-h-[250px] flex items-center justify-center">
                  <span className="text-ui-6">로딩 결과가 없습니다.</span>
                </div>
              ) : (
                parsedSections.map((sSec, sIndex) => (
                  <React.Fragment key={sSec.id}>
                    {/* Title, Date */}
                    <div className="flex items-center justify-between w-full">
                      <span className="text-title-s font-semibold text-typo-strong tracking-[-0.5px] leading-[36px] font-pretendard">{sSec.part}</span>
                      {sIndex === 0 && <span className="text-body-s font-normal text-typo-secondary tracking-[-0.35px] leading-lh-2xs font-pretendard">{new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '')}</span>}
                    </div>

                    {/* Contents area */}
                    <div className="relative w-full -mt-2">
                      <div className="text-body-s font-pretendard text-typo-normal tracking-[-0.35px] leading-lh-2xs white-space-pre-wrap pr-4">
                        {sSec.items.map((sIt, iIndex) => (
                          <React.Fragment key={sIt.id}>
                            <span className="font-semibold">{sIt.title}</span><br /><br />
                            {sIt.body}
                            {iIndex < sSec.items.length - 1 && <><br /><br /></>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                ))
              )}

              {!isBsLoading && parsedSections.length > 0 && (
                <div className="flex justify-end mt-0">
                  <button onClick={() => {
                    setSections(parsedSections);
                    setBsOpen(false);
                  }} className="background-transparent border-none outline-none cursor-pointer text-body-s font-medium text-brand font-pretendard tracking-[-0.35px]">
                    붙여넣기
                  </button>
                </div>
              )}
            </div>

            {/* Pagination dots below card */}
            <div className="flex items-center gap-2 mt-4">
              <div className="w-1.5 h-1.5 rounded-full bg-typo-normal" />
              <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
              <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
              <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
              <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
              <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
