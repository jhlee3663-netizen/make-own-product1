import React, { useRef, useEffect, useState } from 'react';
import Pressable from '../common/Pressable';
import PressCard from '../common/PressCard';
import useDismiss from '../../lib/useDismiss';
import Toast from '../common/Toast';
import { formatCardioDuration } from '../../utils/utils';
import { shareText, buildWorkoutShareText } from '../../utils/share';

const enteredCards = new Set();

const WorkoutCard = ({ data, perfGrade = 'success', highlight = false, onCardClick, onDelete, onChangeDate, isDeleting, onRetryAI }) => {
  if (!data) return null;
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
    const result = await shareText(data.title || '오늘의 운동', buildWorkoutShareText(data));
    if (result === 'copied') {
      setToast({ show: true, message: '클립보드에 복사했어요' });
      setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
    } else if (result === 'failed') {
      setToast({ show: true, message: '공유에 실패했어요' });
      setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
    }
  }

  const {
    docId,
    title = "오늘의 운동",
    exercises = [],
    aiComment,
    overloadMsg,
    totalVolume,
    cardioMinutes,
    aiStatus,
    aiError,
    aiStartedAt,
  } = data;
  const rawProcessing = aiStatus === 'processing' || aiStatus === 'summarized';
  const processingStartedMs = aiStartedAt?.toMillis?.()
    || (aiStartedAt?.seconds ? aiStartedAt.seconds * 1000 : 0)
    || (data.timestamp?.seconds ? data.timestamp.seconds * 1000 : 0);
  const [statusClock, setStatusClock] = useState(Date.now());
  useEffect(() => {
    if (!rawProcessing) return undefined;
    const timer = window.setInterval(() => setStatusClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [rawProcessing]);
  const isStaleProcessing = rawProcessing && processingStartedMs > 0 && statusClock - processingStartedMs >= 120000;
  const isProcessing = rawProcessing && !isStaleProcessing;
  const cardioComment = totalVolume === 0 && cardioMinutes > 0
    ? `오늘 유산소 ${formatCardioDuration(cardioMinutes)} 기록!`
    : '';
  const displayComment = aiComment || overloadMsg || (totalVolume > 0 ? `오늘 볼륨 ${Number(totalVolume).toLocaleString()}kg 기록 완료!` : cardioComment);
  const isError = isStaleProcessing || (aiStatus === 'error' && !displayComment);

  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  // 올해 기록은 월·일만, 지난 해 기록은 연도까지 보여준다
  const ds = `${dt.getFullYear() === new Date().getFullYear() ? '' : `${String(dt.getFullYear()).slice(2)}. `}${dt.getMonth() + 1}. ${dt.getDate()}`;


  return (
    <div onAnimationEnd={() => setEntering(false)} className={`px-4 ${isDeleting ? 'card-exit-wrapper' : entering ? 'card-enter' : ''}`}>
      {/* 고른 날짜의 기록은 그라데이션 테두리로 구분한다 (Figma 1163:12392) */}
      <div className="rounded-[20px] shadow-[0_2px_12px_rgba(3,27,38,0.05)]" style={highlight ? { padding: 1, background: 'linear-gradient(100deg, #7171FF, #f79fff)' } : undefined}>
      <PressCard
        onClick={() => onCardClick(data)}
        onLongPress={() => setMenuOpen(true)}
        radius={highlight ? 19 : 20}
        className="bg-white cursor-pointer"
      >
        {/* 흰 선 4 + 안쪽 여백 = 내용은 카드 가장자리에서 좌우 20, 위아래 18 */}
        <div className="px-4 py-[14px] flex flex-col gap-3">
        <div className="flex flex-col gap-3">

          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className={`px-[10px] py-1 rounded-full ${perfGrade === 'meh' ? 'bg-[#f1f3f5]' : 'bg-[#7171FF]/10'}`}>
                <p className={`font-pretendard font-semibold text-[12px] leading-[14px] tracking-[-0.3px] whitespace-nowrap ${perfGrade === 'meh' ? 'text-[#868e96]' : 'text-[#7171FF]'}`}>
                  {perfGrade === 'meh' ? '아쉬워요 💭' : '성공 🔥'}
                </p>
              </div>
              <div className="relative" ref={menuRef}>
                {menuOpen && (
                  <>
                    <div className="absolute top-0 right-0 bg-white rounded-[12px] shadow-lg py-1 z-[99] min-w-[120px]" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare();
                          setMenuOpen(false);
                        }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#171a1d] font-medium bg-none border-none text-left active:opacity-60 active:bg-ui-1 border-b border-ui-2"
                      >
                        🔗 공유하기
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onChangeDate) onChangeDate(data);
                          setMenuOpen(false);
                        }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#171a1d] font-medium bg-none border-none text-left active:opacity-60 active:bg-ui-1 border-b border-ui-2"
                      >
                        📅 날짜 변경
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDelete) onDelete(data);
                          setMenuOpen(false);
                        }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#e03131] font-medium bg-none border-none text-left active:opacity-60 active:bg-[#fff5f5]"
                      >
                        🗑️ 삭제하기
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="font-pretendard font-bold text-[18px] leading-[22px] text-[#171a1d] tracking-[-0.45px] m-0 min-w-0 truncate">
                {title}
              </p>
              <p className="flex-none pl-3 font-pretendard text-[13px] text-[#868e96] tracking-[-0.325px] text-right m-0">
                {ds}
              </p>
            </div>
          </div>

          {/* Exercise Items (Horizontal Scroll — 칩 스타일) */}
          <div className="exercise-scroll pb-1">
            {exercises.length > 0 ? (
              exercises.map((ex, i) => (
                <div key={i} className="bg-[#f1f3f5] px-3 py-1.5 rounded-full shrink-0">
                  <p className="font-pretendard font-medium text-[13px] text-[#495057] tracking-[-0.3px] whitespace-nowrap m-0">
                    {ex.name}
                  </p>
                </div>
              ))
            ) : null}
          </div>
        </div>

        {/* AI Comment Section */}
        {isProcessing ? (
          <div className="border-t border-[#f1f3f5] pt-3 flex gap-2 items-center">
            <div className="w-3 h-3 flex-none border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
            <p className="font-pretendard text-[13px] text-ui-4 tracking-[-0.3px] m-0">AI가 기록을 정리하고 있어요...</p>
          </div>
        ) : isError ? (
          <div className="border-t border-[#f1f3f5] pt-3 flex gap-2 items-center justify-between">
            <p className="font-pretendard text-[13px] text-[#e03e52] tracking-[-0.3px] m-0 flex-1 truncate">
              {isStaleProcessing ? 'AI 정리가 중단됐어요' : `AI 정리 실패 ${aiError ? `(${aiError})` : ''}`}
            </p>
            {onRetryAI && (
              <Pressable
                pressScale={0.92}
                onClick={(e) => { e.stopPropagation(); onRetryAI(data); }}
                className="flex-none text-[12px] font-semibold text-brand bg-brand/10 px-2 py-1 rounded-full"
              >
                재시도
              </Pressable>
            )}
          </div>
        ) : displayComment ? (
          <div className="border-t border-[#f1f3f5] pt-3">
            <p className="font-pretendard font-semibold text-[13px] leading-4 text-[#7171FF] tracking-[-0.325px] m-0 truncate">
              {displayComment}
            </p>
          </div>
        ) : null}
        </div>
      </PressCard>
      </div>
      <Toast show={toast.show} message={toast.message} />
    </div>
  );
};

export default WorkoutCard;
