import React from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function WeeklyVolumeChart({ workoutLogs }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });

  const volumes = days.map(day => {
    const ds = day.toDateString();
    return workoutLogs
      .filter(log => {
        const ld = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
        return ld && ld.toDateString() === ds;
      })
      .reduce((sum, log) => sum + (log.totalVolume || 0), 0);
  });

  const weekTotal = volumes.reduce((a, b) => a + b, 0);
  const maxVol = Math.max(...volumes, 1);

  return (
    <div className="mx-4 mt-4 mb-1 bg-white rounded-[20px] border border-ui-2 shadow-[0_0_20px_rgba(3,27,38,0.07)] px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-4">
        <p className="font-pretendard font-bold text-body-s text-typo-strong tracking-[-0.35px]">이번 주 볼륨</p>
        <p className="font-pretendard text-caption-l text-brand font-semibold tracking-[-0.3px]">
          총 {weekTotal.toLocaleString()}kg
        </p>
      </div>
      <div className="flex items-end gap-1.5 h-[72px]">
        {days.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          const pct = volumes[i] / maxVol;
          const barH = volumes[i] > 0 ? Math.max(pct * 56, 8) : 2;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
                <div
                  className={`w-full rounded-t-[4px] transition-all duration-300 ${
                    isToday ? 'bg-brand' : volumes[i] > 0 ? 'bg-[#bfdbfe]' : 'bg-ui-2'
                  }`}
                  style={{ height: barH }}
                />
              </div>
              <p className={`font-pretendard text-[10px] leading-none ${isToday ? 'text-brand font-bold' : 'text-typo-alternative'}`}>
                {DAY_LABELS[day.getDay()]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
