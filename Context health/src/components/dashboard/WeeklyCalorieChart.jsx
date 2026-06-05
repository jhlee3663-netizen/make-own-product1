import React from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function WeeklyCalorieChart({ dietLogs, profile }) {
  const targetKcal = Number(profile?.targetKcal || 0);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });

  const calories = days.map(day => {
    const ds = day.toDateString();
    return dietLogs
      .filter(log => {
        const ld = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
        return ld && ld.toDateString() === ds;
      })
      .reduce((sum, log) => sum + Number(log.kcal || 0), 0);
  });

  const activeDays = calories.filter(v => v > 0);
  const weekAvg = activeDays.length > 0
    ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length)
    : 0;
  const maxCal = Math.max(...calories, targetKcal || 1, 1);

  return (
    <div className="mx-4 mt-4 mb-1 bg-white rounded-[20px] border border-ui-2 shadow-[0_0_20px_rgba(3,27,38,0.07)] px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-4">
        <p className="font-pretendard font-bold text-body-s text-typo-strong tracking-[-0.35px]">이번 주 칼로리</p>
        {targetKcal > 0 && (
          <p className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
            목표 <span className="text-[#1a9e5c] font-semibold">{targetKcal.toLocaleString()}</span> kcal
          </p>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-[72px]">
        {days.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          const overTarget = targetKcal > 0 && calories[i] > targetKcal;
          const barH = calories[i] > 0 ? Math.max((calories[i] / maxCal) * 56, 8) : 2;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                <div
                  className={`w-full rounded-t-[4px] transition-all duration-300 ${
                    overTarget ? 'bg-[#e03e52]' : isToday ? 'bg-[#1a9e5c]' : calories[i] > 0 ? 'bg-[#bbf7d0]' : 'bg-ui-2'
                  }`}
                  style={{ height: barH }}
                />
              </div>
              <p className={`font-pretendard text-[10px] leading-none ${isToday ? 'text-[#1a9e5c] font-bold' : 'text-typo-alternative'}`}>
                {DAY_LABELS[day.getDay()]}
              </p>
            </div>
          );
        })}
      </div>
      {targetKcal > 0 && (
        <div className="mt-3 pt-3 border-t border-ui-2 flex items-center justify-between">
          <span className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">이번 주 평균</span>
          <span className={`font-pretendard text-caption-l font-semibold tracking-[-0.3px] ${weekAvg > targetKcal ? 'text-[#e03e52]' : 'text-[#1a9e5c]'}`}>
            {weekAvg > 0 ? `${weekAvg.toLocaleString()} kcal` : '—'}
          </span>
        </div>
      )}
    </div>
  );
}
