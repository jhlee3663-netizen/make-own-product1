import React, { useEffect, useState } from 'react';
import { QuoteIcon } from '../icons/Icons';
import Pressable from '../common/Pressable';
import PressCard from '../common/PressCard';
import Toast from '../common/Toast';
import { formatCardioDuration } from '../../utils/utils';
import { shareText, buildWorkoutShareText } from '../../utils/share';

const enteredCards = new Set();

const WorkoutCard = ({ data, perfGrade = 'success', onCardClick, onDelete, onChangeDate, isDeleting, onRetryAI }) => {
  if (!data) return null;
  const [menuOpen, setMenuOpen] = useState(false);
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
  const ds = `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}`;

  const gid = "wc_" + (docId || "temp");

  return (
    <div onAnimationEnd={() => setEntering(false)} className={`px-4 py-2 ${isDeleting ? 'card-exit-wrapper' : entering ? 'card-enter' : ''}`}>
      <PressCard
        onClick={() => onCardClick(data)}
        className="bg-white shadow-[0_0_25px_rgba(3,27,38,0.08)] cursor-pointer"
      >
        {/* 눌리는 영역 안쪽 여백 8 + 영역 바깥 4 = 기존 카드 여백과 비슷한 12 (Figma 1158:9684) */}
        <div className="p-2 flex flex-col gap-4">
        <div className="flex flex-col gap-4">

          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className={`px-2 py-1 rounded-[8px] ${perfGrade === 'meh' ? 'bg-[#f07800]/10' : 'bg-[#7171FF]/10'}`}>
                <p className={`font-pretendard text-[13px] tracking-[-0.325px] whitespace-nowrap ${perfGrade === 'meh' ? 'text-[#f07800]' : 'text-[#7171FF]'}`}>
                  {perfGrade === 'meh' ? '아쉬워요 💭' : '성공 🔥'}
                </p>
              </div>
              <div className="relative">
                <Pressable
                  pressScale={0.85}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
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
                    <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="fixed inset-0 z-[98]" />
                    <div className="absolute top-8 right-0 bg-white rounded-[12px] shadow-lg py-1 z-[99] min-w-[120px]" onClick={e => e.stopPropagation()}>
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
              <p className="font-pretendard font-semibold text-[18px] text-[#171a1d] tracking-[-0.45px] m-0">
                {title}
              </p>
              <p className="font-pretendard text-[14px] text-[#646d76] tracking-[-0.35px] text-right m-0">
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
          <div className="border-t border-[#f1f3f5] px-4 py-3 flex gap-2 items-center">
            <div className="w-3 h-3 flex-none border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
            <p className="font-pretendard text-[13px] text-ui-4 tracking-[-0.3px] m-0">AI가 기록을 정리하고 있어요...</p>
          </div>
        ) : isError ? (
          <div className="border-t border-[#f1f3f5] px-4 py-3 flex gap-2 items-center justify-between">
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
          <div className="border-t border-[#f1f3f5] p-4 flex gap-2 items-start">
            <QuoteIcon gid={gid} />
            <div className="flex-1 mt-0.5 min-w-0">
              <p className="font-pretendard font-medium text-[14px] text-transparent bg-clip-text bg-gradient-to-r from-[#228bed] to-[#c509d6] tracking-[-0.35px] leading-[20px] m-0 truncate">
                {displayComment}
              </p>
            </div>
          </div>
        ) : null}
        </div>
      </PressCard>
      <Toast show={toast.show} message={toast.message} />
    </div>
  );
};

export default WorkoutCard;
