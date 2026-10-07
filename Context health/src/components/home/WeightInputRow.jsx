import React, { useEffect, useState } from 'react';
import { loadMorningWeight, saveMorningWeight } from '../../lib/bodyLogs';

/* 아침 공복 체중 입력 한 줄. 고른 날짜에 기록이 없을 때만 보이고, 저장하면 사라진다.
   지난 기록을 보거나 고치는 곳은 마이페이지다. */
export default function WeightInputRow({ uid, dateKey }) {
  const [status, setStatus] = useState('loading'); // loading | empty | saving | saved | error
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    setStatus('loading');
    setInput('');
    loadMorningWeight(uid, dateKey)
      .then((value) => { if (!cancelled) setStatus(value != null ? 'saved' : 'empty'); })
      .catch(() => { if (!cancelled) setStatus('empty'); });
    return () => { cancelled = true; };
  }, [uid, dateKey]);

  const parsed = Number(input);
  const valid = input.trim() !== '' && Number.isFinite(parsed) && parsed >= 20 && parsed <= 300;

  async function save() {
    if (!valid || status === 'saving') return;
    setStatus('saving');
    try {
      await saveMorningWeight(uid, dateKey, Math.round(parsed * 10) / 10);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'loading' || status === 'saved') return null;

  return (
    <div className="px-4">
      <div className="bg-white rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-pretendard font-medium text-[14px] leading-5 text-[#495057] tracking-[-0.35px]">아침 공복 체중</p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              value={input}
              onChange={event => { setInput(event.target.value.replace(/[^0-9.]/g, '').slice(0, 5)); if (status === 'error') setStatus('empty'); }}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              onBlur={save}
              disabled={status === 'saving'}
              aria-label="아침 공복 체중 (kg)"
              className="w-14 h-7 rounded-lg border border-brand bg-[#f8f9fa] text-center font-pretendard font-semibold text-[13px] text-[#171a1d] tracking-[-0.325px] outline-none"
            />
            <span className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px]">kg</span>
          </div>
        </div>
        {status === 'error' && (
          <p role="alert" className="mt-2 font-pretendard text-[12px] text-[#e03e52] tracking-[-0.3px]">저장하지 못했어요. 다시 입력해주세요.</p>
        )}
      </div>
    </div>
  );
}
