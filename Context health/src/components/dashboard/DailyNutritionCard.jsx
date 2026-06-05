import React from 'react';

export default function DailyNutritionCard({ dietLogs, profile }) {
  const targetKcal = Number(profile?.targetKcal || 0);
  if (!targetKcal) return null;

  const todayStr = new Date().toDateString();
  const todayLogs = dietLogs.filter(log => {
    const d = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
    return d && d.toDateString() === todayStr;
  });

  const totals = todayLogs.reduce(
    (acc, log) => ({
      kcal: acc.kcal + Number(log.kcal || 0),
      carb: acc.carb + Number(log.carb || 0),
      protein: acc.protein + Number(log.protein || 0),
      fat: acc.fat + Number(log.fat || 0),
    }),
    { kcal: 0, carb: 0, protein: 0, fat: 0 }
  );

  const pct = Math.min((totals.kcal / targetKcal) * 100, 100);
  const remaining = Math.max(targetKcal - totals.kcal, 0);
  const over = totals.kcal > targetKcal;

  return (
    <div className="mx-4 mt-4 mb-1 bg-white rounded-[20px] border border-ui-2 shadow-[0_0_20px_rgba(3,27,38,0.07)] px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-pretendard font-bold text-body-s text-typo-strong tracking-[-0.35px]">오늘 칼로리</p>
        <p className={`font-pretendard text-caption-l font-semibold tracking-[-0.3px] ${over ? 'text-[#e03e52]' : 'text-[#1a9e5c]'}`}>
          {over
            ? `+${(totals.kcal - targetKcal).toLocaleString()} 초과`
            : `${remaining.toLocaleString()} kcal 남음`}
        </p>
      </div>

      <div className="h-2 w-full bg-ui-2 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-[#e03e52]' : 'bg-[#1a9e5c]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
          {totals.kcal.toLocaleString()} / {targetKcal.toLocaleString()} kcal
        </p>
        <div className="flex gap-3">
          {[
            { label: '탄', value: totals.carb, color: '#3476EE' },
            { label: '단', value: totals.protein, color: '#1a9e5c' },
            { label: '지', value: totals.fat, color: '#f08c00' },
          ].map(({ label, value, color }) => (
            <span key={label} className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
              <span style={{ color }} className="font-semibold">{label} </span>
              {Math.round(value)}g
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
