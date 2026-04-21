import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { IcBack, IcSave, IcMore, IcSpark, QuoteIcon, IcPencil } from '../icons/Icons';
import { AutoTextarea } from '../common/AutoTextarea';
import DonutChart from '../dashboard/DonutChart';

/* ───────────────────────────── 상수 ───────────────────────────── */
const DEFAULT_SECTIONS = [
  { id: 'breakfast',   name: '아침',     placeholder: '아침에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'am_snack',    name: '오전간식', placeholder: '오전 간식에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'lunch',       name: '점심',     placeholder: '점심에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'pm_snack',    name: '오후 간식',placeholder: '오후 간식에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'dinner',      name: '저녁',     placeholder: '저녁에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
  { id: 'night_snack', name: '저녁 간식',placeholder: '저녁 간식에 먹은 식단을 적어주세요\n(예: 고구마 하나 우유 한잔)' },
];

function getChipType(kcal, goal) {
  if (!goal || kcal === 0) return null;
  const r = kcal / goal;
  if (r >= 0.95 && r <= 1.05) return 'success';
  if (r < 0.5)  return 'low';
  if (r > 1.1)  return 'over';
  return 'going';
}

const CHIP = {
  success: { label: '오늘도 성공! 🔥', bg: 'rgba(0,152,178,0.1)', color: '#008dcf' },
  going:   { label: '좀만 더! 🤯',     bg: 'rgba(0,152,178,0.1)', color: '#008dcf' },
  low:     { label: '더 먹어요 🍚',    bg: 'rgba(0,152,178,0.1)', color: '#008dcf' },
  over:    { label: '초과했어요 😅',   bg: 'rgba(255,80,80,0.1)',  color: '#e05a2b' },
};



/* ───────────────────────────── 메인 컴포넌트 ───────────────────────────── */
export default function DietDetailScreen({ onBack, onSave, initialData }) {
  const [sections, setSections]     = useState(DEFAULT_SECTIONS.map(s => ({ ...s, items: [] })));
  const [goalKcal, setGoalKcal]     = useState(2500);
  const [saving, setSaving]         = useState(false);
  const [aiComment, setAiComment]   = useState('');

  // AI 입력 상태
  const [aiInputs, setAiInputs]     = useState({});
  const [analyzingId, setAnalyzingId] = useState(null);

  // 수정 모달 상태
  const [editTarget, setEditTarget] = useState(null); // { secId, itemId }
  const [editForm, setEditForm]     = useState({ name: '', kcal: '', carb: '', protein: '', fat: '' });

  /* initialData 로드 */
  useEffect(() => {
    if (initialData) {
      const merged = DEFAULT_SECTIONS.map(def => {
        const found = (initialData.sections || []).find(s => s.id === def.id);
        return found ? { ...def, items: found.items || [] } : { ...def, items: [] };
      });
      setSections(merged);
      setGoalKcal(initialData.goal || 2500);
      setAiComment(initialData.aiComment || '');
    } else {
      setSections(DEFAULT_SECTIONS.map(s => ({ ...s, items: [] })));
    }
  }, [initialData]);

  /* 합계 */
  const totals = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0;
    sections.forEach(sec =>
      (sec.items || []).forEach(item => {
        kcal    += Number(item.kcal    || 0);
        carb    += Number(item.carb    || 0);
        protein += Number(item.protein || 0);
        fat     += Number(item.fat     || 0);
      })
    );
    return { kcal, carb, protein, fat };
  }, [sections]);

  const chipType = getChipType(totals.kcal, goalKcal);
  const chip     = chipType ? CHIP[chipType] : null;

  /* ─── AI 분석 ─── */
  async function handleAIAnalyze(secId) {
    const text = aiInputs[secId]?.trim();
    if (!text) return;
    setAnalyzingId(secId);
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
    try {
      const prompt = `다음 먹은 음식 메모를 분석해 순수 JSON 배열만 반환해라. 설명 없이 JSON만.
형식: [{"name": "음식명(수량포함)", "kcal": 숫자(정수), "carb": 숫자(그램정수), "protein": 숫자(그램정수), "fat": 숫자(그램정수)}]
모든 수치는 반드시 숫자(number) 타입으로 반환. 문자열 불가.
메모: "${text}"`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
      );
      const json = await res.json();
      if (!json.candidates) throw new Error('AI 응답 없음');

      let raw = json.candidates[0].content.parts[0].text;
      // JSON 블록 추출
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('JSON 파싱 실패');
      const newItems = JSON.parse(match[0]);

      setSections(prev => prev.map(sec =>
        sec.id === secId
          ? {
              ...sec,
              items: [
                ...(sec.items || []),
                ...newItems.map(item => ({
                  id:      Math.random().toString(36).substr(2, 9),
                  name:    String(item.name    || ''),
                  kcal:    Number(item.kcal    || 0),
                  carb:    Number(item.carb    || item.carbohydrate || 0),
                  protein: Number(item.protein || 0),
                  fat:     Number(item.fat     || 0),
                })),
              ],
            }
          : sec
      ));
      setAiInputs(prev => ({ ...prev, [secId]: '' }));
    } catch (e) {
      alert('AI 분석 오류: ' + e.message);
    } finally {
      setAnalyzingId(null);
    }
  }

  /* ─── 항목 삭제 ─── */
  function handleRemoveItem(secId, itemId) {
    setSections(prev => prev.map(sec =>
      sec.id === secId
        ? { ...sec, items: (sec.items || []).filter(i => i.id !== itemId) }
        : sec
    ));
  }

  /* ─── 항목 수정 열기 ─── */
  function handleOpenEdit(secId, item) {
    setEditTarget({ secId, itemId: item.id });
    setEditForm({ name: item.name, kcal: item.kcal, carb: item.carb, protein: item.protein, fat: item.fat });
  }

  /* ─── 항목 수정 저장 ─── */
  function handleSaveEdit() {
    if (!editTarget) return;
    const { secId, itemId } = editTarget;
    setSections(prev => prev.map(sec =>
      sec.id === secId
        ? {
            ...sec,
            items: (sec.items || []).map(item =>
              item.id === itemId
                ? { ...item,
                    name:    editForm.name,
                    kcal:    Number(editForm.kcal    || 0),
                    carb:    Number(editForm.carb    || 0),
                    protein: Number(editForm.protein || 0),
                    fat:     Number(editForm.fat     || 0),
                  }
                : item
            ),
          }
        : sec
    ));
    setEditTarget(null);
  }

  /* ─── 저장 ─── */
  async function handleSaveClick() {
    setSaving(true);
    try {
      const isNew      = !initialData?.docId;
      const totalItems = sections.reduce((acc, sec) => acc + (sec.items || []).length, 0);
      let comment      = aiComment;

      if (totalItems > 0 && (!comment || isNew)) {
        const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
        const prompt = `총 ${totals.kcal}kcal, 탄수화물 ${totals.carb}g, 단백질 ${totals.protein}g, 지방 ${totals.fat}g 섭취. 짧고 동기부여되는 한줄평. 순수 텍스트만.`;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        const json = await res.json();
        comment = json.candidates ? json.candidates[0].content.parts[0].text.trim() : '오늘도 멋지게 식단 완료!';
        setAiComment(comment);
      }

      const docData = { type: 'diet', goal: goalKcal, kcal: totals.kcal,
        carb: totals.carb, protein: totals.protein, fat: totals.fat, sections,
        aiComment: comment || '식단이 기록되었습니다.' };

      if (isNew) {
        await addDoc(collection(db, 'logs'), { ...docData, timestamp: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'logs', initialData.docId), { ...docData, timestamp: serverTimestamp() });
      }
      onSave();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const ds      = initialData?.timestamp ? new Date(initialData.timestamp.seconds * 1000) : new Date();
  const dateStr = `${String(ds.getFullYear()).slice(2)}. ${ds.getMonth() + 1}. ${ds.getDate()}`;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden">

      {/* ── 상단 네비게이션 ── */}
      <header className="flex-none bg-white z-20">
        <div className="flex items-center justify-between h-14 px-4">
          <button onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f1f3f5] active:bg-[#e9ecef] transition-colors">
            <IcBack />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 font-pretendard font-semibold text-[20px] leading-[36px] tracking-[-0.5px] text-[#171a1d] m-0">
            식단 메모
          </h1>
          <div className="flex items-center gap-4">
            <button onClick={handleSaveClick} disabled={saving}
              className="flex items-center justify-center w-6 h-6 hover:opacity-70 transition-opacity disabled:opacity-40">
              <IcSave />
            </button>
            <button className="flex items-center justify-center w-6 h-6 hover:opacity-70 transition-opacity">
              <IcMore size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* ── 스크롤 콘텐츠 ── */}
      <main className="flex-1 overflow-y-auto pb-28">

        {/* ── 요약 카드 (sticky: main 스크롤 컨테이너 기준 top-0) ── */}
        <div className="bg-white px-4 pt-4 pb-0 sticky top-0 z-10">
          {/* 칩 + kcal + 날짜 + 목표 */}
          <div className="flex flex-col gap-2 pb-3 border-b border-[#f1f3f5]">
            {chip && (
              <div className="inline-flex items-center px-2 py-1 rounded-[8px] w-fit"
                   style={{ background: chip.bg }}>
                <span className="font-pretendard font-normal text-[13px] leading-[20px] tracking-[-0.325px] whitespace-nowrap"
                      style={{ color: chip.color }}>
                  {chip.label}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between whitespace-nowrap">
              <p className="font-pretendard font-semibold text-[24px] leading-[32px] tracking-[-0.6px] text-[#171a1d] m-0">
                {totals.kcal.toLocaleString()} kcal
              </p>
              <span className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#646d76]">
                {dateStr}
              </span>
            </div>
            <p className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#495057] m-0">
              목표 {goalKcal.toLocaleString()}
            </p>
          </div>

          {/* 도넛 + 범례 */}
          <div className="flex items-center gap-4 py-4">
            <DonutChart carb={totals.carb} protein={totals.protein} fat={totals.fat} />
            <div className="flex flex-col gap-2 flex-1">
              {[
                { color: '#3385ff', label: '탄수화물', value: totals.carb },
                { color: '#e05a2b', label: '단백질',   value: totals.protein },
                { color: '#e8a126', label: '지방',     value: totals.fat },
              ].map(({ color, label, value }) => (
                <div key={label} className="flex items-center gap-[4px]">
                  <div className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: color }} />
                  <span className="font-pretendard font-medium text-[12px] leading-[18px] tracking-[-0.3px] text-[#868e96] flex-1 whitespace-nowrap">
                    {label}
                  </span>
                  <span className="font-pretendard font-medium text-[12px] leading-[18px] tracking-[-0.3px] text-[#495057] whitespace-nowrap">
                    {value}g
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AI 코멘트 */}
          {aiComment && (
            <div className="border-t border-[#f1f3f5] py-4 flex gap-2 items-start">
              <QuoteIcon gid="diet_quote" />
              <p className="font-pretendard font-medium text-[14px] leading-[20px] tracking-[-0.35px] bg-gradient-to-r from-[#228bed] to-[#c509d6] bg-clip-text text-transparent flex-1 m-0 truncate">
                {aiComment}
              </p>
            </div>
          )}
        </div>

        {/* ── 식단 슬롯 ── */}
        {sections.map(sec => {
          const secKcal = (sec.items || []).reduce((a, i) => a + Number(i.kcal || 0), 0);
          return (
            <div key={sec.id} className="bg-white mt-2 flex flex-col gap-2 p-4">
              {/* 섹션 헤더 */}
              <div className="flex items-center justify-between">
                <h3 className="font-pretendard font-semibold text-[18px] leading-[28px] tracking-[-0.45px] text-[#171a1d] m-0">
                  {sec.name}
                </h3>
                {secKcal > 0 && (
                  <span className="font-pretendard font-medium text-[13px] text-[#646d76] tracking-[-0.35px]">
                    {secKcal.toLocaleString()} kcal
                  </span>
                )}
              </div>

              {/* 기록 항목 */}
              {(sec.items || []).length > 0 && (
                <div className="flex flex-col divide-y divide-[#f1f3f5]">
                  {(sec.items || []).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-pretendard font-semibold text-[14px] text-[#171a1d] tracking-[-0.35px] truncate m-0">
                          {item.name}
                        </p>
                        <p className="font-pretendard text-[11px] text-[#868e96] tracking-[-0.2px] mt-0.5 m-0">
                          탄 {item.carb}g · 단 {item.protein}g · 지 {item.fat}g
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-pretendard font-semibold text-[13px] text-[#0054d1]">
                          {item.kcal} kcal
                        </span>
                        {/* 수정 버튼 */}
                        <button
                          onClick={() => handleOpenEdit(sec.id, item)}
                          className="w-6 h-6 flex items-center justify-center text-[#adb5bd] hover:text-[#495057] transition-colors rounded-full hover:bg-[#f1f3f5]"
                        >
                          <IcPencil size={13} color="#adb5bd" />
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => handleRemoveItem(sec.id, item.id)}
                          className="w-6 h-6 flex items-center justify-center text-[#adb5bd] hover:text-[#e05a2b] transition-colors text-[18px] leading-none"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 입력 폼 */}
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-[#f8f9fa] rounded-[8px] px-3 py-2 min-h-[40px]">
                  <AutoTextarea
                    value={aiInputs[sec.id] || ''}
                    onChange={e => setAiInputs(p => ({ ...p, [sec.id]: e.target.value }))}
                    placeholder={sec.placeholder}
                    className="font-pretendard font-normal text-[14px] leading-[20px] tracking-[-0.35px] text-[#171a1d] w-full bg-transparent border-none outline-none resize-none placeholder:text-[#adb5bd]"
                  />
                </div>
                {/* AI 버튼 (24×24, 흰 배경) */}
                <button
                  onClick={() => handleAIAnalyze(sec.id)}
                  disabled={analyzingId === sec.id || !(aiInputs[sec.id]?.trim())}
                  className="bg-white flex items-center justify-center rounded-[8px] w-6 h-6 shrink-0 p-px disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
                >
                  {analyzingId === sec.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-[#c509d6]/30 border-t-[#228bed] rounded-full animate-spin" />
                  ) : (
                    <IcSpark />
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {/* 저장 오버레이 */}
        {saving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="bg-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[#0054d1]/30 border-t-[#0054d1] rounded-full animate-spin" />
              <span className="font-pretendard text-[14px] font-semibold text-[#171a1d]">저장 중...</span>
            </div>
          </div>
        )}
      </main>

      {/* ═══════════════ 수정 모달 ═══════════════ */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
             onClick={() => setEditTarget(null)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-[24px] px-5 pt-6 pb-10 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            {/* 핸들 */}
            <div className="w-10 h-1 bg-[#dee2e6] rounded-full mx-auto mb-5" />
            <h2 className="font-pretendard font-semibold text-[18px] tracking-[-0.45px] text-[#171a1d] mb-5 m-0">
              항목 수정
            </h2>
            {/* 음식명 */}
            <div className="mb-3">
              <label className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px] mb-1 block">음식명</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#f8f9fa] rounded-[8px] px-3 py-2.5 font-pretendard text-[14px] text-[#171a1d] tracking-[-0.35px] outline-none border border-transparent focus:border-[#0054d1] transition-colors"
              />
            </div>
            {/* 수치 4개 */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { key: 'kcal',    label: 'kcal',  unit: 'kcal' },
                { key: 'carb',    label: '탄수화물', unit: 'g' },
                { key: 'protein', label: '단백질',   unit: 'g' },
                { key: 'fat',     label: '지방',     unit: 'g' },
              ].map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="font-pretendard text-[11px] text-[#868e96] tracking-[-0.2px] mb-1 block">{label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={editForm[key]}
                      onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-[#f8f9fa] rounded-[8px] px-2 py-2 font-pretendard text-[13px] text-[#171a1d] outline-none border border-transparent focus:border-[#0054d1] transition-colors"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-pretendard text-[10px] text-[#adb5bd]">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* 버튼 */}
            <button
              onClick={handleSaveEdit}
              className="w-full bg-[#0054d1] text-white font-pretendard font-semibold text-[16px] tracking-[-0.4px] py-3.5 rounded-[12px] transition-opacity hover:opacity-90 active:opacity-80"
            >
              수정 완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
