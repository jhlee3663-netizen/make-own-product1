import React, { useCallback, useEffect, useMemo, useState } from 'react';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;

function getWeekRange(weeksAgo = 0) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function inRange(ts, { start, end }) {
  if (!ts?.seconds) return false;
  const d = new Date(ts.seconds * 1000);
  return d >= start && d <= end;
}

async function generateStatusComment({ parts, volumeThis, volumeLast, avgKcal, targetKcal, carbPct, proteinPct, fatPct }) {
  if (!GEMINI_KEY) return null;
  const volumeText = volumeLast > 0
    ? `볼륨: 이번주 ${volumeThis.toLocaleString()}kg, 저번주 ${volumeLast.toLocaleString()}kg`
    : `볼륨: 이번주 ${volumeThis.toLocaleString()}kg (저번주 기록 없음)`;
  const dietText = avgKcal > 0
    ? `평균 일일 섭취 ${Math.round(avgKcal)}kcal${targetKcal ? ` / 목표 ${targetKcal}kcal` : ''}, 탄단지 비율 ${carbPct}:${proteinPct}:${fatPct}`
    : '식단 기록 없음';

  const prompt = `다음은 이번 주 사용자의 헬스 데이터야.
운동 부위: ${parts.length > 0 ? parts.join(', ') : '없음'}
${volumeText}
식단: ${dietText}

이 데이터를 바탕으로 이번 주 몸 상태를 친근하게 한두 문장으로 평가해줘.
- 운동과 식단 균형을 함께 평가해줘
- 잘한 점은 칭찬하고, 부족한 점은 격려해줘
- 이모지 1개 포함
- 수치를 직접 언급하지 말고 느낌으로 표현해
- 반드시 한국어로`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

export default function StatusSheet({ onClose, workoutLogs, dietLogs, profile }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  const thisWeek = useMemo(() => getWeekRange(0), []);
  const lastWeek = useMemo(() => getWeekRange(1), []);

  const thisWorkouts = useMemo(() => workoutLogs.filter(l => inRange(l.timestamp, thisWeek)), [workoutLogs, thisWeek]);
  const lastWorkouts = useMemo(() => workoutLogs.filter(l => inRange(l.timestamp, lastWeek)), [workoutLogs, lastWeek]);
  const thisDiets = useMemo(() => dietLogs.filter(l => inRange(l.timestamp, thisWeek)), [dietLogs, thisWeek]);

  const parts = useMemo(() => {
    const set = new Set();
    thisWorkouts.forEach(l => (l.sections || []).forEach(s => { if (s.part) set.add(s.part); }));
    return [...set];
  }, [thisWorkouts]);

  const volumeThis = useMemo(() =>
    thisWorkouts.reduce((sum, l) => sum + (l.totalVolume || 0), 0), [thisWorkouts]);
  const volumeLast = useMemo(() =>
    lastWorkouts.reduce((sum, l) => sum + (l.totalVolume || 0), 0), [lastWorkouts]);
  const volumeDelta = volumeLast > 0 ? Math.round((volumeThis - volumeLast) / volumeLast * 100) : null;

  const daysElapsed = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  }, []);

  const weeklyNutrition = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0;
    thisDiets.forEach(l => (l.sections || []).forEach(s => (s.items || []).forEach(item => {
      kcal += Number(item.kcal || 0);
      carb += Number(item.carb || 0);
      protein += Number(item.protein || 0);
      fat += Number(item.fat || 0);
    })));
    return { kcal, carb, protein, fat };
  }, [thisDiets]);

  const avgKcal = weeklyNutrition.kcal / daysElapsed;
  const targetKcal = profile?.targetKcal ? Number(profile.targetKcal) : null;
  const kcalRatio = targetKcal ? avgKcal / targetKcal : null;

  const macros = useMemo(() => {
    const carbKcal = weeklyNutrition.carb * 4;
    const proteinKcal = weeklyNutrition.protein * 4;
    const fatKcal = weeklyNutrition.fat * 9;
    const total = carbKcal + proteinKcal + fatKcal;
    if (total <= 0) return null;
    return {
      carb: Math.round(carbKcal / total * 100),
      protein: Math.round(proteinKcal / total * 100),
      fat: Math.round(fatKcal / total * 100),
    };
  }, [weeklyNutrition]);

  const [comment, setComment] = useState(null);
  const [loadingComment, setLoadingComment] = useState(true);

  useEffect(() => {
    generateStatusComment({
      parts, volumeThis, volumeLast, avgKcal, targetKcal,
      carbPct: macros?.carb ?? 0,
      proteinPct: macros?.protein ?? 0,
      fatPct: macros?.fat ?? 0,
    }).then(c => { setComment(c); setLoadingComment(false); });
  }, []);

  const kcalColor = kcalRatio == null ? '#868e96'
    : kcalRatio >= 0.9 && kcalRatio <= 1.1 ? '#1a9e5c'
    : kcalRatio >= 0.75 ? '#f07800'
    : '#e03e52';

  return (
    <>
      <div
        className="fixed inset-0 z-[50] bg-black/40"
        style={{
          animation: isClosing
            ? 'bsFadeIn 0.3s ease forwards reverse'
            : 'bsFadeIn 0.3s ease forwards',
        }}
        onClick={handleClose}
      />
      <div
        className="fixed top-0 left-0 right-0 z-[51] bg-white rounded-b-[24px] shadow-[0_14px_40px_rgba(0,0,0,0.16)]"
        style={{
          maxHeight: '88dvh',
          overflowY: isClosing ? 'hidden' : 'auto',
          paddingTop: 'env(safe-area-inset-top)',
          willChange: 'transform',
          animation: isClosing
            ? 'topSheetUp 0.32s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'topSheetDown 0.3s cubic-bezier(.2,.8,.2,1) forwards',
        }}
      >
        <div className="px-5 pt-5 pb-5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="font-pretendard font-bold text-[17px] text-typo-normal tracking-[-0.4px]">내 상태</h2>
            <span className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">이번 주</span>
          </div>

          {/* AI 코멘트 */}
          <div className="rounded-2xl bg-ui-1 px-4 py-3.5">
            {loadingComment ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-brand/20 border-t-brand rounded-full animate-spin flex-none" />
                <span className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">분석 중...</span>
              </div>
            ) : comment ? (
              <p className="font-pretendard text-[14px] text-typo-normal tracking-[-0.35px] leading-relaxed">{comment}</p>
            ) : (
              <p className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">이번 주 기록이 쌓이면 분석해드릴게요</p>
            )}
          </div>

          {/* 운동 */}
          <div className="flex flex-col gap-3">
            <h3 className="font-pretendard font-semibold text-[14px] text-typo-normal tracking-[-0.35px]">이번 주 운동</h3>
            {parts.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {parts.map(p => (
                    <span key={p} className="px-3 py-1 rounded-full bg-brand/10 text-brand text-[12px] font-medium font-pretendard tracking-[-0.3px]">
                      {p}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-pretendard text-[13px] text-typo-secondary tracking-[-0.3px]">
                    총 볼륨 {volumeThis.toLocaleString()}kg
                  </span>
                  {volumeDelta !== null && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium font-pretendard tracking-[-0.275px] ${
                      volumeDelta >= 0 ? 'bg-[rgba(0,150,50,0.1)] text-[#009632]' : 'bg-[#ffeef0] text-[#e03e52]'
                    }`}>
                      저번주 대비 {volumeDelta >= 0 ? '+' : ''}{volumeDelta}%
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">이번 주 운동 기록이 없어요</p>
            )}
          </div>

          {/* 식단 */}
          <div className="flex flex-col gap-3">
            <h3 className="font-pretendard font-semibold text-[14px] text-typo-normal tracking-[-0.35px]">이번 주 식단</h3>
            {weeklyNutrition.kcal > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-pretendard text-[13px] text-typo-secondary tracking-[-0.3px]">
                    하루 평균&nbsp;
                    <span className="font-semibold" style={{ color: kcalColor }}>
                      {Math.round(avgKcal).toLocaleString()}kcal
                    </span>
                    {targetKcal && (
                      <span className="text-typo-alternative"> / 목표 {targetKcal.toLocaleString()}kcal</span>
                    )}
                  </span>
                  {kcalRatio != null && (
                    <span className="font-pretendard text-[11px] font-semibold tracking-[-0.275px]" style={{ color: kcalColor }}>
                      {Math.round(kcalRatio * 100)}%
                    </span>
                  )}
                </div>
                {targetKcal && (
                  <div className="w-full h-2 rounded-full bg-ui-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round((kcalRatio ?? 0) * 100))}%`, background: kcalColor }}
                    />
                  </div>
                )}
                {macros && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-pretendard text-[12px] text-typo-alternative tracking-[-0.3px]">탄단지</span>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-full bg-[rgba(255,180,0,0.12)] text-[11px] font-medium font-pretendard text-[#c48a00] tracking-[-0.25px]">탄 {macros.carb}%</span>
                      <span className="px-2 py-0.5 rounded-full bg-[rgba(0,150,50,0.1)] text-[11px] font-medium font-pretendard text-[#009632] tracking-[-0.25px]">단 {macros.protein}%</span>
                      <span className="px-2 py-0.5 rounded-full bg-[rgba(230,80,0,0.1)] text-[11px] font-medium font-pretendard text-[#e65000] tracking-[-0.25px]">지 {macros.fat}%</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="font-pretendard text-[13px] text-typo-alternative tracking-[-0.3px]">이번 주 식단 기록이 없어요</p>
            )}
          </div>
        </div>

        <div className="flex justify-center pt-2 pb-3">
          <div className="w-9 h-1 rounded-full bg-ui-3" />
        </div>
      </div>
    </>
  );
}
