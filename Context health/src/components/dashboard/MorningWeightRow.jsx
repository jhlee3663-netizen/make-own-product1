import React, { useEffect, useState } from 'react';
import Pressable from '../common/Pressable';
import { deleteMorningWeight, loadMorningWeight, localDateKey, saveMorningWeight } from '../../lib/bodyLogs';

/* 아침 공복 체중 입력 한 줄.
   todayOnly(홈): 오늘 기록이 없을 때만 보이고 저장하면 사라진다. 지난 기록은 마이페이지에서 본다.
   그 외(마이페이지): 날짜를 바꿔 그날 기록을 불러와 수정/삭제한다. */
export default function MorningWeightRow({ uid, todayOnly = false, initialDate, onSaved, className = 'mx-4 mt-4 mb-1' }) {
  const today = localDateKey();
  const [dateKey, setDateKey] = useState(initialDate || today);
  const [saved, setSaved] = useState(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('loading'); // loading | idle | saving | error

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    setStatus('loading');
    loadMorningWeight(uid, dateKey)
      .then((value) => {
        if (cancelled) return;
        setSaved(value);
        setInput(value != null ? String(value) : '');
        setStatus('idle');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [uid, dateKey]);

  const parsed = Number(input);
  const valid = input.trim() !== '' && Number.isFinite(parsed) && parsed >= 20 && parsed <= 300;
  const cleared = input.trim() === '' && saved != null;
  const changed = cleared || (valid && parsed !== saved);

  async function handleSave() {
    if (!changed || status === 'saving') return;
    setStatus('saving');
    try {
      if (cleared) {
        await deleteMorningWeight(uid, dateKey);
        setSaved(null);
      } else {
        const value = Math.round(parsed * 10) / 10;
        await saveMorningWeight(uid, dateKey, value);
        setSaved(value);
        setInput(String(value));
      }
      setStatus('idle');
      onSaved?.();
    } catch {
      setStatus('error');
    }
  }

  if (todayOnly && (status === 'loading' || saved != null)) return null;

  return (
    <div className={`${className} bg-white rounded-2xl border border-ui-2 shadow-card px-4 py-3`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-pretendard font-semibold text-body-s text-typo-strong tracking-[-0.35px]">아침 공복 체중</p>
          {todayOnly ? (
            <p className="mt-0.5 font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px]">오늘 한 번만 기록해요</p>
          ) : (
            <input
              type="date"
              value={dateKey}
              max={today}
              onChange={e => e.target.value && setDateKey(e.target.value)}
              aria-label="측정 날짜"
              className="mt-0.5 bg-transparent font-pretendard text-caption-m text-typo-alternative tracking-[-0.3px] outline-none"
            />
          )}
        </div>
        <div className="flex items-center gap-1 bg-ui-1 rounded-xl px-3 h-10 border border-ui-3 focus-within:border-brand transition-colors">
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={e => setInput(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder={status === 'loading' ? '…' : '0.0'}
            disabled={status === 'loading'}
            aria-label="아침 공복 체중 (kg)"
            className="w-14 bg-transparent text-right font-pretendard font-semibold text-body-s text-typo-strong outline-none"
          />
          <span className="font-pretendard text-caption-l text-typo-alternative">kg</span>
        </div>
        <Pressable
          pressScale={0.95}
          onClick={handleSave}
          disabled={!changed || status === 'saving'}
          className="h-10 px-4 bg-brand rounded-xl font-pretendard font-bold text-caption-l text-white tracking-[-0.3px] disabled:opacity-30"
        >
          {status === 'saving' ? '저장 중' : saved != null && !changed ? '저장됨' : '저장'}
        </Pressable>
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-2 font-pretendard text-caption-m text-[#e03e52]">불러오거나 저장하지 못했어요. 다시 시도해주세요.</p>
      )}
    </div>
  );
}
