import React from 'react';
import { formatCardioDuration, getCurrentWeekDays } from '../../utils/utils';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function WeeklyVolumeChart({ workoutLogs }) {
  const today = new Date();
  const days = getCurrentWeekDays();

  const volumes = days.map(day => {
    const ds = day.toDateString();
    return workoutLogs
      .filter(log => {
        const ld = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
        return ld && ld.toDateString() === ds;
      })
      .reduce((sum, log) => sum + (log.totalVolume || 0), 0);
  });

  const cardioMinutes = days.map(day => {
    const ds = day.toDateString();
    return workoutLogs
      .filter(log => {
        const ld = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
        return ld && ld.toDateString() === ds;
      })
      .reduce((sum, log) => sum + (log.cardioMinutes || 0), 0);
  });

  const weekTotal = volumes.reduce((a, b) => a + b, 0);
  const weekCardio = cardioMinutes.reduce((a, b) => a + b, 0);
  const maxVol = Math.max(...volumes, 1);
  const maxCardio = Math.max(...cardioMinutes, 1);

  return (
    <div className="mx-4 mt-4 mb-1 bg-white rounded-[20px] border border-ui-2 shadow-[0_0_20px_rgba(3,27,38,0.07)] px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-4">
        <p className="font-pretendard font-bold text-body-s text-typo-strong tracking-[-0.35px]">이번 주 볼륨</p>
        <div className="flex flex-col items-end gap-0.5">
          <p className="font-pretendard text-caption-l text-brand font-semibold tracking-[-0.3px]">
            총 {weekTotal.toLocaleString()}kg
          </p>
          {weekCardio > 0 && (
            <p className="font-pretendard text-[11px] text-state-success font-semibold tracking-[-0.25px]">
              유산소 {formatCardioDuration(weekCardio)}
            </p>
          )}
        </div>
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
                    isToday ? 'bg-brand' : volumes[i] > 0 ? 'bg-[#d4d4ff]' : 'bg-ui-2'
                  }`}
                  style={{ height: barH }}
                />
              </div>
              <p className={`font-pretendard text-[10px] leading-none ${isToday ? 'text-brand font-bold' : 'text-typo-alternative'}`}>
                {DAY_LABELS[i]}
              </p>
            </div>
          );
        })}
      </div>
      {weekCardio > 0 && (
        <div className="flex items-end gap-1.5 h-[18px] mt-2">
          {days.map((day, i) => {
            const pct = cardioMinutes[i] / maxCardio;
            const barH = cardioMinutes[i] > 0 ? Math.max(pct * 14, 4) : 2;
            return (
              <div key={day.toDateString()} className="flex-1 flex items-end justify-center">
                <div
                  className={`w-full rounded-full ${cardioMinutes[i] > 0 ? 'bg-state-success' : 'bg-ui-2'}`}
                  style={{ height: barH, opacity: cardioMinutes[i] > 0 ? 0.75 : 1 }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
