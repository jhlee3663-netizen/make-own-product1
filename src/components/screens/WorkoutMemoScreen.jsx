import React, { useState, useEffect, useRef } from 'react';
import { IcBack, IcSave, IcMore, IcKeyboard, IcAI, IcUndo, IcRedo, IcSpark, IcPlus, IcHome, IcGrid, IcUser } from '../icons/Icons';
import { AutoTextarea } from '../common/AutoTextarea';
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
    <div style={{ display: "flex", flexDirection: "column", background: "#f8f9fa", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* 상단 네비게이션 */}
      <header style={{ flexShrink: 0, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(32px)", borderBottom: "1px solid rgba(112,115,124,0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, padding: "0 16px" }}>
          <span style={{ fontFamily: "Pretendard,sans-serif", fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,.6)" }}>9:41</span>
          <svg width="60" height="12" viewBox="0 0 60 12" fill="none" style={{ marginTop: 8 }}>
            <rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity=".35" />
            <rect x="2" y="2" width="16" height="8" rx="2" fill="black" />
          </svg>
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 56 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "transparent" }}>
            <IcBack />
          </button>
          <h1 style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontFamily: "Pretendard,sans-serif", fontSize: 20, fontWeight: 600, color: "#000", letterSpacing: "-0.5px", whiteSpace: "nowrap", margin: 0 }}>
            쇠질 메모
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={handleSave} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%" }}>
              <IcSave />
            </button>
            <button style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%" }}>
              <IcMore />
            </button>
          </div>
        </div>
      </header>

      {/* 중앙 스크롤 영역 */}
      <main style={{ flex: 1, overflowY: "auto" }}>

        {/* 툴바 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", padding: "12px 24px", borderBottom: "1px solid #f1f3f5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}><IcKeyboard /></button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setAiMenuOpen(!aiMenuOpen)} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IcAI active={aiMenuOpen} />
              </button>
              {aiMenuOpen && (
                <>
                  <div onClick={() => setAiMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 12px)",
                    left: 0,
                    width: 279,
                    padding: "8px 0",
                    background: "linear-gradient(115.236deg, #DFDDFF 1.69%, #E6DBFD 30.89%, #ECEFFB 64.68%, #EFFBED 100%)",
                    border: "1px solid #dee2e6",
                    borderRadius: 24,
                    boxShadow: "0px 0px 8px 0px rgba(141,192,255,0.5), 0px 0px 32px 0px rgba(215,231,255,0.5)",
                    zIndex: 99,
                    display: "flex",
                    flexDirection: "column",
                    textAlign: "left",
                    transformOrigin: "top left",
                    animation: "dropdownEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  }}>
                    <button onClick={handleSummarize} style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 4, width: "100%", background: "transparent", border: "none", outline: "none", textAlign: "left", fontFamily: "Pretendard,sans-serif", cursor: "pointer" }}>
                      <span style={{ fontSize: 16, fontWeight: 400, color: "#495057", letterSpacing: "-0.4px", lineHeight: "24px" }}>글 정리</span>
                      <span style={{ fontSize: 14, fontWeight: 400, color: "#646d76", letterSpacing: "-0.35px", lineHeight: "20px" }}>글을 자동으로 정리해줘요</span>
                    </button>
                    <button style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 4, width: "100%", background: "transparent", border: "none", outline: "none", textAlign: "left", fontFamily: "Pretendard,sans-serif", cursor: "pointer" }}>
                      <span style={{ fontSize: 16, fontWeight: 400, color: "#495057", letterSpacing: "-0.4px", lineHeight: "24px" }}>피드백</span>
                      <span style={{ fontSize: 14, fontWeight: 400, color: "#646d76", letterSpacing: "-0.35px", lineHeight: "20px" }}>기록에 기반해 자세한 피드백을 알려드려요</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}><IcUndo /></button>
            <button style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}><IcRedo /></button>
          </div>
        </div>

        {/* 섹션 목록 */}
        {sections.map(sec => (
          <div key={sec.id}>

            {/* 운동 부위 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "32px 16px 16px", borderBottom: "1px solid #f1f3f5" }}>
              <input
                value={sec.part}
                onChange={e => updatePart(sec.id, e.target.value)}
                placeholder="운동 부위 (예: 하체)"
                style={ST}
              />
              <button style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, flexShrink: 0 }}>
                <IcSpark />
              </button>
            </div>

            {/* 종목 항목들 */}
            {sec.items.map(item => (
              <div key={item.id} style={{ background: "#fff", marginBottom: 1 }}>
                {/* 종목명 */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "16px 16px 4px" }}>
                  <input
                    value={item.title}
                    onChange={e => updateItem(sec.id, item.id, "title", e.target.value)}
                    placeholder="오늘의 운동 종목을 적어주세요"
                    style={{ ...TT, flex: 1 }}
                  />
                  <button style={{ width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IcSpark />
                  </button>
                </div>
                {/* 운동 기록 */}
                <div style={{ padding: "4px 16px 16px" }}>
                  <AutoTextarea
                    value={item.body}
                    onChange={e => updateItem(sec.id, item.id, "body", e.target.value)}
                    placeholder="운동의 무게와 세트수 등 편하게 적어주세요"
                    style={{ ...BT }}
                  />
                </div>
              </div>
            ))}

            {/* [+] 항목 추가 */}
            <div style={{ padding: "8px" }}>
              <button
                onClick={() => addItem(sec.id)}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", background: "#f1f3f5", borderRadius: 12, padding: "8px 0" }}
              >
                <IcPlus color="#868e96" />
              </button>
            </div>

          </div>
        ))}

        {/* 새 운동 부위 추가 */}
        <div style={{ padding: "8px 16px 32px" }}>
          <button
            onClick={addSection}
            style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: "1.5px dashed #dee2e6", borderRadius: 12, padding: "12px 0", color: "#868e96", fontSize: 14, fontWeight: 500, fontFamily: "Pretendard,sans-serif" }}
          >
            <IcPlus color="#868e96" size={16} />
            새 운동 부위 추가
          </button>
        </div>

      </main>

      {/* 하단 탭 (메모 작성시에도 보임) */}
      <nav style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #e9ecef", borderRadius: "16px 16px 0 0", boxShadow: "0 -6px 16px rgba(3,7,19,.10)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {[["홈", true], ["분석", false], ["마이", false]].map(([l, a], i) => (
            <button key={i} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", gap: 2, padding: "8px 0", color: a ? "#0054d1" : "#adb5bd" }}>
              {i === 0 && <IcHome active={a} />}{i === 1 && <IcGrid />}{i === 2 && <IcUser />}
              <span style={{ fontFamily: "Pretendard,sans-serif", fontSize: 12, fontWeight: 500 }}>{l}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* AI 글 정리 바텀시트 */}
      {bsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          {/* 백드롭 */}
          <div
            onClick={() => setBsOpen(false)}
            style={{
              position: "absolute", inset: 0, background: "rgba(23, 23, 25, 0.52)",
              animation: "bsFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}
          />

          {/* 바텀시트 컨텐츠 */}
          <div style={{
            position: "relative",
            background: "#f1f3f5",
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: "0 16px 32px 16px",
            display: "flex", flexDirection: "column", alignItems: "center",
            animation: "bottomSheetUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
            boxShadow: "0px -4px 16px rgba(0,0,0,0.1)",
            maxHeight: "90vh"
          }}>
            {/* 둥근 드래그 핸들 */}
            <div style={{ padding: "12px 0", width: "100%", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 40, height: 5, borderRadius: 1000, background: "rgba(112, 115, 124, 0.16)" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <IcSpark />
                <span style={{ fontSize: 18, fontWeight: 600, color: "#495057", letterSpacing: "-0.45px", lineHeight: "28px", fontFamily: "Pretendard, sans-serif" }}>글 정리</span>
              </div>
              <button onClick={() => setBsOpen(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, background: "transparent", border: "none", outline: "none", cursor: "pointer" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#495057" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* 그라디언트 카드 부분 */}
            <div style={{
              width: "100%",
              borderRadius: 16,
              padding: 16,
              display: "flex", flexDirection: "column", gap: 24,
              backgroundImage: "linear-gradient(105.71deg, rgb(237, 236, 255) 0%, rgb(230, 219, 253) 30%, rgb(236, 239, 251) 60%, rgb(239, 251, 237) 100%)",
              backgroundSize: "200% 200%",
              animation: isBsLoading ? "bsGradientMove 2.5s ease infinite" : "none"
            }}>
              {isBsLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 250, gap: 16 }}>
                  <div style={{ width: 40, height: 40, border: "3px solid rgba(132, 94, 240, 0.2)", borderTopColor: "#845ef0", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#646d76", fontFamily: "Pretendard, sans-serif" }}>AI가 메모를 예쁘게 정리하고 있어요...</span>
                  <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
              ) : parsedSections.length === 0 ? (
                <div style={{ minHeight: 250, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#adb5bd" }}>로딩 결과가 없습니다.</span>
                </div>
              ) : (
                parsedSections.map((sSec, sIndex) => (
                  <React.Fragment key={sSec.id}>
                    {/* Title, Date */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                      <span style={{ fontSize: 20, fontWeight: 600, color: "#171A1D", letterSpacing: "-0.5px", lineHeight: "36px", fontFamily: "Pretendard, sans-serif" }}>{sSec.part}</span>
                      {sIndex === 0 && <span style={{ fontSize: 14, fontWeight: 400, color: "#646d76", letterSpacing: "-0.35px", lineHeight: "20px", fontFamily: "Pretendard, sans-serif" }}>{new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\.$/, '')}</span>}
                    </div>

                    {/* Contents area */}
                    <div style={{ position: "relative", width: "100%", marginTop: -8 }}>
                      <div style={{
                        fontSize: 14, fontFamily: "Pretendard, sans-serif", color: "#495057", letterSpacing: "-0.35px", lineHeight: "20px",
                        whiteSpace: "pre-wrap", paddingRight: 16
                      }}>
                        {sSec.items.map((sIt, iIndex) => (
                          <React.Fragment key={sIt.id}>
                            <span style={{ fontWeight: 600 }}>{sIt.title}</span><br /><br />
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
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: parsedSections.length > 0 ? 0 : 24 }}>
                  <button onClick={() => {
                    setSections(parsedSections);
                    setBsOpen(false);
                  }} style={{ background: "transparent", border: "none", outline: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#06f", fontFamily: "Pretendard, sans-serif", letterSpacing: "-0.35px" }}>
                    붙여넣기
                  </button>
                </div>
              )}
            </div>

            {/* Pagination dots below card */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#495057" }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dee2e6" }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dee2e6" }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dee2e6" }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dee2e6" }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#dee2e6" }} />
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
