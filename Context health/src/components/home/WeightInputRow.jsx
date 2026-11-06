import React, { useEffect, useState } from 'react';
import { loadMorningWeight, saveMorningWeight } from '../../lib/bodyLogs';

/* 아침 공복 체중 한 줄. 기록이 없으면 입력칸, 저장했으면 넣은 숫자를 그대로 보여준다.
   (저장하고 줄이 사라지면 "내가 뭘 넣었는지" 확인할 곳이 없었다 — 사용자 피드백)
   숫자를 누르면 다시 고칠 수 있다. 지난 기록 전체를 보는 곳은 마이페이지다. */
export default function WeightInputRow({ uid, dateKey }) {
  const [status, setStatus] = useState('loading'); // loading | empty | editing | saving | saved | error
  const [weight, setWeight] = useState(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    setStatus('loading');
    setInput('');
    setWeight(null);
    loadMorningWeight(uid, dateKey)
      .then((value) => {
        if (cancelled) return;
        setWeight(value != null ? value : null);
        setStatus(value != null ? 'saved' : 'empty');
      })
      .catch(() => { if (!cancelled) setStatus('empty'); });
    return () => { cancelled = true; };
  }, [uid, dateKey]);

  const parsed = Number(input);
  const valid = input.trim() !== '' && Number.isFinite(parsed) && parsed >= 20 && parsed <= 300;

  async function save() {
    if (status === 'saving') return;
    if (!valid) { // 고치려고 열었다가 그냥 나가면 원래 값으로 되돌린다
      if (weight != null) { setStatus('saved'); setInput(''); }
      return;
    }
    const next = Math.round(parsed * 10) / 10;
    setStatus('saving');
    try {
      await saveMorningWeight(uid, dateKey, next);
      setWeight(next);
      setInput('');
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'loading') return null;

  const showValue = status === 'saved' && weight != null;

  return (
    <div className="px-4">
      <div className="bg-white rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-pretendard font-medium text-[14px] leading-5 text-[#495057] tracking-[-0.35px]">아침 공복 체중</p>
          {showValue ? (
            <button
              type="button"
              onClick={() => { setInput(String(weight)); setStatus('editing'); }}
              aria-label={`아침 공복 체중 ${weight}kg, 고치기`}
              className="flex items-center gap-1 px-2 py-1 -mr-2 rounded-lg active:opacity-50"
            >
              <span className="font-pretendard font-bold text-[15px] text-[#171a1d] tracking-[-0.375px]">{weight}</span>
              <span className="font-pretendard text-[12px] text-[#868e96] tracking-[-0.3px]">kg</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                autoFocus={status === 'editing'}
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
          )}
        </div>
        {status === 'error' && (
          <p role="alert" className="mt-2 font-pretendard text-[12px] text-[#e03e52] tracking-[-0.3px]">저장하지 못했어요. 다시 입력해주세요.</p>
        )}
      </div>
    </div>
  );
}
