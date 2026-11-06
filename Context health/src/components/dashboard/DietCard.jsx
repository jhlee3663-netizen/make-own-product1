import React, { useRef, useState } from 'react';
import { kcalBarGradient, kcalRange, kcalScale, kcalVerdict, kcalVerdictColor } from '../../lib/homeSummary';
import Pressable from '../common/Pressable';
import PressCard from '../common/PressCard';
import useDismiss from '../../lib/useDismiss';
import Toast from '../common/Toast';
import { shareText, buildDietShareText } from '../../utils/share';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const comma = value => Math.round(Number(value) || 0).toLocaleString();

const enteredCards = new Set();

export default function DietCard({ data, isDeleting, targetKcal, onDelete, onChangeDate, onCardClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [entering, setEntering] = useState(() => {
    const key = data.docId || data.id;
    if (!key || enteredCards.has(key)) return false;
    enteredCards.add(key);
    return true;
  });

  async function handleShare() {
    const result = await shareText('오늘의 식단', buildDietShareText(data));
    if (result === 'copied') {
      setToast({ show: true, message: '클립보드에 복사했어요' });
      setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
    } else if (result === 'failed') {
      setToast({ show: true, message: '공유에 실패했어요' });
      setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
    }
  }
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
  const ds = dt ? `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${WEEKDAYS[dt.getDay()]}` : (data.date || '');
  const kcal = Number(data.kcal || 0);
  /* 그 날짜에 쓰던 목표를 쓴다. 지금 프로필 목표를 끼얹으면 과거 달성률이 바뀐다. */
  const target = Number(data.goal || targetKcal || 0);
  const range = kcalRange(target);
  const scaleMax = kcalScale(target);
  const verdict = kcalVerdict(kcal, target);
  const pct = value => `${Math.min(100, (value / scaleMax) * 100)}%`;

  return (
    <div onAnimationEnd={() => setEntering(false)} className={`px-4 ${isDeleting ? 'card-exit-wrapper' : entering ? 'card-enter' : ''}`}>
      <PressCard
        onClick={() => onCardClick?.(data)}
        onLongPress={() => setMenuOpen(true)}
        radius={20}
        className="bg-white shadow-[0_2px_12px_rgba(3,27,38,0.05)] cursor-pointer"
      >
        {/* 홈의 섭취 칼로리 카드와 같은 모양 (Figma 1163:10037) — 라벨 자리에 날짜가 온다 */}
        <div className="px-4 py-[14px] flex flex-col gap-4">
          <div className="flex flex-col gap-8">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <p className="m-0 font-pretendard font-semibold text-[13px] leading-4 text-[#868e96] tracking-[-0.325px]">{ds}</p>
                <p className="m-0 flex items-end gap-1.5">
                  <span className="font-pretendard font-bold text-[26px] leading-[31px] text-[#171a1d] tracking-[-0.65px]">{comma(kcal)}</span>
                  <span className="font-pretendard text-[14px] leading-[22px] text-[#868e96] tracking-[-0.35px]">{target ? `/ ${comma(target)}kcal` : 'kcal'}</span>
                </p>
              </div>
              <div className="relative" ref={menuRef}>
                <Pressable
                  pressScale={0.85}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
                  className={`w-6 h-6 flex items-center justify-center rounded-full ${menuOpen ? 'bg-ui-2' : 'hover:bg-ui-2'}`}
                >
                  <svg width="20" height="4" viewBox="0 0 20 4" fill="none">
                    <circle cx="2" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="10" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="18" cy="2" r="2" fill="#ADB5BD"/>
                  </svg>
                </Pressable>
                {menuOpen && (
                  <>
                    <div className="absolute top-8 right-0 bg-white rounded-[12px] shadow-lg py-1 z-[99] min-w-[120px]" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleShare(); setMenuOpen(false); }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#171a1d] font-medium bg-none border-none text-left active:opacity-60 active:bg-ui-1 border-b border-ui-2"
                      >
                        🔗 공유하기
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (onChangeDate) onChangeDate(data); setMenuOpen(false); }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#171a1d] font-medium bg-none border-none text-left active:opacity-60 active:bg-ui-1 border-b border-ui-2"
                      >
                        📅 날짜 변경
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (onDelete) onDelete(data); setMenuOpen(false); }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#e03131] font-medium bg-none border-none text-left active:opacity-60 active:bg-[#fff5f5]"
                      >
                        🗑️ 삭제하기
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="relative h-[14px]">
                <span className="absolute left-0 right-0 top-[3px] h-2 rounded bg-[#f1f3f5]" />
                {range && <span className="absolute top-0 h-[14px] rounded bg-[rgba(113,113,255,0.2)]" style={{ left: pct(range.min), width: `calc(${pct(range.max)} - ${pct(range.min)})` }} />}
                {kcal > 0 && (
                  <span className="absolute left-0 top-[3px] h-2 overflow-hidden rounded" style={{ width: pct(kcal), minWidth: 8 }}>
                    <span className="chart-grow-x block w-full h-full rounded" style={{ background: kcalBarGradient(verdict?.tone) }} />
                  </span>
                )}
              </div>
              {/* 결과 문구는 적정 범위 표시의 가운데 아래에 둔다 */}
              {verdict && (
                <div className="relative h-[14px]">
                  <p
                    className="m-0 absolute top-0 -translate-x-1/2 whitespace-nowrap font-pretendard font-semibold text-[12px] leading-[14px] tracking-[-0.3px]"
                    style={{ left: `calc((${pct(range.min)} + ${pct(range.max)}) / 2)`, color: kcalVerdictColor(verdict.tone) }}
                  >
                    {verdict.text}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-4 font-pretendard text-[13px] leading-4 tracking-[-0.325px]">
            {[['탄수', data.carb], ['단백질', data.protein], ['지방', data.fat]].map(([label, value]) => (
              <span key={label} className="flex gap-1">
                <span className="text-[#868e96]">{label}</span>
                <span className="font-bold text-brand">{comma(value)}g</span>
              </span>
            ))}
          </div>
        </div>
      </PressCard>
      <Toast show={toast.show} message={toast.message} />
    </div>
  );
}
