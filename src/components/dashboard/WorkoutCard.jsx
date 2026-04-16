import React, { useState } from 'react';
import { QuoteIcon } from '../icons/Icons';

const WorkoutCard = ({ data, onCardClick, onDelete, isDeleting }) => {
  if (!data) return null;
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    docId,
    title = "오늘의 운동",
    exercises = [],
    aiComment = "계획대로 완벽하게 했어요. 내일도 달려봅시다!" // 기본값 (Figma 동일)
  } = data;

  // 타임스탬프 포맷 (25. 1. 9)
  const dt = data.timestamp ? new Date(data.timestamp.seconds * 1000) : new Date();
  const ds = `${String(dt.getFullYear()).slice(2)}. ${dt.getMonth() + 1}. ${dt.getDate()}`;

  const gid = "wc_" + (docId || "temp");

  return (
    <div className={`px-4 py-2 transition-all duration-300 ${isDeleting ? 'card-exit-wrapper' : 'card-enter'}`}>
      <div 
        onClick={() => onCardClick(data)}
        className="bg-white rounded-[16px] shadow-[0_0_25px_rgba(3,27,38,0.08)] cursor-pointer border border-transparent hover:border-ui-3 transition-transform duration-200 active:scale-[0.98] overflow-hidden"
      >
        <div className="p-4 flex flex-col gap-4">
          
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="bg-[#0054d1]/10 px-2 py-1 rounded-[8px]">
                <p className="font-pretendard text-[13px] text-[#0054d1] tracking-[-0.325px] whitespace-nowrap">
                  성공 🔥
                </p>
              </div>
              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }} 
                  className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${menuOpen ? 'bg-ui-2' : 'hover:bg-ui-2'}`}
                >
                  <svg width="20" height="4" viewBox="0 0 20 4" fill="none">
                    <circle cx="2" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="10" cy="2" r="2" fill="#ADB5BD"/>
                    <circle cx="18" cy="2" r="2" fill="#ADB5BD"/>
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="fixed inset-0 z-[98]" />
                    <div className="absolute top-8 right-0 bg-white rounded-[12px] shadow-lg py-1 z-[99] min-w-[120px]" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => {
                          if (onDelete) onDelete(docId);
                          setMenuOpen(false);
                        }}
                        className="flex w-full px-4 py-[10px] text-body-s text-[#e03131] font-medium bg-none border-none text-left"
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

          {/* Exercise Items (Horizontal Scroll) */}
          <div className="exercise-scroll pb-1">
            {exercises.length > 0 ? (
              exercises.map((ex, i) => (
                <div key={i} className="bg-[#f1f3f5] rounded-[16px] p-2 flex flex-col items-center gap-2 shrink-0 w-[80px]">
                  <div className="bg-white h-[48px] w-full rounded-[8px] flex items-center justify-center overflow-hidden">
                    {ex.thumbnail ? (
                      <img src={ex.thumbnail} alt={ex.name} className="w-full h-full object-cover" />
                    ) : (
                      null
                    )}
                  </div>
                  <p className="font-pretendard font-medium text-[14px] text-[#495057] tracking-[-0.35px] text-center w-full truncate">
                    {ex.name}
                  </p>
                </div>
              ))
            ) : (
              // 빈 상태일 경우 시안대로 더미 카드를 보여주거나 안내 메시지 표시
              <>
                <div className="bg-[#f1f3f5] rounded-[16px] p-2 flex flex-col items-center gap-2 shrink-0 w-[80px]">
                  <div className="bg-white h-[48px] w-full rounded-[8px]" />
                  <p className="font-pretendard font-medium text-[14px] text-[#495057] tracking-[-0.35px] text-center w-full truncate">운동 종목</p>
                </div>
                <div className="bg-[#f1f3f5] rounded-[16px] p-2 flex flex-col items-center gap-2 shrink-0 w-[80px]">
                  <div className="bg-white h-[48px] w-full rounded-[8px]" />
                  <p className="font-pretendard font-medium text-[14px] text-[#495057] tracking-[-0.35px] text-center w-full truncate">운동 종목</p>
                </div>
                <div className="bg-[#f1f3f5] rounded-[16px] p-2 flex flex-col items-center gap-2 shrink-0 w-[80px]">
                  <div className="bg-white h-[48px] w-full rounded-[8px]" />
                  <p className="font-pretendard font-medium text-[14px] text-[#495057] tracking-[-0.35px] text-center w-full truncate">운동 종목</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* AI Comment Section */}
        {aiComment && (
          <div className="border-t border-[#f1f3f5] p-4 flex gap-2 items-start bg-white">
            <QuoteIcon gid={gid} />
            <div className="flex-1 mt-0.5 min-w-0">
              <p className="font-pretendard font-medium text-[14px] text-transparent bg-clip-text bg-gradient-to-r from-[#228bed] to-[#c509d6] tracking-[-0.35px] leading-[20px] m-0 truncate">
                {aiComment}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkoutCard;
