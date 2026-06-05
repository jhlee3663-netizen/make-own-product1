import React, { useState } from 'react';
import { QuoteIcon } from '../icons/Icons';
import Pressable from '../common/Pressable';


const WorkoutCard = ({ data, onCardClick, onDelete, onChangeDate, isDeleting, onRetryAI }) => {
  if (!data) return null;
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    docId,
    title = "오늘의 운동",
    exercises = [],
    aiComment,
    aiStatus,
    aiError,
  } = data;
  const isProcessing = aiStatus === 'processing' || aiStatus === 'summarized';
  const isError = aiStatus === 'error';

  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  const ds = `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}`;

  const gid = "wc_" + (docId || "temp");

  return (
    <div className={`px-4 py-2 transition-all duration-300 ${isDeleting ? 'card-exit-wrapper' : 'card-enter'}`}>
      <Pressable
        as="div"
        pressScale={0.985}
        onClick={() => onCardClick(data)}
        className="bg-white rounded-[16px] shadow-[0_0_25px_rgba(3,27,38,0.08)] cursor-pointer border border-transparent hover:border-ui-3 overflow-hidden"
      >
        <div className="p-4 flex flex-col gap-4">

          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="bg-[#3476EE]/10 px-2 py-1 rounded-[8px]">
                <p className="font-pretendard text-[13px] text-[#3476EE] tracking-[-0.325px] whitespace-nowrap">
                  성공 🔥
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
          <div className="border-t border-[#f1f3f5] px-4 py-3 flex gap-2 items-center bg-white">
            <div className="w-3 h-3 flex-none border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
            <p className="font-pretendard text-[13px] text-ui-4 tracking-[-0.3px] m-0">AI가 기록을 정리하고 있어요...</p>
          </div>
        ) : isError ? (
          <div className="border-t border-[#f1f3f5] px-4 py-3 flex gap-2 items-center justify-between bg-white">
            <p className="font-pretendard text-[13px] text-[#e03e52] tracking-[-0.3px] m-0 flex-1 truncate">AI 정리 실패 {aiError ? `(${aiError})` : ''}</p>
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
        ) : aiComment ? (
          <div className="border-t border-[#f1f3f5] p-4 flex gap-2 items-start bg-white">
            <QuoteIcon gid={gid} />
            <div className="flex-1 mt-0.5 min-w-0">
              <p className="font-pretendard font-medium text-[14px] text-transparent bg-clip-text bg-gradient-to-r from-[#228bed] to-[#c509d6] tracking-[-0.35px] leading-[20px] m-0 truncate">
                {aiComment}
              </p>
            </div>
          </div>
        ) : null}
      </Pressable>
    </div>
  );
};

export default WorkoutCard;
