import React, { useEffect, useState } from 'react';
import MorningWeightRow from './MorningWeightRow';
import { listMorningWeights, localDateKey } from '../../lib/bodyLogs';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/* 마이페이지의 체중 기록: 날짜별 목록 + 수정/삭제. 목록의 날짜를 누르면 위 입력줄에 불러온다. */
export default function WeightHistorySection({ uid }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !uid) return undefined;
    let cancelled = false;
    setStatus('loading');
    listMorningWeights(uid)
      .then((items) => {
        if (cancelled) return;
        setLogs(items);
        setStatus('idle');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [open, uid, reloadKey]);

  return (
    <div className="bg-white mt-3 px-5">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full py-4">
        <span className="font-pretendard font-medium text-body-s text-typo-normal tracking-[-0.35px]">체중 기록</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path d="M9 18l6-6-6-6" stroke="#adb5bd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="pb-4">
          <MorningWeightRow
            key={selectedDate}
            uid={uid}
            initialDate={selectedDate}
            onSaved={() => setReloadKey(k => k + 1)}
            className=""
          />
          <p className="mt-2 font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
            날짜를 골라 수정할 수 있어요. 값을 비우고 저장하면 삭제돼요.
          </p>

          {status === 'loading' && logs.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-ui-3 border-t-brand rounded-full animate-spin" />
            </div>
          ) : status === 'error' ? (
            <p role="alert" className="text-center font-pretendard text-caption-l text-[#e03e52] py-8 tracking-[-0.325px]">기록을 불러오지 못했어요.</p>
          ) : logs.length === 0 ? (
            <p className="text-center font-pretendard text-caption-l text-typo-alternative py-8 tracking-[-0.325px]">아직 기록이 없습니다</p>
          ) : (
            <ul className="mt-3 divide-y divide-ui-2">
              {logs.map((log, index) => {
                const prev = logs[index + 1];
                const diff = prev ? Math.round((log.weightKg - prev.weightKg) * 10) / 10 : null;
                return (
                  <li key={log.date}>
                    <button
                      onClick={() => setSelectedDate(log.date)}
                      className="flex items-center justify-between w-full py-3 text-left"
                    >
                      <span className="font-pretendard text-body-s text-typo-normal tracking-[-0.35px]">{formatDate(log.date)}</span>
                      <span className="flex items-center gap-2">
                        {diff !== null && diff !== 0 && (
                          <span className="font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        )}
                        <span className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">{log.weightKg.toFixed(1)}kg</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
